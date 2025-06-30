
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { EnhancedDataService } from './enhanced-data-service.ts';
import { EnhancedContextBuilder } from './enhanced-context-builder.ts';
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

    // Initialize enhanced services
    const dataService = new EnhancedDataService();
    const contextBuilder = new EnhancedContextBuilder();
    const openAIService = new OpenAIService();

    // Fetch data from all sources including document context
    const data = await dataService.fetchAllDataWithDocumentContext();

    // Build enhanced context with document prioritization
    const context = contextBuilder.buildContextWithDocuments(data, message);

    // Generate AI response with enhanced context
    const aiResponse = await openAIService.generateResponse(context, message);

    // Save conversation to memory
    await dataService.saveConversation(message, aiResponse);

    // Create enhanced response
    const response: ChatResponse & { documentStats?: any } = {
      response: aiResponse,
      messageId,
      timestamp: new Date().toISOString(),
      consultant: 'Two Seasons Hotel AI Consultant (Enhanced)',
      dataStats: dataService.createEnhancedDataStats(data),
      documentStats: {
        recentDocuments: data.recentDocuments?.status === 'fulfilled' ? data.recentDocuments.value.data?.length || 0 : 0,
        documentContext: data.documentContext?.status === 'fulfilled' ? data.documentContext.value.data?.length || 0 : 0
      }
    };

    console.log('✅ Enhanced response generated with document context');

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return ErrorHandler.createErrorResponse(error);
  }
});
