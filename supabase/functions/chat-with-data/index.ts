
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
    let context = "Based on the available hotel data:\n\n";
    
    if (hotelReviews.data && hotelReviews.data.length > 0) {
      context += "Hotel Reviews:\n";
      hotelReviews.data.forEach(review => {
        if (review['Reviews Summary']) {
          context += `- ${review['Reviews Summary']}\n`;
        }
      });
      context += "\n";
    }

    if (infoSummary.data && infoSummary.data.length > 0) {
      context += "Information Summary:\n";
      infoSummary.data.forEach(info => {
        if (info['Email Summary']) {
          context += `- ${info['Email Summary']}\n`;
        }
      });
      context += "\n";
    }

    if (conductedTraining.data && conductedTraining.data.length > 0) {
      context += "Training Information:\n";
      conductedTraining.data.forEach(training => {
        if (training['Summary of the training']) {
          context += `- ${training['Summary of the training']}\n`;
        }
      });
      context += "\n";
    }

    if (longTermMemory.data && longTermMemory.data.length > 0) {
      context += "Previous Interactions:\n";
      longTermMemory.data.forEach(memory => {
        if (memory.message) {
          context += `- ${memory.message}\n`;
        }
      });
      context += "\n";
    }

    // Create a comprehensive response based on the data
    let response;
    
    if (message.toLowerCase().includes('review') || message.toLowerCase().includes('feedback')) {
      const reviews = hotelReviews.data?.map(r => r['Reviews Summary']).filter(Boolean) || [];
      if (reviews.length > 0) {
        response = `Based on our hotel reviews, here's what guests are saying:\n\n${reviews.join('\n\n')}`;
      }
    } else if (message.toLowerCase().includes('training') || message.toLowerCase().includes('staff')) {
      const trainings = conductedTraining.data?.map(t => t['Summary of the training']).filter(Boolean) || [];
      if (trainings.length > 0) {
        response = `Here's information about our training programs:\n\n${trainings.join('\n\n')}`;
      }
    } else if (message.toLowerCase().includes('email') || message.toLowerCase().includes('summary')) {
      const summaries = infoSummary.data?.map(s => s['Email Summary']).filter(Boolean) || [];
      if (summaries.length > 0) {
        response = `Here are the latest updates and summaries:\n\n${summaries.join('\n\n')}`;
      }
    }

    if (!response) {
      // General response using available context
      response = `I'm here to help you with information about Two Seasons Hotel. I have access to our reviews, training records, and various hotel information. ${context ? 'Based on our current data, I can provide information about guest reviews, staff training, and general hotel operations.' : 'How can I assist you today?'}`;
    }

    // Store the interaction in Long Term Memory
    await supabase.from('LongTermMemory').insert({
      sender: 'User',
      recipient: 'AI Assistant',
      message: `User: ${message}\nAI: ${response}`
    });

    console.log('Generated response:', response);

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
      error: 'I apologize, but I encountered an issue accessing the hotel data. Please try again.',
      messageId: Date.now().toString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
