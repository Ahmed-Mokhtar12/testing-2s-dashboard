import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 60000; // 1 minute

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Too many requests. Please wait before retrying.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
    );
  }

  try {
    const body = await req.json();
    const { message, recipientNumber, action } = body;

    const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('Using Phone Number ID:', WHATSAPP_PHONE_NUMBER_ID ? `${WHATSAPP_PHONE_NUMBER_ID.slice(0, 6)}...` : 'NOT SET');
    console.log('Access Token set:', !!WHATSAPP_ACCESS_TOKEN);

    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error('WhatsApp credentials not configured');
    }

    // Validate recipientNumber
    if (!recipientNumber || typeof recipientNumber !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'recipientNumber is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!/^[0-9+\-\s]{7,20}$/.test(recipientNumber.trim())) {
      return new Response(
        JSON.stringify({ success: false, error: 'recipientNumber format is invalid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Handle takeover/release actions
    if (action === 'takeover' || action === 'release') {
      const isHumanControlled = action === 'takeover';
      const { error: updateError } = await supabase
        .from('Chat History')
        .update({ is_human_controlled: isHumanControlled })
        .eq('Sender Number', recipientNumber.trim());

      if (updateError) {
        console.error('Error updating human control flag:', updateError);
        throw updateError;
      }

      // On release: insert a marker row to record the exact handoff time.
      // The AI will treat any conversation BEFORE this timestamp as read-only context.
      if (action === 'release') {
        const { error: markerErr } = await supabase.from('Chat History').insert({
          'Sender Number': recipientNumber.trim(),
          released_to_ai_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
        if (markerErr) {
          console.error('Error inserting release marker:', markerErr);
        }
      }

      return new Response(
        JSON.stringify({ success: true, action, isHumanControlled }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send message via WhatsApp Cloud API
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'message is required and must be a non-empty string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (message.length > 4096) {
      return new Response(
        JSON.stringify({ success: false, error: 'message must not exceed 4096 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedMessage = message.trim();
    const sanitizedRecipient = recipientNumber.trim();

    const waResponse = await fetch(
      `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: sanitizedRecipient,
          type: 'text',
          text: { body: sanitizedMessage },
        }),
      }
    );

    const waData = await waResponse.json();

    if (!waResponse.ok) {
      console.error('WhatsApp API error:', waData?.error?.message);
      throw new Error(waData?.error?.message || 'Failed to send WhatsApp message');
    }

    console.log('WhatsApp message sent successfully');

    const { error: insertError } = await supabase
      .from('Chat History')
      .insert({
        'Sender Number': sanitizedRecipient,
        'human_reply': sanitizedMessage,
        'Ai Reply': null,
        'Sender Message': null,
        is_human_controlled: true,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Error saving human reply:', insertError);
    }

    return new Response(
      JSON.stringify({ success: true, messageId: waData?.messages?.[0]?.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in whatsapp-send-message:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
