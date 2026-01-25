import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, sessionId } = await req.json();

    if (!message || !sessionId) {
      return new Response(
        JSON.stringify({ error: 'Message and sessionId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📨 Received message from web:', { message, sessionId });

    // Get the n8n webhook URL from secrets
    const webhookUrl = Deno.env.get('N8N_WHATSAPP_WEBHOOK_URL');
    
    if (!webhookUrl) {
      console.error('❌ N8N_WHATSAPP_WEBHOOK_URL not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook URL not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send message to n8n webhook
    console.log('🚀 Sending to n8n webhook:', webhookUrl);
    
    const n8nPayload = {
      message,
      sessionId,
      timestamp: new Date().toISOString(),
      source: 'web',
    };

    console.log('📦 Payload:', JSON.stringify(n8nPayload));

    const n8nResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(n8nPayload),
    });

    console.log('📥 n8n response status:', n8nResponse.status);

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error('❌ n8n webhook error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to get response from AI', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse n8n response
    const n8nData = await n8nResponse.json();
    console.log('✅ n8n response data:', JSON.stringify(n8nData));

    // Extract the AI response - adjust based on your n8n workflow output
    const aiResponse = n8nData.output || n8nData.response || n8nData.message || n8nData.text || 
                       (typeof n8nData === 'string' ? n8nData : JSON.stringify(n8nData));

    // Save conversation to Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: insertError } = await supabase
      .from('website_chats')
      .insert({
        session_id: sessionId,
        user_message: message,
        ai_response: aiResponse,
      });

    if (insertError) {
      console.error('⚠️ Failed to save chat:', insertError);
      // Don't fail the request, just log the error
    } else {
      console.log('💾 Chat saved to database');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        response: aiResponse,
        sessionId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in whatsapp-web-chat:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
