
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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('📩 Received message:', message);
    console.log('🔍 Message ID:', messageId);

    // Enhanced data fetching with better error handling and logging
    console.log('📊 Fetching comprehensive hotel data...');
    
    const [hotelReviews, chatHistory, infoSummary, conductedTraining, longTermMemory, vectorSearch] = await Promise.allSettled([
      supabase.from('Hotel Reviews').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('Chat History').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('Info Summary').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('Conducted Training').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('LongTermMemory').select('*').order('created_at', { ascending: false }).limit(25),
      supabase.from('N8N_2S').select('*').order('created_at', { ascending: false }).limit(10)
    ]);

    // Enhanced logging
    console.log('📈 Hotel Reviews:', hotelReviews.status === 'fulfilled' ? `${hotelReviews.value.data?.length || 0} records` : hotelReviews.reason);
    console.log('💬 Chat History:', chatHistory.status === 'fulfilled' ? `${chatHistory.value.data?.length || 0} records` : chatHistory.reason);
    console.log('📧 Info Summary:', infoSummary.status === 'fulfilled' ? `${infoSummary.value.data?.length || 0} records` : infoSummary.reason);
    console.log('🎓 Conducted Training:', conductedTraining.status === 'fulfilled' ? `${conductedTraining.value.data?.length || 0} records` : conductedTraining.reason);
    console.log('🧠 Long Term Memory:', longTermMemory.status === 'fulfilled' ? `${longTermMemory.value.data?.length || 0} records` : longTermMemory.reason);
    console.log('🔍 Vector Search:', vectorSearch.status === 'fulfilled' ? `${vectorSearch.value.data?.length || 0} records` : vectorSearch.reason);

    // Build comprehensive hotel consultant context
    let context = `📩 Your Role:
You are an intelligent consultant specialized in hotel management at a global level, dedicated entirely to Two Seasons Hotel. You are a strategic consultant expert in:
- Hotel operations and guest management
- Improving guest experience and reviews
- Hotel marketing and revenue management
- Staff development and automation
- Predictive analysis and strategic recommendations

🧠 Contextual Awareness and Memory:
You must remember all previous interactions in the conversation and maintain continuity. Use relevant insights and build on previous discussions.

🗣️ Conversation Style:
Interact naturally in Arabic professionally and friendly. Your responses should seem human, warm and expert, like a senior consultant advising hotel leadership.

🎯 Core Tasks:
- Answer all questions related to hotel operations, marketing, guest services and automation
- Provide data-driven advice
- Suggest improvements for guest satisfaction, staff efficiency and hotel revenue

Comprehensive Two Seasons Hotel Data:

`;

    // Enhanced guest reviews analysis with insights
    if (hotelReviews.status === 'fulfilled' && hotelReviews.value.data && hotelReviews.value.data.length > 0) {
      context += "=== 📊 Guest Reviews and Ratings Analysis ===\n";
      hotelReviews.value.data.forEach((review, index) => {
        if (review['Reviews Summary']) {
          context += `${index + 1}. 📝 ${review['Reviews Summary']}\n`;
        }
      });
      context += "\n🔍 Improvement Tips: Analyze these reviews to identify strengths and weaknesses and suggest a specific action plan.\n\n";
    }

    // Enhanced email communications context
    if (infoSummary.status === 'fulfilled' && infoSummary.value.data && infoSummary.value.data.length > 0) {
      context += "=== 📧 Administrative Communications and Correspondence ===\n";
      infoSummary.value.data.forEach((info, index) => {
        if (info['Email Summary']) {
          context += `${index + 1}. 📤 From: ${info['From'] || 'Not specified'} | 📥 To: ${info['To'] || 'Not specified'}\n   📄 Summary: ${info['Email Summary']}\n`;
        }
      });
      context += "\n💡 Use this information to understand management challenges and available opportunities.\n\n";
    }

    // Enhanced staff training and development context
    if (conductedTraining.status === 'fulfilled' && conductedTraining.value.data && conductedTraining.value.data.length > 0) {
      context += "=== 🎓 Staff Training and Professional Development ===\n";
      conductedTraining.value.data.forEach((training, index) => {
        if (training['Summary of the training']) {
          context += `${index + 1}. 📚 ${training['Summary of the training']}\n`;
        }
      });
      context += "\n🚀 Suggest additional training programs based on current hotel needs.\n\n";
    }

    // Enhanced chat history with pattern analysis
    if (chatHistory.status === 'fulfilled' && chatHistory.value.data && chatHistory.value.data.length > 0) {
      context += "=== 💬 Recent Chat History and Inquiries ===\n";
      chatHistory.value.data.slice(0, 15).forEach((chat, index) => {
        if (chat['Sender Message'] && chat['Ai Reply']) {
          context += `${index + 1}. 🔵 Guest/Staff: ${chat['Sender Message']}\n   🤖 Reply: ${chat['Ai Reply']}\n`;
        }
      });
      context += "\n📈 Analyze patterns in inquiries to identify recurring issues and required solutions.\n\n";
    }

    // Enhanced conversation memory with continuity
    if (longTermMemory.status === 'fulfilled' && longTermMemory.value.data && longTermMemory.value.data.length > 0) {
      context += "=== 🧠 Conversation Memory and Historical Context ===\n";
      longTermMemory.value.data.slice(-12).forEach((memory, index) => {
        if (memory.message) {
          context += `${index + 1}. 💭 ${memory.message}\n`;
        }
      });
      context += "\n🔄 Maintain conversation continuity and use this context to provide coherent responses.\n\n";
    }

    // Enhanced vector search context
    if (vectorSearch.status === 'fulfilled' && vectorSearch.value.data && vectorSearch.value.data.length > 0) {
      context += "=== 🔍 Advanced Search Data and Content ===\n";
      vectorSearch.value.data.forEach((doc, index) => {
        if (doc.content) {
          context += `${index + 1}. 📄 ${doc.content.substring(0, 200)}...\n`;
        }
      });
      context += "\n";
    }

    context += `=== 📋 Specific Instructions ===
- 🎯 Use available data to provide accurate and helpful advice about Two Seasons Hotel
- 💡 If specific information is not available, acknowledge this and offer to help find the information
- 🏨 Be professional, friendly and hospitality-focused in your responses
- 📊 Use available context to give thoughtful answers about Two Seasons Hotel
- 🤝 If a guest has a complaint or issue, show understanding and offer practical solutions
- 📞 For booking inquiries, direct guests to appropriate channels while providing helpful information
- 🔮 Provide proactive recommendations to improve operations and services
- 📈 Suggest strategies to increase revenue and guest satisfaction

Current guest/management question: ${message}`;

    console.log('📏 Context length:', context.length, 'characters');

    // Enhanced OpenAI API call without invalid language parameter
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('🤖 Calling OpenAI API...');
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
        max_tokens: 1000,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      console.error('❌ OpenAI API Error:', openAIResponse.status, errorText);
      throw new Error(`OpenAI API Error: ${openAIResponse.statusText}`);
    }

    const openAIData = await openAIResponse.json();
    const response = openAIData.choices[0].message.content;

    console.log('✅ Generated AI response with length:', response.length, 'characters');

    // Enhanced conversation storage
    try {
      const memoryResult = await supabase.from('LongTermMemory').insert({
        sender: 'User/Guest',
        recipient: 'Two Seasons Hotel AI Consultant',
        message: `👤 User: ${message}\n🤖 Consultant: ${response}`,
        created_at: new Date().toISOString()
      });

      if (memoryResult.error) {
        console.error('❌ Error saving conversation:', memoryResult.error);
      } else {
        console.log('✅ Successfully saved conversation to long-term memory');
      }
    } catch (memoryError) {
      console.error('❌ Failed to save conversation:', memoryError);
    }

    // Enhanced response
    return new Response(JSON.stringify({ 
      response,
      messageId,
      timestamp: new Date().toISOString(),
      consultant: 'Two Seasons Hotel AI Consultant',
      dataStats: {
        hotelReviews: hotelReviews.status === 'fulfilled' ? hotelReviews.value.data?.length || 0 : 0,
        chatHistory: chatHistory.status === 'fulfilled' ? chatHistory.value.data?.length || 0 : 0,
        infoSummary: infoSummary.status === 'fulfilled' ? infoSummary.value.data?.length || 0 : 0,
        conductedTraining: conductedTraining.status === 'fulfilled' ? conductedTraining.value.data?.length || 0 : 0,
        longTermMemory: longTermMemory.status === 'fulfilled' ? longTermMemory.value.data?.length || 0 : 0,
        vectorSearch: vectorSearch.status === 'fulfilled' ? vectorSearch.value.data?.length || 0 : 0
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Error in AI consultant function:', error);
    
    // Enhanced error messages
    let errorMessage = 'I apologize, I encountered an issue processing your request. Please try again.';
    
    if (error.message.includes('OpenAI')) {
      errorMessage = 'I am experiencing an issue connecting to the AI service. Please try again in a moment.';
    } else if (error.message.includes('Supabase') || error.message.includes('database')) {
      errorMessage = 'I am experiencing an issue accessing hotel data. Please try again.';
    }
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      messageId: Date.now().toString(),
      timestamp: new Date().toISOString(),
      consultant: 'Two Seasons Hotel AI Consultant'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
