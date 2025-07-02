
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { EnhancedDataService } from './enhanced-data-service.ts';
import { EnhancedContextBuilder } from './enhanced-context-builder.ts';
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
    const { message, messageId }: ChatRequest = await req.json();
    
    console.log('📩 Received message:', message);
    console.log('🔍 Message ID:', messageId);

    // Initialize services
    const dataService = new EnhancedDataService();
    const smartContextBuilder = new SmartContextBuilder();
    const openAIService = new OpenAIService();

    // Analyze the user's query to understand intent
    const queryAnalysis = QueryAnalyzer.analyzeQuery(message);
    console.log('🧠 Query Analysis:', queryAnalysis);

    // Fetch optimized data based on query analysis (instead of all data)
    console.log('📊 Starting optimized data fetch...');
    const data = await dataService.fetchOptimizedDataWithContext(queryAnalysis);
    console.log('✅ Data fetch completed, building context...');

    // Build optimized context based on query analysis
    const context = smartContextBuilder.buildOptimizedContext(data, queryAnalysis, message);
    
    // Log the final context for debugging
    console.log('📄 Final Context Sample:', context.substring(0, 500) + '...');
    console.log('📏 Final Context Length:', context.length, 'characters');
    
    // Specifically log if this is about June 2025
    if (message.toLowerCase().includes('june') && message.toLowerCase().includes('2025')) {
      console.log('🎯 JUNE 2025 QUERY DETECTED - Context contains June 2025:', context.includes('2025-06'));
      console.log('🎯 Context contains "June 2025":', context.includes('June 2025'));
    }

    // Generate AI response with enhanced context and uncertainty management
    const aiResponse = await openAIService.generateResponse(context, message, data);

    // Save conversation to memory
    await dataService.saveConversation(message, aiResponse);

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
