
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { EnhancedDataService } from './enhanced-data-service.ts';
import { EnhancedContextBuilder } from './enhanced-context-builder.ts';
import { SmartContextBuilder } from './smart-context-builder.ts';
import { QueryAnalyzer } from './query-analyzer.ts';
import { OpenAIService } from './openai-service.ts';
import { ErrorHandler } from './error-handler.ts';
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

    // Fetch data from all sources including document context
    const data = await dataService.fetchAllDataWithDocumentContext();

    // Build optimized context based on query analysis
    const context = smartContextBuilder.buildOptimizedContext(data, queryAnalysis, message);
    
    // Log the final context for debugging
    console.log('📄 Final Context Sample:', context.substring(0, 500) + '...');
    console.log('📏 Final Context Length:', context.length, 'characters');

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
    return ErrorHandler.createErrorResponse(error);
  }
});
