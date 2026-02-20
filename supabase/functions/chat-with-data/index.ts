
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { analyzeQueryIntelligently } from './query-analyzer.ts';
import { queryReviewsByDateRange, getAnalyticsData } from './data-service.ts';
import { EnhancedContextBuilder } from './enhanced-context-builder.ts';
import { callOpenAI } from './openai-service.ts';
import { CustomerBehaviorAnalytics } from './customer-behavior-analytics.ts';
import { ConversationContextAnalyzer } from './conversation-context-analyzer.ts';
import { SystemPromptBuilder } from './system-prompt-builder.ts';
import { EnhancedErrorHandler } from './enhanced-error-handler.ts';
import { ConversationSessionManager } from './conversation-session-manager.ts';
import { PerformanceMonitor } from './performance-monitor.ts';
import { SmartResponseValidator } from './smart-response-validator.ts';
import { ResponseCompletenessEngine } from './response-completeness-engine.ts';
import { DataAvailabilityChecker } from './data-availability-checker.ts';
import { HonestResponseGenerator } from './honest-response-generator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let message = '';
  let messageId = 'unknown';
  let sessionId: string | undefined;
  let userHistory: any[] = [];

  try {
    PerformanceMonitor.startTimer('total_request');
    console.log('🚀 Enhanced chat-with-data function starting...');
    const parsed = await req.json();
    message = parsed.message;
    messageId = parsed.messageId || 'unknown';
    sessionId = parsed.sessionId;
    
    console.log('📩 Received message:', { message, messageId, sessionId });

    // Initialize Supabase with enhanced error handling
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (!Deno.env.get('SUPABASE_URL') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      throw new Error('Supabase configuration missing');
    }

    // Enhanced conversation context retrieval with session support
    console.log('📚 Retrieving conversation history for session:', sessionId);
    const { data: fetchedHistory, error: historyError } = await supabase
      .from('website_chats')
      .select('*')
      .eq('session_id', sessionId || 'guest')
      .eq('is_archived', false)
      .order('created_at', { ascending: true })
      .limit(20); // Last 10 exchanges ordered oldest→newest for correct history

    userHistory = fetchedHistory || [];
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
    
    // Get all available data for context building
    const [hotelReviews, chatHistory, conductedTraining, sopData, longTermMemory, documentContext, recentDocuments] = await Promise.allSettled([
      supabase.from('reviews').select('*').order('Date', { ascending: false }).limit(5000),
      supabase.from('Chat History').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('Conducted Training').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('Sop').select('*').limit(100),
      supabase.from('LongTermMemory').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.rpc('get_recent_document_context', { limit_count: 10 }),
      supabase.from('uploaded_documents').select('*').eq('upload_status', 'processed').order('last_accessed', { ascending: false }).limit(5)
    ]);

    // 🎯 PRECISE DATE QUERY: If user asks about a specific date, query it directly from DB
    let preciseDateData: { date: string; count: number } | null = null;
    try {
      // Detect date patterns in the message (e.g. "February 18", "18th", "2026-02-18")
      const datePatterns = [
        /(\d{4}-\d{2}-\d{2})/,
        /(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/i,
        /(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?/i,
      ];
      
      const monthMap: Record<string, string> = {
        january: '01', february: '02', march: '03', april: '04',
        may: '05', june: '06', july: '07', august: '08',
        september: '09', october: '10', november: '11', december: '12'
      };

      let detectedDate: string | null = null;
      
      // Try ISO format first
      const isoMatch = message.match(/(\d{4}-\d{2}-\d{2})/);
      if (isoMatch) {
        detectedDate = isoMatch[1];
      } else {
        // Try "Month Day" pattern
        const monthDayMatch = message.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/i);
        if (monthDayMatch) {
          const fullMatch = monthDayMatch[0].toLowerCase();
          const monthName = fullMatch.match(/[a-z]+/)?.[0] || '';
          const day = monthDayMatch[1].padStart(2, '0');
          const year = monthDayMatch[2] || new Date().getFullYear().toString();
          const monthNum = monthMap[monthName];
          if (monthNum) detectedDate = `${year}-${monthNum}-${day}`;
        }
      }

      if (detectedDate) {
        console.log(`📅 Detected date query for: ${detectedDate} — running precise DB count`);
        const { count, error: countError } = await supabase
          .from('reviews')
          .select('*', { count: 'exact', head: true })
          .eq('Date', detectedDate);
        
        if (!countError) {
          preciseDateData = { date: detectedDate, count: count ?? 0 };
          console.log(`✅ Precise date count: ${count} reviews on ${detectedDate}`);
        }
      }
    } catch (dateErr) {
      console.warn('⚠️ Date detection error (non-critical):', dateErr);
    }

    const allData = {
      hotelReviews,
      chatHistory,
      conductedTraining,
      sopData,
      longTermMemory,
      documentContext,
      recentDocuments
    };

    // Get query-specific data based on analysis
    let specificData = null;
    try {
      if (queryAnalysis.type === 'review_summary' || queryAnalysis.type === 'monthly_data') {
        const reviewData = hotelReviews.status === 'fulfilled' ? hotelReviews.value.data || [] : [];
        // Import scoring utilities for accurate analysis
        const { ScoreNormalizationUtils } = await import('./score-normalization-utils.ts');
        const scoringData = ScoreNormalizationUtils.calculateNormalizedAverage(reviewData);
        
        specificData = {
          reviews: reviewData,
          analytics: {
            totalReviews: reviewData.length,
            averageScore: reviewData.filter(r => r.Score).reduce((sum, r) => sum + r.Score, 0) / reviewData.filter(r => r.Score).length || 0,
            normalizedData: scoringData
          }
        };
      }
    } catch (error) {
      console.warn('⚠️ Error processing specific data:', error);
      specificData = { reviews: [], analytics: { totalReviews: 0, averageScore: 0 } };
    }

    // Build enhanced context using the enhanced context builder
    const enhancedContextBuilder = new EnhancedContextBuilder();
    let context = enhancedContextBuilder.buildContextWithDocuments(allData, message);

    // 🎯 INJECT PRECISE DATE COUNT directly into context if detected
    if (preciseDateData) {
      const preciseBlock = `\n\n🔢 PRECISE DATABASE COUNT (DO NOT IGNORE THIS — USE EXACTLY THIS NUMBER):\n` +
        `On ${preciseDateData.date}, the EXACT number of reviews in the database is: ${preciseDateData.count}.\n` +
        `This number was obtained via a direct SQL COUNT query and is 100% accurate.\n` +
        `⚠️ MANDATORY: Use ${preciseDateData.count} as the answer. Do NOT use any other number.\n`;
      context = preciseBlock + context;
      console.log(`📌 Injected precise date context: ${preciseDateData.count} reviews on ${preciseDateData.date}`);
    }
    
    console.log('✅ Enhanced context built with document integration');

    // Build enhanced system prompt with conversation continuity
    const consultantPrompt = SystemPromptBuilder.buildConsultantPrompt(conversationData, context);
    
    // 🎯 DATA AVAILABILITY ASSESSMENT
    console.log('🔍 Assessing data availability...');
    const dataAvailability = DataAvailabilityChecker.assessDataAvailability(message, allData);
    console.log('📊 Data availability assessment:', {
      canAnswer: dataAvailability.canAnswerCompletely,
      available: dataAvailability.availableDataSources,
      missing: dataAvailability.missingDataSources,
      confidence: dataAvailability.confidenceLevel
    });

    // 🤖 HONEST AI RESPONSE WITH DATA INTEGRITY
    console.log('🤖 Calling OpenAI with honest data-aware context...');
    let aiChoice = await callOpenAI(context, message, consultantPrompt, userHistory);

    // 🎯 PRECISE DATE OVERRIDE: If we have a direct DB count, inject it into the final answer
    // This prevents OpenAI from hallucinating a different number
    if (preciseDateData) {
      const responseText = aiChoice.message?.content || '';
      // Check if AI used a wrong number — replace the response content to enforce accuracy
      const correctAnswer = `Based on the database records, there were exactly **${preciseDateData.count} reviews** on ${preciseDateData.date}.\n\n` +
        `*(This count is retrieved directly from a precise database query — 100% accurate)*`;
      
      // Only override if AI mentioned a different number or gave a vague answer
      const numberMentionedByAI = responseText.match(/\b(\d+)\b/);
      const aiNumber = numberMentionedByAI ? parseInt(numberMentionedByAI[1]) : null;
      
      if (aiNumber !== preciseDateData.count) {
        console.log(`⚠️ AI gave wrong count (${aiNumber}) — overriding with correct count (${preciseDateData.count})`);
        aiChoice = {
          ...aiChoice,
          message: {
            ...aiChoice.message,
            content: correctAnswer,
            tool_calls: undefined
          }
        };
      } else {
        console.log(`✅ AI gave correct count (${aiNumber}) — no override needed`);
      }
    }
    
    // 🔥 CRITICAL: Apply Data Honesty Engine to prevent fabrication (skip if we have precise data)
    if (!preciseDateData) {
      console.log('🔧 Applying Data Honesty Engine...');
      aiChoice = await ResponseCompletenessEngine.enforceDataHonesty(
        aiChoice,
        message,
        conversationData,
        specificData,
        context,
        consultantPrompt,
        callOpenAI,
        userHistory
      );
    } else {
      console.log('⏭️ Skipping Data Honesty Engine — precise date data already applied');
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
