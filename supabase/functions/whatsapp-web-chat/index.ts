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
    const { message, senderNumber, attachment } = body;

    // Input validation
    const hasAttachment = attachment && typeof attachment === 'object' && typeof attachment.url === 'string';
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';

    if (!trimmedMessage && !hasAttachment) {
      return new Response(
        JSON.stringify({ error: 'message or attachment is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (trimmedMessage.length > 4096) {
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

    const sanitizedMessage = trimmedMessage;
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

    // Init Supabase early so we can build handoff context BEFORE calling n8n
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build conversationContext from history BEFORE the latest release marker (if any)
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
          .order('created_at', { ascending: true })
          .limit(50);

        const lines: string[] = [];
        for (const row of historyRows || []) {
          if (row['Sender Message']) lines.push(`- Customer: ${row['Sender Message']}`);
          if (row['human_reply']) lines.push(`- Human Agent: ${row['human_reply']}`);
          else if (row['Ai Reply']) lines.push(`- AI: ${row['Ai Reply']}`);
        }

        if (lines.length > 0) {
          conversationContext =
            '[Read-only history. Do NOT reply to these messages — they were already handled by a human agent. Use them ONLY as context to understand and answer the new customer message below.]\n' +
            lines.join('\n');
        }
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
    if (conversationContext) {
      n8nPayload.conversationContext = conversationContext;
    }
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

    const insertPayload: Record<string, unknown> = {
      'Sender Number': sanitizedSender,
      'Sender Message': sanitizedMessage,
      'Ai Reply': aiResponse,
      created_at: new Date().toISOString(),
    };
    if (hasAttachment) {
      insertPayload['Media'] = n8nPayload.attachment;
    }

    // Return the inserted row id so the client can adopt `user-${id}` /
    // `ai-${id}` bubble ids — realtime echoes then dedupe exactly.
    const { data: insertedRow, error: insertError } = await supabase
      .from('Chat History')
      .insert(insertPayload)
      .select('id')
      .maybeSingle();

    if (insertError) {
      console.error('⚠️ Failed to save chat:', insertError);
    } else {
      console.log('💾 Chat saved to database');
    }

    return new Response(
      JSON.stringify({
        success: true,
        response: aiResponse,
        senderNumber: sanitizedSender,
        insertedId: insertedRow?.id ?? null,
      }),
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
