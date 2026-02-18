import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory rate limiter (per IP, resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20;       // max requests
const RATE_LIMIT_WINDOW = 60000; // 1 minute window

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;

  entry.count++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please wait before sending again.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
    );
  }

  try {
    const body = await req.json();
    const { message, senderNumber } = body;

    // Input validation
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'message is required and must be a non-empty string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (message.length > 4096) {
      return new Response(
        JSON.stringify({ error: 'message must not exceed 4096 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!senderNumber || typeof senderNumber !== 'string') {
      return new Response(
        JSON.stringify({ error: 'senderNumber is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!/^[0-9+\-\s]{7,20}$/.test(senderNumber.trim())) {
      return new Response(
        JSON.stringify({ error: 'senderNumber format is invalid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedMessage = message.trim();
    const sanitizedSender = senderNumber.trim();

    console.log('📨 Received message from web:', { senderNumber: sanitizedSender });

    const webhookUrl = Deno.env.get('N8N_WHATSAPP_WEBHOOK_URL');
    if (!webhookUrl) {
      console.error('❌ N8N_WHATSAPP_WEBHOOK_URL not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook URL not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const n8nPayload = {
      message: sanitizedMessage,
      senderNumber: sanitizedSender,
      timestamp: new Date().toISOString(),
      source: 'web',
    };

    const n8nResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n8nPayload),
    });

    console.log('📥 n8n response status:', n8nResponse.status);

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error('❌ n8n webhook error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to get response from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const n8nData = await n8nResponse.json();
    const aiResponse = n8nData.output || n8nData.response || n8nData.message || n8nData.text ||
      (typeof n8nData === 'string' ? n8nData : JSON.stringify(n8nData));

    // Save conversation to Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: insertError } = await supabase
      .from('Chat History')
      .insert({
        'Sender Number': sanitizedSender,
        'Sender Message': sanitizedMessage,
        'Ai Reply': aiResponse,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('⚠️ Failed to save chat:', insertError);
    } else {
      console.log('💾 Chat saved to database');
    }

    return new Response(
      JSON.stringify({ success: true, response: aiResponse, senderNumber: sanitizedSender }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in whatsapp-web-chat:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
