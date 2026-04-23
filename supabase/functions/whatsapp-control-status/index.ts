import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Accept senderNumber from query string (GET) or JSON body (POST)
    let senderNumber: string | null = null;
    const url = new URL(req.url);
    senderNumber = url.searchParams.get('senderNumber');

    if (!senderNumber && req.method === 'POST') {
      try {
        const body = await req.json();
        if (body && typeof body.senderNumber === 'string') {
          senderNumber = body.senderNumber;
        }
      } catch {
        // ignore
      }
    }

    if (!senderNumber || typeof senderNumber !== 'string') {
      return new Response(
        JSON.stringify({ error: 'senderNumber is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sanitized = senderNumber.trim();
    if (!/^[0-9+\-\s]{7,20}$/.test(sanitized)) {
      return new Response(
        JSON.stringify({ error: 'senderNumber format is invalid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Use the SECURITY DEFINER helper function
    const { data: isHumanData, error: rpcError } = await supabase.rpc(
      'is_conversation_human_controlled',
      { p_sender_number: sanitized }
    );

    if (rpcError) {
      console.error('❌ RPC error:', rpcError);
      return new Response(
        JSON.stringify({ error: 'Failed to check control status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isHumanControlled = Boolean(isHumanData);

    // Also fetch the last release timestamp for context
    let lastReleaseAt: string | null = null;
    const { data: releaseRow } = await supabase
      .from('Chat History')
      .select('released_to_ai_at')
      .eq('Sender Number', sanitized)
      .not('released_to_ai_at', 'is', null)
      .order('released_to_ai_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (releaseRow?.released_to_ai_at) {
      lastReleaseAt = releaseRow.released_to_ai_at as string;
    }

    return new Response(
      JSON.stringify({
        isHumanControlled,
        lastReleaseAt,
        senderNumber: sanitized,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ whatsapp-control-status error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
