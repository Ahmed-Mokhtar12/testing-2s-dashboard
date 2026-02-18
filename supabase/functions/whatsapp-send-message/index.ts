import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, recipientNumber, action } = await req.json();

    const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error('WhatsApp credentials not configured');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Handle takeover/release actions (no message sending needed)
    if (action === 'takeover' || action === 'release') {
      const isHumanControlled = action === 'takeover';

      // Update all recent records for this sender number
      const { error: updateError } = await supabase
        .from('Chat History')
        .update({ is_human_controlled: isHumanControlled })
        .eq('Sender Number', recipientNumber);

      if (updateError) {
        console.error('Error updating human control flag:', updateError);
        throw updateError;
      }

      return new Response(
        JSON.stringify({ success: true, action, isHumanControlled }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send message via WhatsApp Cloud API
    if (!message || !recipientNumber) {
      throw new Error('message and recipientNumber are required');
    }

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
          to: recipientNumber,
          type: 'text',
          text: { body: message },
        }),
      }
    );

    const waData = await waResponse.json();

    if (!waResponse.ok) {
      console.error('WhatsApp API error:', waData);
      throw new Error(waData?.error?.message || 'Failed to send WhatsApp message');
    }

    console.log('WhatsApp message sent:', waData);

    // Save the human reply to Supabase
    const { error: insertError } = await supabase
      .from('Chat History')
      .insert({
        'Sender Number': recipientNumber,
        'human_reply': message,
        'Ai Reply': null,
        'Sender Message': null,
        is_human_controlled: true,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Error saving human reply:', insertError);
      // Don't throw - message was sent successfully
    }

    return new Response(
      JSON.stringify({ success: true, messageId: waData?.messages?.[0]?.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in whatsapp-send-message:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
