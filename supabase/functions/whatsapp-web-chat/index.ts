import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isAllowedAttachmentUrl, buildConversationContext } from './guards.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// In-memory rate limiter (per first x-forwarded-for hop, per isolate, resets on cold
// start). NOT a security control — the hop is client-controlled and the map is per
// isolate. Authentication below is what protects this endpoint; this only blunts an
// accidental loop from a signed-in tab.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = 60000;

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
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please wait before sending again.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // AUTHENTICATION + AUTHORIZATION, before the body is parsed. This function writes into
    // "Chat History" with the service role under a real guest number, feeds that guest's
    // history to the AI and returns the answer, so it must not be weaker than the data it
    // touches (Chat History RLS = is_hotel_staff). verify_jwt = true at the gateway rejects
    // unsigned requests; the public anon key passes that check, so resolve the JWT to a
    // real auth user and check the role — exactly like whatsapp-send-message. Until
    // 2026-09-01 this function had no authentication at all (audit E1).
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token || !supabaseAnonKey) return jsonResponse({ error: 'Unauthorized' }, 401);
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userRes?.user) return jsonResponse({ error: 'Unauthorized' }, 401);
    const { data: isStaff, error: staffErr } = await supabase.rpc('is_hotel_staff', {
      _user_id: userRes.user.id,
    });
    if (staffErr || !isStaff) return jsonResponse({ error: 'Forbidden' }, 403);

    const body = await req.json();
    const { message, senderNumber, attachment } = body;

    const hasAttachment = attachment && typeof attachment === 'object' && typeof attachment.url === 'string';
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';

    if (!trimmedMessage && !hasAttachment) {
      return jsonResponse({ error: 'message or attachment is required' }, 400);
    }
    if (trimmedMessage.length > 4096) {
      return jsonResponse({ error: 'message must not exceed 4096 characters' }, 400);
    }
    if (!senderNumber || typeof senderNumber !== 'string') {
      return jsonResponse({ error: 'senderNumber is required' }, 400);
    }
    if (!/^[0-9+\-\s]{7,20}$/.test(senderNumber.trim())) {
      return jsonResponse({ error: 'senderNumber format is invalid' }, 400);
    }
    // attachment.url is forwarded to n8n and persisted in "Chat History".Media, where
    // AttachmentBubble renders it as <img>/<video>/href in every operator's browser.
    if (hasAttachment && !isAllowedAttachmentUrl(attachment.url, supabaseUrl)) {
      return jsonResponse({ error: 'attachment.url must be a signed whatsapp-attachments storage URL' }, 400);
    }

    const sanitizedMessage = trimmedMessage;
    const sanitizedSender = senderNumber.trim();

    console.log('📨 Received message from web:', { senderNumber: sanitizedSender, by: userRes.user.id });

    const webhookUrl = Deno.env.get('N8N_WHATSAPP_WEBHOOK_URL');
    if (!webhookUrl) {
      console.error('❌ N8N_WHATSAPP_WEBHOOK_URL not configured');
      return jsonResponse({ error: 'Webhook URL not configured' }, 500);
    }

    // Handoff context: the conversation up to the latest release-to-AI marker, newest 50
    // rows, rendered chronologically (guards.ts). Best-effort: a failure here must not
    // block the send.
    let conversationContext: string | null = null;
    try {
      const { data: lastReleaseRow } = await supabase
        .from('Chat History')
        .select('released_to_ai_at')
        .eq('Sender Number', sanitizedSender)
        .not('released_to_ai_at', 'is', null)
        .order('released_to_ai_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const releaseAt = lastReleaseRow?.released_to_ai_at as string | undefined;
      if (releaseAt) {
        const { data: historyRows } = await supabase
          .from('Chat History')
          .select('"Sender Message", human_reply, "Ai Reply", created_at')
          .eq('Sender Number', sanitizedSender)
          .lte('created_at', releaseAt)
          .order('created_at', { ascending: false })
          .limit(50);
        conversationContext = buildConversationContext(historyRows ?? []);
      }
    } catch (ctxErr) {
      console.error('⚠️ failed to build conversationContext:', ctxErr);
    }

    const n8nPayload: Record<string, unknown> = {
      message: sanitizedMessage,
      senderNumber: sanitizedSender,
      timestamp: new Date().toISOString(),
      source: 'web',
    };
    if (conversationContext) n8nPayload.conversationContext = conversationContext;
    if (hasAttachment) {
      n8nPayload.attachment = {
        url: String(attachment.url),
        filename: typeof attachment.filename === 'string' ? attachment.filename : '',
        mimeType: typeof attachment.mimeType === 'string' ? attachment.mimeType : '',
        size: typeof attachment.size === 'number' ? attachment.size : 0,
        kind: typeof attachment.kind === 'string' ? attachment.kind : 'document',
      };
    }

    const n8nResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n8nPayload),
    });
    console.log('📥 n8n response status:', n8nResponse.status);

    if (!n8nResponse.ok) {
      console.error('❌ n8n webhook error:', await n8nResponse.text());
      return jsonResponse({ error: 'Failed to get response from AI' }, 500);
    }

    const n8nData = await n8nResponse.json();
    const aiResponse = n8nData.output || n8nData.response || n8nData.message || n8nData.text ||
      (typeof n8nData === 'string' ? n8nData : JSON.stringify(n8nData));

    const insertPayload: Record<string, unknown> = {
      'Sender Number': sanitizedSender,
      'Sender Message': sanitizedMessage,
      'Ai Reply': aiResponse,
      created_at: new Date().toISOString(),
    };
    if (hasAttachment) insertPayload['Media'] = n8nPayload.attachment;

    // Return the inserted row id so the client can adopt `user-${id}` / `ai-${id}`
    // bubble ids — realtime echoes then dedupe exactly.
    const { data: insertedRow, error: insertError } = await supabase
      .from('Chat History')
      .insert(insertPayload)
      .select('id')
      .maybeSingle();

    if (insertError) console.error('⚠️ Failed to save chat:', insertError);
    else console.log('💾 Chat saved to database');

    return jsonResponse({
      success: true,
      response: aiResponse,
      senderNumber: sanitizedSender,
      insertedId: insertedRow?.id ?? null,
    });
  } catch (error) {
    console.error('❌ Error in whatsapp-web-chat:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
