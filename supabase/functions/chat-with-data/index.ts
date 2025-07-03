import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SmartQueryAnalysis {
  type: 'specific_month' | 'date_range' | 'recent_period' | 'analytics' | 'general';
  startDate?: string;
  endDate?: string;
  month?: string;
  year?: string;
  days?: number;
  description?: string;
}

function analyzeQueryIntelligently(message: string): SmartQueryAnalysis {
  const lowerMessage = message.toLowerCase();
  
  // Specific month patterns (June 2025, May 2024, etc.)
  const monthPattern = /(january|february|march|april|may|june|july|august|september|october|november|december)\s*,?\s*(\d{4})/i;
  const monthMatch = lowerMessage.match(monthPattern);
  
  if (monthMatch) {
    const monthName = monthMatch[1].toLowerCase();
    const year = monthMatch[2];
    const monthNumbers: Record<string, string> = {
      january: '01', february: '02', march: '03', april: '04',
      may: '05', june: '06', july: '07', august: '08',
      september: '09', october: '10', november: '11', december: '12'
    };
    
    return {
      type: 'specific_month',
      month: monthName,
      year,
      startDate: `${year}-${monthNumbers[monthName]}-01`,
      endDate: `${year}-${monthNumbers[monthName]}-31`,
      description: `${monthName} ${year}`
    };
  }
  
  // Recent period patterns (past X days, last X weeks, etc.)
  const pastDaysPattern = /(?:past|last)\s*(\d+)\s*days?/i;
  const pastWeeksPattern = /(?:past|last)\s*(\d+)\s*weeks?/i;
  const pastMonthsPattern = /(?:past|last)\s*(\d+)\s*months?/i;
  
  const daysMatch = lowerMessage.match(pastDaysPattern);
  const weeksMatch = lowerMessage.match(pastWeeksPattern);
  const monthsMatch = lowerMessage.match(pastMonthsPattern);
  
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    return {
      type: 'recent_period',
      days,
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      description: `past ${days} days`
    };
  }
  
  if (weeksMatch) {
    const weeks = parseInt(weeksMatch[1]);
    const days = weeks * 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    return {
      type: 'recent_period',
      days,
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      description: `past ${weeks} weeks`
    };
  }
  
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1]);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    return {
      type: 'recent_period',
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      description: `past ${months} months`
    };
  }
  
  // Recent/current patterns
  if (lowerMessage.includes('recent') || lowerMessage.includes('lately') || lowerMessage.includes('this month')) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    return {
      type: 'recent_period',
      days: 30,
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      description: 'recent period (30 days)'
    };
  }
  
  if (lowerMessage.includes('this year')) {
    const year = new Date().getFullYear();
    return {
      type: 'date_range',
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      description: `this year (${year})`
    };
  }
  
  if (lowerMessage.includes('last year')) {
    const year = new Date().getFullYear() - 1;
    return {
      type: 'date_range',
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      description: `last year (${year})`
    };
  }
  
  // Analytics patterns
  if (lowerMessage.includes('breakdown') || lowerMessage.includes('analysis') || 
      lowerMessage.includes('average') || lowerMessage.includes('source') ||
      lowerMessage.includes('rating') || lowerMessage.includes('score')) {
    return {
      type: 'analytics',
      description: 'analytics query'
    };
  }
  
  return { type: 'general', description: 'general query' };
}

async function queryReviewsByDateRange(supabase: any, startDate: string, endDate: string) {
  console.log(`📊 Querying reviews from ${startDate} to ${endDate}`);
  
  const { data: reviews, error } = await supabase
    .from('Hotel Reviews')
    .select('*')
    .gte('Date', startDate)
    .lte('Date', endDate)
    .order('Date', { ascending: false });
    
  return { reviews, error };
}

async function getAnalyticsData(supabase: any) {
  console.log('📈 Fetching analytics data...');
  
  // Get all reviews for comprehensive analytics
  const { data: allReviews, error } = await supabase
    .from('Hotel Reviews')
    .select('*')
    .order('Date', { ascending: false });
    
  if (error || !allReviews) {
    return { allReviews: [], error };
  }
  
  // Calculate analytics
  const analytics = {
    totalReviews: allReviews.length,
    averageScore: 0,
    sourceBreakdown: {} as Record<string, number>,
    monthlyBreakdown: {} as Record<string, number>,
    recentTrend: 0
  };
  
  // Calculate average score
  const reviewsWithScores = allReviews.filter(r => r.Score);
  if (reviewsWithScores.length > 0) {
    analytics.averageScore = reviewsWithScores.reduce((sum, r) => sum + r.Score, 0) / reviewsWithScores.length;
  }
  
  // Source breakdown
  allReviews.forEach(review => {
    const source = review.Source || 'Unknown';
    analytics.sourceBreakdown[source] = (analytics.sourceBreakdown[source] || 0) + 1;
  });
  
  // Monthly breakdown (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  allReviews.forEach(review => {
    if (review.Date && new Date(review.Date) >= sixMonthsAgo) {
      const monthKey = review.Date.substring(0, 7); // YYYY-MM
      analytics.monthlyBreakdown[monthKey] = (analytics.monthlyBreakdown[monthKey] || 0) + 1;
    }
  });
  
  return { analytics, allReviews, error: null };
}

