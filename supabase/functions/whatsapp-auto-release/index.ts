import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { roleFromAuthorization } from './jwt-role.ts'; // sibling copy of _shared/jwt-role.ts, pinned by tests/unit/jwt-role-copies-agree.test.ts

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IDLE_MINUTES = 30;
const PAGE = 1000; // PostgREST api.max_rows — anything above is silently clamped (CLAUDE.md)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Service-role callers only (pg_cron with the service key from Vault, or an operator).
  // The sweep flips every row of every idle human-controlled sender; before 2026-09-01
  // anyone could trigger it (audit E12). verify_jwt = true makes the role claim trustworthy.
  // The live cron job still sends the ANON literal and is failing before it reaches us
  // (backlog B15) — when it is repaired it must send the service key.
  if (roleFromAuthorization(req.headers.get('Authorization')) !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1) Every active human-controlled sender. A takeover flips EVERY row of a sender, so
    // one long thread can exceed max_rows on its own and hide every other sender from an
    // unpaged select — page with .range() until a short page.
    const senders = new Set<string>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('Chat History')
        .select('"Sender Number"')
        .eq('is_human_controlled', true)
        .not('Sender Number', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error('❌ failed to fetch active human-controlled rows:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      for (const r of data ?? []) if (r['Sender Number']) senders.add(String(r['Sender Number']));
      if (!data || data.length < PAGE) break;
    }
    const senderNumbers = [...senders];

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
