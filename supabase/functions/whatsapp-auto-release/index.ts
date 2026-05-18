import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IDLE_MINUTES = 30;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1) Find all active human-controlled sender numbers
    const { data: activeRows, error: activeErr } = await supabase
      .from('Chat History')
      .select('"Sender Number"')
      .eq('is_human_controlled', true)
      .not('Sender Number', 'is', null);

    if (activeErr) {
      console.error('❌ failed to fetch active human-controlled rows:', activeErr);
      return new Response(JSON.stringify({ error: activeErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const senderNumbers = [
      ...new Set((activeRows || []).map((r: any) => r['Sender Number']).filter(Boolean)),
    ] as string[];

    if (senderNumbers.length === 0) {
      return new Response(JSON.stringify({ checked: 0, released: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cutoff = new Date(Date.now() - IDLE_MINUTES * 60 * 1000).toISOString();
    const released: string[] = [];

    for (const sender of senderNumbers) {
      // Get latest activity (any row with actual content) for this sender
      const { data: latest, error: latestErr } = await supabase
        .from('Chat History')
        .select('created_at, "Sender Message", human_reply, "Ai Reply"')
        .eq('Sender Number', sender)
        .order('created_at', { ascending: false })
        .limit(20);

      if (latestErr) {
        console.error(`⚠️ fetch latest failed for ${sender}:`, latestErr);
        continue;
      }

      // Find most recent row that has actual message content
      const lastActivity = (latest || []).find(
        (r: any) => r['Sender Message'] || r['human_reply'] || r['Ai Reply']
      );

      if (!lastActivity) continue;

      if (lastActivity.created_at > cutoff) {
        // Still within active window
        continue;
      }

      // Idle > 30 min → auto-release
      const { error: updErr } = await supabase
        .from('Chat History')
        .update({ is_human_controlled: false })
        .eq('Sender Number', sender)
        .eq('is_human_controlled', true);

      if (updErr) {
        console.error(`❌ update failed for ${sender}:`, updErr);
        continue;
      }

      // Insert marker row
      const { error: insErr } = await supabase.from('Chat History').insert({
        'Sender Number': sender,
        released_to_ai_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      if (insErr) {
        console.error(`⚠️ marker insert failed for ${sender}:`, insErr);
        continue;
      }

      console.log(`✅ auto-released ${sender} after ${IDLE_MINUTES}m idle`);
      released.push(sender);
    }

    return new Response(
      JSON.stringify({ checked: senderNumbers.length, released }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ whatsapp-auto-release error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