async function buildIntelligentContext(supabase: any, queryAnalysis: SmartQueryAnalysis, specificData?: any) {
  console.log('🧠 Building intelligent context...');
  
  let context = `🏨 You are Two Seasons Hotel's senior AI consultant with complete database access.

📊 QUERY ANALYSIS: ${queryAnalysis.description}
📅 QUERY TYPE: ${queryAnalysis.type}

`;

  if (specificData?.reviews) {
    const reviews = specificData.reviews;
    const reviewsWithScores = reviews.filter((r: any) => r.Score);
    const avgScore = reviewsWithScores.length > 0 ? 
      reviewsWithScores.reduce((sum: number, r: any) => sum + r.Score, 0) / reviewsWithScores.length : 0;
    
    const sourceBreakdown = reviews.reduce((acc: any, review: any) => {
      const source = review.Source || 'Unknown';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});

    context += `🎯 SPECIFIC DATA FOR YOUR QUERY:
- Total reviews in period: ${reviews.length}
- Average score: ${avgScore.toFixed(1)}/5
- Date range: ${queryAnalysis.startDate} to ${queryAnalysis.endDate}
- Sources: ${Object.entries(sourceBreakdown).map(([source, count]) => `${source} (${count})`).join(', ')}

📋 SAMPLE REVIEWS FROM THIS PERIOD:
`;
    
    reviews.slice(0, 5).forEach((review: any, index: number) => {
      context += `${index + 1}. ${review.Date} - ${review.Source} - Score: ${review.Score || 'N/A'}
   ${review.Title ? `Title: ${review.Title}` : ''}
   ${review['Reviews Summary'] ? `Summary: ${review['Reviews Summary'].substring(0, 150)}...` : ''}

`;
    });
  }
  
  if (specificData?.analytics) {
    const analytics = specificData.analytics;
    context += `📈 COMPREHENSIVE HOTEL ANALYTICS:
- Total reviews in database: ${analytics.totalReviews}
- Overall average score: ${analytics.averageScore.toFixed(1)}/5
- Review sources breakdown: ${Object.entries(analytics.sourceBreakdown).map(([source, count]) => `${source} (${count})`).join(', ')}

📅 RECENT MONTHLY TRENDS:
${Object.entries(analytics.monthlyBreakdown)
  .sort(([a], [b]) => b.localeCompare(a))
  .slice(0, 6)
  .map(([month, count]) => `- ${month}: ${count} reviews`)
  .join('\n')}

`;
  }

  context += `🎯 INSTRUCTIONS:
- You are Two Seasons Hotel's AI assistant with full action capabilities
- You can send emails, SMS messages, and WhatsApp messages when requested
- When users ask you to send messages, use the appropriate function (send_email, send_sms, send_whatsapp)
- Always extract recipient information and message content from user requests
- For SMS and WhatsApp, use the phoneNumber parameter
- For emails, include a relevant subject line
- Provide specific, data-driven insights based on the actual hotel data
- Use exact numbers from the database - never estimate or approximate
- Reference specific trends, patterns, and insights from the data
- Be conversational but professional, as a senior hotel consultant

`;

  return context;
}

