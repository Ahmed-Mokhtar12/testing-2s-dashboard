import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { analyzeQueryIntelligently } from './query-analyzer.ts';
import { queryReviewsByDateRange, getAnalyticsData } from './data-service.ts';
import { buildIntelligentContext } from './context-builder.ts';
import { callOpenAI } from './openai-service.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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