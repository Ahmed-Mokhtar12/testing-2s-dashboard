
import { ChatResponse } from './types.ts';

export class ErrorHandler {
  static createErrorResponse(error: Error, messageId?: string): Response {
    console.error('❌ Error in AI consultant function:', error);
    
    let errorMessage = 'I apologize, I encountered an issue processing your request. Please try again.';
    
    if (error.message.includes('OpenAI')) {
      errorMessage = 'I am experiencing an issue connecting to the AI service. Please try again in a moment.';
    } else if (error.message.includes('Supabase') || error.message.includes('database')) {
      errorMessage = 'I am experiencing an issue accessing hotel data. Please try again.';
    }
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      messageId: messageId || Date.now().toString(),
      timestamp: new Date().toISOString(),
      consultant: 'Two Seasons Hotel AI Consultant'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
