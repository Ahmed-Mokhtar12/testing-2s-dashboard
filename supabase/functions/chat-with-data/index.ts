
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
    
    // Initialize Supabase client with service role key for full access
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Use service role key instead of anon key
    );

    console.log('Received message:', message);
    console.log('Message ID:', messageId);

    // Query relevant data from Supabase tables with better error handling
    console.log('Fetching hotel data...');
    
    const [hotelReviews, chatHistory, infoSummary, conductedTraining, longTermMemory] = await Promise.allSettled([
      supabase.from('Hotel Reviews').select('*').order('created_at', { ascending: false }).limit(15),
      supabase.from('Chat History').select('*').order('created_at', { ascending: false }).limit(25),
      supabase.from('Info Summary').select('*').order('created_at', { ascending: false }).limit(15),
      supabase.from('Conducted Training').select('*').order('created_at', { ascending: false }).limit(15),
      supabase.from('LongTermMemory').select('*').order('created_at', { ascending: false }).limit(20)
    ]);

    // Log data retrieval results
    console.log('Hotel Reviews result:', hotelReviews.status, hotelReviews.status === 'fulfilled' ? `${hotelReviews.value.data?.length || 0} records` : hotelReviews.reason);
    console.log('Chat History result:', chatHistory.status, chatHistory.status === 'fulfilled' ? `${chatHistory.value.data?.length || 0} records` : chatHistory.reason);
    console.log('Info Summary result:', infoSummary.status, infoSummary.status === 'fulfilled' ? `${infoSummary.value.data?.length || 0} records` : infoSummary.reason);
    console.log('Conducted Training result:', conductedTraining.status, conductedTraining.status === 'fulfilled' ? `${conductedTraining.value.data?.length || 0} records` : conductedTraining.reason);
    console.log('Long Term Memory result:', longTermMemory.status, longTermMemory.status === 'fulfilled' ? `${longTermMemory.value.data?.length || 0} records` : longTermMemory.reason);

    // Build enhanced context from the data
    let context = `You are a knowledgeable and helpful assistant for Two Seasons Hotel. You have access to comprehensive hotel data including guest reviews, staff training records, email communications, and chat history. 

Please provide accurate, helpful responses based on the following hotel information:

`;
    
    // Add hotel reviews context
    if (hotelReviews.status === 'fulfilled' && hotelReviews.value.data && hotelReviews.value.data.length > 0) {
      context += "=== GUEST REVIEWS AND FEEDBACK ===\n";
      hotelReviews.value.data.forEach((review, index) => {
        if (review['Reviews Summary']) {
          context += `${index + 1}. ${review['Reviews Summary']}\n`;
        }
      });
      context += "\n";
    }

    // Add email summaries context
    if (infoSummary.status === 'fulfilled' && infoSummary.value.data && infoSummary.value.data.length > 0) {
      context += "=== EMAIL COMMUNICATIONS AND INFORMATION ===\n";
      infoSummary.value.data.forEach((info, index) => {
        if (info['Email Summary']) {
          context += `${index + 1}. From: ${info['From'] || 'N/A'} | To: ${info['To'] || 'N/A'}\n   Summary: ${info['Email Summary']}\n`;
        }
      });
      context += "\n";
    }

    // Add staff training context
    if (conductedTraining.status === 'fulfilled' && conductedTraining.value.data && conductedTraining.value.data.length > 0) {
      context += "=== STAFF TRAINING AND PROCEDURES ===\n";
      conductedTraining.value.data.forEach((training, index) => {
        if (training['Summary of the training']) {
          context += `${index + 1}. ${training['Summary of the training']}\n`;
        }
      });
      context += "\n";
    }

    // Add chat history context
    if (chatHistory.status === 'fulfilled' && chatHistory.value.data && chatHistory.value.data.length > 0) {
      context += "=== RECENT CHAT INTERACTIONS ===\n";
      chatHistory.value.data.slice(0, 10).forEach((chat, index) => {
        if (chat['Sender Message'] && chat['Ai Reply']) {
          context += `${index + 1}. Guest: ${chat['Sender Message']}\n   Response: ${chat['Ai Reply']}\n`;
        }
      });
      context += "\n";
    }

    // Add conversation memory context
    if (longTermMemory.status === 'fulfilled' && longTermMemory.value.data && longTermMemory.value.data.length > 0) {
      context += "=== CONVERSATION HISTORY ===\n";
      longTermMemory.value.data.slice(-8).forEach((memory, index) => {
        if (memory.message) {
          context += `${index + 1}. ${memory.message}\n`;
        }
      });
      context += "\n";
    }

    context += `=== INSTRUCTIONS ===
- Provide helpful, accurate responses based on the hotel data above
- If you don't have specific information about something, acknowledge that and offer to help find the information
- Be professional, friendly, and hospitality-focused in your responses
- Use the context provided to give informed answers about Two Seasons Hotel
- If a guest has a complaint or issue, show empathy and offer practical solutions
- For booking inquiries, direct guests to the appropriate channels while providing helpful information

Current guest question: ${message}`;

    console.log('Context length:', context.length, 'characters');

    // Call OpenAI API with enhanced context
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Calling OpenAI API...');
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
        max_tokens: 800,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      console.error('OpenAI API error:', openAIResponse.status, errorText);
      throw new Error(`OpenAI API error: ${openAIResponse.statusText}`);
    }

    const openAIData = await openAIResponse.json();
    const response = openAIData.choices[0].message.content;

    console.log('Generated OpenAI response length:', response.length, 'characters');

    // Store the interaction in Long Term Memory with better error handling
    try {
      const memoryResult = await supabase.from('LongTermMemory').insert({
        sender: 'User',
        recipient: 'AI Assistant',
        message: `User: ${message}\nAI: ${response}`,
        created_at: new Date().toISOString()
      });

      if (memoryResult.error) {
        console.error('Error storing conversation in memory:', memoryResult.error);
      } else {
        console.log('Successfully stored conversation in long-term memory');
      }
    } catch (memoryError) {
      console.error('Failed to store conversation:', memoryError);
      // Don't throw error here - we still want to return the response
    }

    return new Response(JSON.stringify({ 
      response,
      messageId,
      timestamp: new Date().toISOString(),
      dataStats: {
        hotelReviews: hotelReviews.status === 'fulfilled' ? hotelReviews.value.data?.length || 0 : 0,
        chatHistory: chatHistory.status === 'fulfilled' ? chatHistory.value.data?.length || 0 : 0,
        infoSummary: infoSummary.status === 'fulfilled' ? infoSummary.value.data?.length || 0 : 0,
        conductedTraining: conductedTraining.status === 'fulfilled' ? conductedTraining.value.data?.length || 0 : 0,
        longTermMemory: longTermMemory.status === 'fulfilled' ? longTermMemory.value.data?.length || 0 : 0
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in chat-with-data function:', error);
    
    // Provide more specific error messages
    let errorMessage = 'I apologize, but I encountered an issue processing your request. Please try again.';
    
    if (error.message.includes('OpenAI')) {
      errorMessage = 'I\'m having trouble connecting to the AI service. Please try again in a moment.';
    } else if (error.message.includes('Supabase') || error.message.includes('database')) {
      errorMessage = 'I\'m having trouble accessing the hotel information. Please try again.';
    }
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      messageId: Date.now().toString(),
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
