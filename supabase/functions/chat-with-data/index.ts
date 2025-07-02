import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueryAnalysis {
  isMonthQuery: boolean;
  month?: string;
  year?: string;
  monthNumber?: string;
}

function analyzeQuery(message: string): QueryAnalysis {
  const lowerMessage = message.toLowerCase();
  
  // Check for month patterns
  const monthPattern = /(january|february|march|april|may|june|july|august|september|october|november|december)\s*,?\s*(\d{4})/i;
  const match = lowerMessage.match(monthPattern);
  
  if (match) {
    const monthName = match[1].toLowerCase();
    const year = match[2];
    
    const monthNumbers: Record<string, string> = {
      january: '01', february: '02', march: '03', april: '04',
      may: '05', june: '06', july: '07', august: '08',
      september: '09', october: '10', november: '11', december: '12'
    };
    
    return {
      isMonthQuery: true,
      month: monthName,
      year,
      monthNumber: monthNumbers[monthName]
    };
  }
  
  return { isMonthQuery: false };
}

async function queryMonthReviews(supabase: any, year: string, monthNumber: string) {
  const startDate = `${year}-${monthNumber}-01`;
  const nextMonth = monthNumber === '12' ? '01' : String(parseInt(monthNumber) + 1).padStart(2, '0');
  const nextYear = monthNumber === '12' ? String(parseInt(year) + 1) : year;
  const endDate = `${nextYear}-${nextMonth}-01`;
  
  const { data: reviews, error } = await supabase
    .from('Hotel Reviews')
    .select('*')
    .gte('Date', startDate)
    .lt('Date', endDate);
    
  return { reviews, error };
}

async function buildContextForAI(supabase: any) {
  console.log('🏗️ Building context for AI...');
  
  try {
    // Fetch recent reviews for context
    const { data: recentReviews } = await supabase
      .from('Hotel Reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
      
    // Fetch recent chat history
    const { data: chatHistory } = await supabase
      .from('Chat History')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
      
    // Build a focused context
    let context = `🏨 You are Two Seasons Hotel's AI consultant with direct database access.

📊 HOTEL REVIEWS DATABASE ACCESS:
- Total reviews available: ${recentReviews?.length || 0} recent reviews loaded
- You have full access to all hotel operational data
- Provide specific, data-driven responses

📋 RECENT CHAT INTERACTIONS:
`;

    if (chatHistory && chatHistory.length > 0) {
      chatHistory.slice(0, 3).forEach((chat: any) => {
        if (chat['Sender Message'] && chat['Ai Reply']) {
          context += `- Guest: ${chat['Sender Message'].substring(0, 100)}...\n`;
          context += `- Hotel: ${chat['Ai Reply'].substring(0, 100)}...\n`;
        }
      });
    }

    context += `
⭐ RECENT REVIEW INSIGHTS:
`;
    
    if (recentReviews && recentReviews.length > 0) {
      const avgScore = recentReviews
        .filter((r: any) => r.Score)
        .reduce((sum: number, r: any) => sum + r.Score, 0) / recentReviews.filter((r: any) => r.Score).length;
        
      context += `- Average recent score: ${avgScore.toFixed(1)}/5
- Recent review sources: ${[...new Set(recentReviews.map((r: any) => r.Source))].join(', ')}
- Latest review: ${recentReviews[0]?.Date || 'N/A'}

🎯 INSTRUCTIONS:
- Use actual hotel data from the database
- Provide specific counts and accurate information
- Reference real guest interactions when relevant
- Act as a senior hotel management consultant
`;
    }
    
    return context;
  } catch (error) {
    console.error('❌ Error building context:', error);
    return 'You are Two Seasons Hotel AI consultant. Provide helpful hotel management insights.';
  }
}

async function callOpenAI(context: string, message: string): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-2025-04-14',
      messages: [
        { role: 'system', content: context },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Fixed chat-with-data function starting...');
    const { message, messageId } = await req.json();
    
    console.log('📩 Received message:', message);

    // Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Analyze the query
    const queryAnalysis = analyzeQuery(message);
    console.log('🧠 Query analysis:', queryAnalysis);

    let aiResponse: string;

    if (queryAnalysis.isMonthQuery && queryAnalysis.monthNumber && queryAnalysis.year) {
      // Handle month-specific queries with direct database access
      console.log(`🗓️ Handling ${queryAnalysis.month} ${queryAnalysis.year} query...`);
      
      const { reviews, error } = await queryMonthReviews(supabase, queryAnalysis.year, queryAnalysis.monthNumber);
      
      if (error) {
        console.error('❌ Database error:', error);
        throw new Error('Database query failed');
      }
      
      const monthReviewCount = reviews?.length || 0;
      console.log(`📊 Found ${monthReviewCount} reviews for ${queryAnalysis.month} ${queryAnalysis.year}`);
      
      // Build context and get AI response
      const context = await buildContextForAI(supabase);
      const enhancedMessage = `Based on the hotel database: There are exactly ${monthReviewCount} reviews for ${queryAnalysis.month} ${queryAnalysis.year}. ${message}`;
      
      aiResponse = await callOpenAI(context, enhancedMessage);
      
    } else {
      // Handle general queries with full AI processing
      console.log('💬 Handling general query with AI...');
      
      const context = await buildContextForAI(supabase);
      aiResponse = await callOpenAI(context, message);
    }

    // Save conversation
    try {
      await supabase.from('LongTermMemory').insert({
        sender: 'User/Guest',
        recipient: 'Two Seasons Hotel AI Consultant',
        message: `👤 User: ${message}\n🤖 Consultant: ${aiResponse}`,
        created_at: new Date().toISOString()
      });
    } catch (saveError) {
      console.error('⚠️ Failed to save conversation:', saveError);
    }

    const response = {
      response: aiResponse,
      messageId,
      timestamp: new Date().toISOString(),
      consultant: 'Two Seasons Hotel AI Consultant (Fixed)',
      dataStats: queryAnalysis.isMonthQuery ? {
        monthQuery: `${queryAnalysis.month} ${queryAnalysis.year}`,
        reviewCount: 'processed'
      } : {
        generalQuery: true
      }
    };

    console.log('✅ Response generated successfully');
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('🚨 Error in function:', error);
    
    const errorResponse = {
      response: `I encountered an issue: ${error.message}. Please try rephrasing your question.`,
      messageId: 'error-' + Date.now(),
      timestamp: new Date().toISOString(),
      consultant: 'Two Seasons Hotel AI Consultant (Error)',
      error: true
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});