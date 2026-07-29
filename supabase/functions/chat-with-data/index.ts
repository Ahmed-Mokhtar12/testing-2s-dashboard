
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { analyzeQueryIntelligently } from './query-analyzer.ts';
import { fetchDashboardSnapshot } from './context-data-fetcher.ts';
import { EnhancedContextBuilder } from './enhanced-context-builder.ts';
import { callOpenAI } from './openai-service.ts';
import { ConversationContextAnalyzer } from './conversation-context-analyzer.ts';
import { SystemPromptBuilder } from './system-prompt-builder.ts';
import { EnhancedErrorHandler } from './enhanced-error-handler.ts';
import { ConversationSessionManager } from './conversation-session-manager.ts';
import { PerformanceMonitor } from './performance-monitor.ts';
import { SmartResponseValidator } from './smart-response-validator.ts';
import { ResponseCompletenessEngine } from './response-completeness-engine.ts';
import { DataAvailabilityChecker } from './data-availability-checker.ts';
import { getCallerEmail } from '../_shared/auth.ts';
import { QUERY_TOOL_NAMES } from './function-call-handler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth gate: only signed-in dashboard users (hotel staff) may consult Sera.
  // verify_jwt=true already rejects requests without a valid project JWT, but
  // the public anon key passes that check — this resolves the JWT to a real
  // auth user, exactly like the sp-* functions.
  const callerEmail = await getCallerEmail(req);
  if (!callerEmail) {
    return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Hoist these so they remain accessible in the catch block for error logging
  let message: string | undefined;
  let messageId: string | undefined;
  let sessionId: string | undefined;
  let userHistory: any = null;

  try {
    PerformanceMonitor.startTimer('total_request');
    console.log('🚀 Enhanced chat-with-data function starting...');
    const body = await req.json();
    message = body.message;
    messageId = body.messageId;
    sessionId = body.sessionId;

    console.log('📩 Received message:', { message, messageId, sessionId });

    // User-scoped client: anon key + the caller's JWT, so every query runs
    // under the caller's identity and RLS applies (no service-role bypass).
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    if (!Deno.env.get('SUPABASE_URL') || !Deno.env.get('SUPABASE_ANON_KEY')) {
      throw new Error('Supabase configuration missing');
    }

    // Enhanced conversation context retrieval with session support
    console.log('📚 Retrieving conversation history for session:', sessionId);
    const { data: history, error: historyError } = await supabase
      .from('2s-dashboard_AI_Chat')
      .select('*')
      .eq('session_id', sessionId || 'guest')
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(30); // Last 15 exchanges (user + AI pairs)
    userHistory = history;

    if (historyError) {
      console.warn('⚠️ Error retrieving conversation history:', historyError);
    }

    // Enhanced conversation analysis with persistent context
    const conversationData = ConversationContextAnalyzer.analyzeConversationHistory(userHistory);
    console.log('🧠 Conversation context:', {
      dataPoints: conversationData.recentDataPoints.size,
      focusAreas: conversationData.userPreferences.focusAreas,
      style: conversationData.userPreferences.communicationStyle
    });

    // Intelligent query analysis
    const queryAnalysis = analyzeQueryIntelligently(message);
    console.log('🧠 Intelligent query analysis:', queryAnalysis);

    // Enhanced data gathering with enhanced context builder
    console.log('📚 Building enhanced context with document integration...');
    
    // Get all available data for context building: real dashboard tables,
    // scoped to whatever date range the question implies.
    const snapshot = await fetchDashboardSnapshot(supabase, queryAnalysis);
    console.log('📊 Snapshot counts:', Object.fromEntries(Object.entries(snapshot).filter(([k]) => k !== 'errors').map(([k, v]: any) => [k, v.count])));
    if (snapshot.errors.length) console.warn('⚠️ Snapshot errors:', snapshot.errors);

    // Recently uploaded document context (RPC exists live; the old
    // `uploaded_documents` metadata table it was paired with does not).
    let documentContext: any[] = [];
    try {
      const { data, error } = await supabase.rpc('get_recent_document_context', { limit_count: 10 });
      if (error) {
        console.warn('⚠️ Document context error:', error);
      } else {
        documentContext = data ?? [];
      }
    } catch (error) {
      console.warn('⚠️ Document context fetch failed:', error);
    }

    // Query-specific analytics (e.g. review_summary/monthly_data) are not
    // produced by analyzeQueryIntelligently — it never returns those types —
    // so this stays null. Downstream honesty/validation/completeness calls
    // already treat a null specificData as "no bespoke analytics available".
    const specificData = null;

    // Build enhanced context using the enhanced context builder
    const enhancedContextBuilder = new EnhancedContextBuilder();
    const context = enhancedContextBuilder.buildContextWithDocuments({ ...snapshot, documentContext }, message);

    console.log('✅ Enhanced context built with document integration');

    // Build enhanced system prompt with conversation continuity
    const consultantPrompt = SystemPromptBuilder.buildConsultantPrompt(conversationData);
    
    // 🎯 DATA AVAILABILITY ASSESSMENT
    console.log('🔍 Assessing data availability...');
    const dataAvailability = DataAvailabilityChecker.assessDataAvailability(message, { ...snapshot, documentContext });
    console.log('📊 Data availability assessment:', {
      canAnswer: dataAvailability.canAnswerCompletely,
      available: dataAvailability.availableDataSources,
      missing: dataAvailability.missingDataSources,
      confidence: dataAvailability.confidenceLevel
    });

    // 🤖 HONEST AI RESPONSE WITH DATA INTEGRITY
    console.log('🤖 Calling OpenAI with honest data-aware context...');
    let aiChoice = await callOpenAI(context, message, consultantPrompt, authHeader);
    
    // 🔥 CRITICAL: Apply Data Honesty Engine to prevent fabrication.
    // Skipped when the answer was computed by a domain query tool (training,
    // WhatsApp, …) — those numbers come from the database, and the
    // fabrication regexes (e.g. /booking.*\d+/) misfire on business wording
    // around them.
    const usedQueryTool = aiChoice.executedTools?.some((t: string) => QUERY_TOOL_NAMES.includes(t));
    if (usedQueryTool) {
      console.log('🎓 Skipping Data Honesty Engine — answer built from a query-tool result');
    } else {
      console.log('🔧 Applying Data Honesty Engine...');
      aiChoice = await ResponseCompletenessEngine.enforceDataHonesty(
        aiChoice,
        message,
        conversationData,
        specificData,
        context,
        consultantPrompt,
        // Keep the caller's JWT on regenerated calls so tools stay user-scoped
        (c: string, m: string, p?: string) => callOpenAI(c, m, p, authHeader)
      );
    }
    
    // Enhanced validation with data utilization scoring
    const validationResult = SmartResponseValidator.validateAIResponse(
      aiChoice, 
      message, 
      conversationData, 
      specificData
    );
    
    console.log('📊 Intelligence metrics:', {
      dataUtilization: validationResult.dataUtilizationScore,
      validationPassed: validationResult.isValid,
      issues: validationResult.issues.length
    });
    
    SmartResponseValidator.logValidationResults(validationResult, {
      conversationData,
      userMessage: message,
      response: aiChoice
    });
    
    // Final enhancement with interactive elements
    if (aiChoice.message?.content) {
      aiChoice.message.content = ResponseCompletenessEngine.addInteractiveElements(
        aiChoice.message.content,
        specificData,
        message
      );
    }
    
    console.log('🤖 OpenAI response structure:', {
      hasContent: !!aiChoice.message?.content,
      hasToolCalls: !!aiChoice.message?.tool_calls,
      toolCallCount: aiChoice.message?.tool_calls?.length || 0,
      validationPassed: validationResult.isValid
    });
    
    let response: any = {
      messageId,
      timestamp: new Date().toISOString(),
      consultant: 'Two Seasons Hotel AI Consultant (Enhanced)',
      sessionId: sessionId,
      queryAnalysis: {
        type: queryAnalysis.type,
        description: queryAnalysis.description,
        dataPoints: specificData?.reviews?.length || specificData?.analytics?.totalReviews || 'general',
        hasConversationContext: conversationData.recentDataPoints.size > 0,
        communicationStyle: conversationData.userPreferences.communicationStyle
      }
    };

    // Check if AI wants to perform an action
    if (aiChoice.message.tool_calls && aiChoice.message.tool_calls.length > 0) {
      console.log('🎯 AI detected action intent:', aiChoice.message.tool_calls[0]);
      
      const toolCall = aiChoice.message.tool_calls[0];
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);
      
      // Create action data based on function call
      let actionData: any = {
        message: functionArgs.message
      };

      switch (functionName) {
        case 'send_email':
          actionData = {
            type: 'email',
            recipient: functionArgs.recipient,
            subject: functionArgs.subject,
            message: functionArgs.message
          };
          break;
        case 'send_sms':
          actionData = {
            type: 'sms',
            phoneNumber: functionArgs.phoneNumber,
            message: functionArgs.message
          };
          break;
        case 'send_whatsapp':
          actionData = {
            type: 'whatsapp',
            phoneNumber: functionArgs.phoneNumber,
            message: functionArgs.message
          };
          break;
      }

      response = {
        ...response,
        response: aiChoice.message?.content || `I can ${actionData.type === 'email' ? 'send an email' : `send a ${actionData.type} message`} for you. Please review the details and confirm.`,
        hasAction: true,
        actionData,
        actionStatus: 'pending_confirmation'
      };
    } else {
      // Regular text response
      response.response = aiChoice.message?.content || "I'm here to help! How can I assist you today?";
    }

    // Enhanced conversation saving with full context
    await ConversationSessionManager.saveConversationWithContext(
      supabase,
      message,
      response.response,
      sessionId,
      {
        queryType: queryAnalysis.type,
        specificData: !!specificData,
        hasAction: response.hasAction
      }
    );

    // Performance monitoring and health check
    const totalTime = PerformanceMonitor.endTimer('total_request');
    const healthStats = PerformanceMonitor.getSystemHealth();
    
    console.log('✅ Enhanced response generated successfully');
    console.log('📊 Request performance:', { totalTime, health: healthStats });
    
    // Add performance data to response
    response.performance = {
      totalTime,
      health: healthStats.overallHealth,
      averageResponseTime: healthStats.averageResponseTime
    };
    
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // Enhanced error logging with full context
    EnhancedErrorHandler.logDetailedError(error, {
      messageId: messageId || 'unknown',
      sessionId: sessionId || 'unknown',
      queryType: 'unknown',
      userHistory: !!userHistory,
      functionName: 'chat-with-data-main'
    });
    
    // Create user-friendly error response
    const errorResponse = EnhancedErrorHandler.createErrorResponse(error, messageId || 'unknown', message);
    
    return new Response(JSON.stringify(errorResponse), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
