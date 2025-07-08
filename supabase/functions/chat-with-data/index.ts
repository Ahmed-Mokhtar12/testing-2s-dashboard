
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { analyzeQueryIntelligently } from './query-analyzer.ts';
import { queryReviewsByDateRange, getAnalyticsData } from './data-service.ts';
import { EnhancedContextBuilder } from './enhanced-context-builder.ts';
import { callOpenAI } from './openai-service.ts';
import { SearchService } from './search-service.ts';
import { WebsiteQueryAnalyzer } from './website-query-analyzer.ts';
import { CustomerBehaviorAnalytics } from './customer-behavior-analytics.ts';
import { ConversationContextAnalyzer } from './conversation-context-analyzer.ts';
import { SystemPromptBuilder } from './system-prompt-builder.ts';
import { EnhancedErrorHandler } from './enhanced-error-handler.ts';
import { ConversationSessionManager } from './conversation-session-manager.ts';
import { PerformanceMonitor } from './performance-monitor.ts';
import { SmartResponseValidator } from './smart-response-validator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    PerformanceMonitor.startTimer('total_request');
    console.log('🚀 Enhanced chat-with-data function starting...');
    const { message, messageId, sessionId } = await req.json();
    
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
    console.log('📚 Retrieving conversation history...');
    const { data: userHistory, error: historyError } = await supabase
      .from('LongTermMemory')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

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
    const [hotelReviews, chatHistory, conductedTraining, infoSummary, longTermMemory, documentContext, recentDocuments] = await Promise.allSettled([
      supabase.from('Hotel Reviews').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('Chat History').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('Conducted Training').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('Info Summary').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('LongTermMemory').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.rpc('get_recent_document_context', { limit_count: 10 }),
      supabase.from('uploaded_documents').select('*').eq('upload_status', 'processed').order('last_accessed', { ascending: false }).limit(5)
    ]);

    const allData = {
      hotelReviews,
      chatHistory,
      conductedTraining,
      infoSummary,
      longTermMemory,
      documentContext,
      recentDocuments
    };

    // Build enhanced context using the enhanced context builder
    const enhancedContextBuilder = new EnhancedContextBuilder();
    const context = enhancedContextBuilder.buildContextWithDocuments(allData, message);
    
    console.log('✅ Enhanced context built with document integration');

    // Build enhanced system prompt with conversation continuity
    const consultantPrompt = SystemPromptBuilder.buildConsultantPrompt(conversationData, context);
    
    // Enhanced AI response with conversation context
    console.log('🤖 Calling OpenAI with enhanced context...');
    let aiChoice = await callOpenAI(context, message, consultantPrompt);
    
    // Validate and enhance response
    const validationResult = SmartResponseValidator.validateAIResponse(aiChoice, message, conversationData);
    SmartResponseValidator.logValidationResults(validationResult, {
      conversationData,
      userMessage: message,
      response: aiChoice
    });
    
    // Enhance response if needed
    if (!validationResult.isValid) {
      aiChoice = SmartResponseValidator.enhanceResponseIfNeeded(aiChoice, message, conversationData, validationResult);
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
