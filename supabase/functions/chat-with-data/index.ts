
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DataService } from './data-service.ts';
import { ContextBuilder } from './context-builder.ts';
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
    const dataService = new DataService();
    const contextBuilder = new ContextBuilder();
    const openAIService = new OpenAIService();

    // Fetch data from all sources
    const data = await dataService.fetchAllData();

    // Build context for AI
    const context = contextBuilder.buildContext(data, message);

    // Generate AI response  
    const aiResponse = await openAIService.generateResponse(context, message);

    // Save conversation to memory
    await dataService.saveConversation(message, aiResponse);

    // Create response
    const response: ChatResponse = {
      response: aiResponse,
      messageId,
      timestamp: new Date().toISOString(),
      consultant: 'Two Seasons Hotel AI Consultant',
      dataStats: dataService.createDataStats(data)
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return ErrorHandler.createErrorResponse(error);
  }
});
