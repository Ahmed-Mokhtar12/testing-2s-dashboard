import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { EnhancedDataService } from './enhanced-data-service.ts';
import { SmartContextBuilder } from './smart-context-builder.ts';
import { QueryAnalyzer } from './query-analyzer.ts';
import { OpenAIService } from './openai-service.ts';
import { EnhancedErrorHandler } from './enhanced-error-handler.ts';
import { ChatRequest, ChatResponse } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Starting chat-with-data function...');
    const { message, messageId }: ChatRequest = await req.json();
    
    console.log('📩 Received message:', message);
    console.log('🔍 Message ID:', messageId);

    // Initialize services with comprehensive error handling
    console.log('🔧 Initializing services...');
    
    let dataService: EnhancedDataService;
    let smartContextBuilder: SmartContextBuilder;
    let openAIService: OpenAIService;
    
    try {
      dataService = new EnhancedDataService();
      console.log('✅ DataService initialized');
    } catch (error) {
      console.error('❌ DataService initialization failed:', error);
      throw new Error('Failed to initialize data service: ' + error.message);
    }
    
    try {
      smartContextBuilder = new SmartContextBuilder();
      console.log('✅ SmartContextBuilder initialized');
    } catch (error) {
      console.error('❌ SmartContextBuilder initialization failed:', error);
      throw new Error('Failed to initialize context builder: ' + error.message);
    }
    
    try {
      openAIService = new OpenAIService();
      console.log('✅ OpenAIService initialized');
    } catch (error) {
      console.error('❌ OpenAIService initialization failed:', error);
      throw new Error('Failed to initialize OpenAI service: ' + error.message);
    }

    // Analyze the user's query to understand intent
    console.log('🧠 Analyzing query...');
    let queryAnalysis;
    try {
      queryAnalysis = QueryAnalyzer.analyzeQuery(message);
      console.log('✅ Query Analysis completed:', queryAnalysis);
    } catch (error) {
      console.error('❌ Query analysis failed:', error);
      throw new Error('Failed to analyze query: ' + error.message);
    }

    // Fetch optimized data based on query analysis
    console.log('📊 Starting optimized data fetch...');
    let data;
    try {
      data = await dataService.fetchOptimizedDataWithContext(queryAnalysis);
      console.log('✅ Data fetch completed');
    } catch (error) {
      console.error('❌ Optimized data fetch failed:', error);
      // Fallback to legacy method
      console.log('🔄 Falling back to legacy data fetch...');
      try {
        data = await dataService.fetchAllDataWithDocumentContext();
        console.log('✅ Legacy data fetch completed');
      } catch (legacyError) {
        console.error('❌ Legacy data fetch also failed:', legacyError);
        throw new Error('All data fetching methods failed: ' + error.message);
      }
    }

    // Build optimized context based on query analysis
    console.log('🏗️ Building context...');
    let context;
    try {
      context = smartContextBuilder.buildOptimizedContext(data, queryAnalysis, message);
      console.log('✅ Context building completed');
    } catch (error) {
      console.error('❌ Context building failed:', error);
      throw new Error('Failed to build context: ' + error.message);
    }
    
    // Log the final context for debugging
    console.log('📄 Final Context Sample:', context.substring(0, 500) + '...');
    console.log('📏 Final Context Length:', context.length, 'characters');
    
    // Specifically log if this is about June 2025
    if (message.toLowerCase().includes('june') && message.toLowerCase().includes('2025')) {
      console.log('🎯 JUNE 2025 QUERY DETECTED');
      console.log('🎯 Context contains "June 2025":', context.includes('June 2025'));
      console.log('🎯 Context contains "2025-06":', context.includes('2025-06'));
      console.log('🎯 Context contains "71":', context.includes('71'));
      
      // Log specific June 2025 sections from context
      const lines = context.split('\n');
      const june2025Lines = lines.filter(line => 
        line.includes('June 2025') || 
        line.includes('2025-06') || 
        (line.includes('71') && line.includes('review'))
      );
      console.log('🎯 June 2025 related context lines:', june2025Lines);
    }

    // Generate AI response with enhanced context
    console.log('🤖 Generating AI response...');
    let aiResponse;
    try {
      aiResponse = await openAIService.generateResponse(context, message, data);
      console.log('✅ AI response generated successfully');
    } catch (error) {
      console.error('❌ AI response generation failed:', error);
      throw new Error('Failed to generate AI response: ' + error.message);
    }

    // Save conversation to memory
    console.log('💾 Saving conversation...');
    try {
      await dataService.saveConversation(message, aiResponse);
      console.log('✅ Conversation saved');
    } catch (error) {
      console.error('❌ Failed to save conversation:', error);
      // Don't throw error for this, just log it
    }

    // Create enhanced response
    const response: ChatResponse & { documentStats?: any } = {
      response: aiResponse,
      messageId,
      timestamp: new Date().toISOString(),
      consultant: 'Two Seasons Hotel AI Consultant (Smart Context)',
      dataStats: dataService.createEnhancedDataStats(data),
      documentStats: {
        recentDocuments: data.recentDocuments?.status === 'fulfilled' ? data.recentDocuments.value.data?.length || 0 : 0,
        documentContext: data.documentContext?.status === 'fulfilled' ? data.documentContext.value.data?.length || 0 : 0
      }
    };

    console.log('✅ Smart response generated with query-aware context building');

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('🚨 Critical error in chat-with-data function:', error);
    console.error('🚨 Error stack:', error.stack);
    
    EnhancedErrorHandler.logError(error, 'chat-with-data-main');
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
    
    const userFriendlyMessage = EnhancedErrorHandler.createUserFriendlyMessage(error, 'chat processing');
    
    return new Response(JSON.stringify({ 
      response: userFriendlyMessage,
      messageId: 'error-' + Date.now(),
      timestamp: new Date().toISOString(),
      consultant: 'Two Seasons Hotel AI Consultant (Error)',
      error: true
    }), {
      status: 200, // Return 200 so frontend can display the message
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});