async function callOpenAI(context: string, message: string): Promise<any> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  console.log('🤖 Calling OpenAI with intelligent context and function calling...');
  console.log(`📏 Context length: ${context.length} characters`);

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
      max_tokens: 1500,
      functions: [
        {
          name: 'send_email',
          description: 'Send an email to a specified recipient',
          parameters: {
            type: 'object',
            properties: {
              recipient: { type: 'string', description: 'Email address of the recipient' },
              subject: { type: 'string', description: 'Subject line of the email' },
              message: { type: 'string', description: 'Email message content' }
            },
            required: ['recipient', 'subject', 'message']
          }
        },
        {
          name: 'send_sms',
          description: 'Send an SMS to a specified phone number',
          parameters: {
            type: 'object',
            properties: {
              phoneNumber: { type: 'string', description: 'Phone number to send SMS to' },
              message: { type: 'string', description: 'SMS message content' }
            },
            required: ['phoneNumber', 'message']
          }
        },
        {
          name: 'send_whatsapp',
          description: 'Send a WhatsApp message to a specified phone number',
          parameters: {
            type: 'object',
            properties: {
              phoneNumber: { type: 'string', description: 'Phone number to send WhatsApp message to' },
              message: { type: 'string', description: 'WhatsApp message content' }
            },
            required: ['phoneNumber', 'message']
          }
        }
      ],
      function_call: 'auto'
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Intelligent chat-with-data function starting...');
    const { message, messageId } = await req.json();
    
    console.log('📩 Received message:', message);

    // Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Intelligent query analysis
    const queryAnalysis = analyzeQueryIntelligently(message);
    console.log('🧠 Intelligent query analysis:', queryAnalysis);

    let specificData: any = null;
    let context: string;

    // Handle different query types with specific data gathering
    switch (queryAnalysis.type) {
      case 'specific_month':
      case 'recent_period':
      case 'date_range':
        console.log(`📅 Processing ${queryAnalysis.type} query...`);
        const { reviews, error } = await queryReviewsByDateRange(
          supabase, 
          queryAnalysis.startDate!, 
          queryAnalysis.endDate!
        );
        
        if (error) throw new Error('Database query failed: ' + error.message);
        
        specificData = { reviews };
        context = await buildIntelligentContext(supabase, queryAnalysis, specificData);
        break;
        
      case 'analytics':
        console.log('📈 Processing analytics query...');
        const analyticsResult = await getAnalyticsData(supabase);
        if (analyticsResult.error) throw new Error('Analytics query failed');
        
        specificData = { analytics: analyticsResult.analytics, allReviews: analyticsResult.allReviews };
        context = await buildIntelligentContext(supabase, queryAnalysis, specificData);
        break;
        
      default:
        console.log('💬 Processing general query...');
        context = await buildIntelligentContext(supabase, queryAnalysis);
    }

    // Generate intelligent AI response with function calling
    const aiChoice = await callOpenAI(context, message);
    
    let response: any = {
      messageId,
      timestamp: new Date().toISOString(),
      consultant: 'Two Seasons Hotel AI Consultant (Intelligent)',
      queryAnalysis: {
        type: queryAnalysis.type,
        description: queryAnalysis.description,
        dataPoints: specificData?.reviews?.length || specificData?.analytics?.totalReviews || 'general'
      }
    };

    // Check if AI wants to perform an action
    if (aiChoice.function_call) {
      console.log('🎯 AI detected action intent:', aiChoice.function_call);
      
      const functionName = aiChoice.function_call.name;
      const functionArgs = JSON.parse(aiChoice.function_call.arguments);
      
      // Create action data based on function call
      let actionData: any = {
        message: functionArgs.message
      };

      switch (functionName) {
        case 'send_email':
          actionData = {
            type: 'email',
            recipient: functionArgs.recipient,
            subject: functionArgs.subject,
            message: functionArgs.message
          };
          break;
        case 'send_sms':
          actionData = {
            type: 'sms',
            phoneNumber: functionArgs.phoneNumber,
            message: functionArgs.message
          };
          break;
        case 'send_whatsapp':
          actionData = {
            type: 'whatsapp',
            phoneNumber: functionArgs.phoneNumber,
            message: functionArgs.message
          };
          break;
      }

      response = {
        ...response,
        response: aiChoice.message?.content || `I can ${actionData.type === 'email' ? 'send an email' : `send a ${actionData.type} message`} for you. Please review the details and confirm.`,
        hasAction: true,
        actionData,
        actionStatus: 'pending_confirmation'
      };
    } else {
      // Regular text response
      response.response = aiChoice.message.content;
    }

    // Save conversation
    try {
      await supabase.from('LongTermMemory').insert({
        sender: 'User/Guest',
        recipient: 'Two Seasons Hotel AI Consultant',
        message: `👤 User: ${message}\n🤖 Consultant: ${response.response}`,
        created_at: new Date().toISOString()
      });
    } catch (saveError) {
      console.error('⚠️ Failed to save conversation:', saveError);
    }

    console.log('✅ Intelligent response generated successfully');
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('🚨 Error in intelligent function:', error);
    
    const errorResponse = {
      response: `I encountered an issue processing your request: ${error.message}. Please try rephrasing your question.`,
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