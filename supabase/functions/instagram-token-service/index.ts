// VENDORED from the deployed function (slug: instagram-token-service, version: 3) on 2026-07-31.
// Recovered because the March revert left this function deployed with no repo
// source. This file is a verbatim record of production, not a reviewed source
// of truth — do NOT redeploy from it without reviewing it first.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import {
  authorizeServiceRole,
  buildDirectMessageRequest,
  classifyMetaFailure,
  shouldNotify,
  validateRequest,
} from './core.mjs';

const SECRET_NAME = 'instagram_primary_access_token';
const META_VERSION = 'v24.0';
const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
if (!databaseUrl) throw new Error('SUPABASE_DB_URL is not configured');
const sql = postgres(databaseUrl, { max: 1, prepare: false });

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function getSecret() {
  const rows = await sql<{ id: string; decrypted_secret: string }[]>`
    select id::text, decrypted_secret
    from vault.decrypted_secrets
    where name = ${SECRET_NAME}
    limit 2
  `;
  if (rows.length !== 1 || !rows[0].decrypted_secret) throw new Error('TOKEN_NOT_CONFIGURED');
  return rows[0];
}

async function getStatus() {
  const rows = await sql<{
    next_refresh_at: string;
    status: string;
    consecutive_failures: number;
  }[]>`
    select next_refresh_at::text, status, consecutive_failures
    from private.integration_secret_status
    where secret_name = ${SECRET_NAME}
  `;
  if (rows.length !== 1) throw new Error('STATUS_NOT_CONFIGURED');
  return rows[0];
}

async function recordFailure(errorCode: string, state: string) {
  const rows = await sql<{ consecutive_failures: number }[]>`
    update private.integration_secret_status
    set status = ${state},
        last_error_code = ${errorCode},
        last_error_at = now(),
        consecutive_failures = consecutive_failures + 1,
        updated_at = now()
    where secret_name = ${SECRET_NAME}
    returning consecutive_failures
  `;
  const failures = rows[0]?.consecutive_failures ?? 1;
  return json({
    ok: false,
    status: state,
    error_code: errorCode,
    consecutive_failures: failures,
    notify: shouldNotify(failures),
  }, state === 'reauthorization_required' ? 401 : 503);
}

async function refreshIfDue() {
  const status = await getStatus();
  if (new Date(status.next_refresh_at).getTime() > Date.now()) {
    return json({ ok: true, status: 'not_due', notify: false });
  }

  const current = await getSecret();
  let refreshResponse: Response;
  try {
    const refreshUrl = new URL('https://graph.instagram.com/refresh_access_token');
    refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
    refreshUrl.searchParams.set('access_token', current.decrypted_secret);
    refreshResponse = await fetch(refreshUrl, { method: 'GET' });
  } catch {
    return recordFailure('META_REFRESH_NETWORK_ERROR', 'refresh_failed');
  }

  const refreshPayload = await refreshResponse.json().catch(() => ({}));
  const replacement = typeof refreshPayload?.access_token === 'string'
    ? refreshPayload.access_token.trim()
    : '';
  const expiresIn = Number(refreshPayload?.expires_in);
  if (!refreshResponse.ok || !replacement || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    const state = classifyMetaFailure(refreshResponse.status, refreshPayload);
    return recordFailure(
      state === 'reauthorization_required' ? 'META_TOKEN_REAUTHORIZATION_REQUIRED' : 'META_REFRESH_REJECTED',
      state,
    );
  }

  const verifyUrl = new URL(`https://graph.instagram.com/${META_VERSION}/me`);
  verifyUrl.searchParams.set('fields', 'id,username');
  verifyUrl.searchParams.set('access_token', replacement);
  const verifyResponse = await fetch(verifyUrl, { method: 'GET' }).catch(() => null);
  const verifyPayload = verifyResponse ? await verifyResponse.json().catch(() => ({})) : {};
  if (!verifyResponse?.ok || !verifyPayload?.id) {
    return recordFailure('META_REPLACEMENT_VERIFICATION_FAILED', 'refresh_failed');
  }

  await sql.begin(async (transaction) => {
    await transaction`
      select vault.update_secret(
        ${current.id}::uuid,
        ${replacement},
        ${SECRET_NAME},
        'Instagram long-lived token used only by instagram-token-service'
      )
    `;
    await transaction`
      update private.integration_secret_status
      set refreshed_at = now(),
          next_refresh_at = now() + interval '45 days',
          status = 'active',
          last_error_code = null,
          last_error_at = null,
          consecutive_failures = 0,
          updated_at = now()
      where secret_name = ${SECRET_NAME}
    `;
  });

  return json({ ok: true, status: 'refreshed', notify: false, expires_in: expiresIn });
}

async function reply(commentId: string, message: string) {
  const current = await getSecret();
  const form = new URLSearchParams({ message, access_token: current.decrypted_secret });
  const response = await fetch(
    `https://graph.instagram.com/${META_VERSION}/${commentId}/replies`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    },
  ).catch(() => null);
  const payload = response ? await response.json().catch(() => ({})) : {};
  if (!response?.ok) {
    const state = classifyMetaFailure(response?.status ?? 503, payload);
    return json({
      ok: false,
      status: state,
      error_code: state === 'reauthorization_required'
        ? 'META_TOKEN_REAUTHORIZATION_REQUIRED'
        : 'META_REPLY_FAILED',
    }, response?.status ?? 503);
  }
  return json({ ok: true, status: 'reply_sent', reply_id: payload?.id ?? null });
}

async function sendDirectMessage(
  igUserId: string,
  recipientId: string,
  message: string,
) {
  const current = await getSecret();
  const request = buildDirectMessageRequest(META_VERSION, current.decrypted_secret, {
    ig_user_id: igUserId,
    recipient_id: recipientId,
    message,
  });
  const response = await fetch(request.url, request.init).catch(() => null);
  const payload = response ? await response.json().catch(() => ({})) : {};
  if (!response?.ok) {
    const state = classifyMetaFailure(response?.status ?? 503, payload);
    return json({
      ok: false,
      status: state,
      error_code: state === 'reauthorization_required'
        ? 'META_TOKEN_REAUTHORIZATION_REQUIRED'
        : 'META_DM_SEND_FAILED',
    }, response?.status ?? 503);
  }
  return json({
    ok: true,
    status: 'dm_sent',
    message_id: payload?.message_id ?? null,
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ ok: false, error_code: 'METHOD_NOT_ALLOWED' }, 405);
  if (!authorizeServiceRole(request.headers.get('authorization') ?? '')) {
    return json({ ok: false, error_code: 'UNAUTHORIZED' }, 401);
  }

  let input;
  try {
    input = validateRequest(await request.json());
  } catch (error) {
    return json({
      ok: false,
      error_code: error instanceof Error ? error.message : 'INVALID_REQUEST',
    }, 400);
  }

  try {
    if (input.action === 'health') {
      await getSecret();
      await getStatus();
      return json({ ok: true, status: 'configured' });
    }
    if (input.action === 'refresh_if_due') return await refreshIfDue();
    if (input.action === 'send_dm') {
      return await sendDirectMessage(
        input.ig_user_id,
        input.recipient_id,
        input.message,
      );
    }
    return await reply(input.comment_id, input.message);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    const safeCode = ['TOKEN_NOT_CONFIGURED', 'STATUS_NOT_CONFIGURED'].includes(code)
      ? code
      : 'INTERNAL_ERROR';
    return json({ ok: false, status: 'configuration_error', error_code: safeCode, notify: true }, 503);
  }
});
