
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, messageId } = await req.json();
    
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    console.log('Received message:', message);

    // Query relevant data from Supabase tables
    const [hotelReviews, chatHistory, infoSummary, conductedTraining, longTermMemory] = await Promise.all([
      supabase.from('Hotel Reviews').select('*').limit(10),
      supabase.from('Chat History').select('*').limit(20),
      supabase.from('Info Summary').select('*').limit(10),
      supabase.from('Conducted Training').select('*').limit(10),
      supabase.from('LongTermMemory').select('*').limit(10)
    ]);

    // Build context from the data
    let context = "You are a helpful assistant for Two Seasons Hotel. Use the following hotel data to answer questions:\n\n";
    
    if (hotelReviews.data && hotelReviews.data.length > 0) {
      context += "HOTEL REVIEWS:\n";
      hotelReviews.data.forEach(review => {
        if (review['Reviews Summary']) {
          context += `- ${review['Reviews Summary']}\n`;
        }
      });
      context += "\n";
    }

    if (infoSummary.data && infoSummary.data.length > 0) {
      context += "INFORMATION SUMMARIES:\n";
      infoSummary.data.forEach(info => {
        if (info['Email Summary']) {
          context += `- ${info['Email Summary']}\n`;
        }
      });
      context += "\n";
    }

    if (conductedTraining.data && conductedTraining.data.length > 0) {
      context += "STAFF TRAINING INFORMATION:\n";
      conductedTraining.data.forEach(training => {
        if (training['Summary of the training']) {
          context += `- ${training['Summary of the training']}\n`;
        }
      });
      context += "\n";
    }

    if (longTermMemory.data && longTermMemory.data.length > 0) {
      context += "PREVIOUS CONVERSATIONS:\n";
      longTermMemory.data.slice(-5).forEach(memory => {
        if (memory.message) {
          context += `- ${memory.message}\n`;
        }
      });
      context += "\n";
    }

    context += "Please provide helpful, accurate responses based on this hotel data. If you don't have specific information, acknowledge that and offer to help in other ways.";

    // Call OpenAI API with the context and user message
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: context },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 500
      }),
    });

    if (!openAIResponse.ok) {
      throw new Error(`OpenAI API error: ${openAIResponse.statusText}`);
    }

    const openAIData = await openAIResponse.json();
    const response = openAIData.choices[0].message.content;

    // Store the interaction in Long Term Memory
    await supabase.from('LongTermMemory').insert({
      sender: 'User',
      recipient: 'AI Assistant',
      message: `User: ${message}\nAI: ${response}`
    });

    console.log('Generated OpenAI response:', response);

    return new Response(JSON.stringify({ 
      response,
      messageId,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in chat-with-data function:', error);
    return new Response(JSON.stringify({ 
      error: 'I apologize, but I encountered an issue processing your request. Please try again.',
      messageId: Date.now().toString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
