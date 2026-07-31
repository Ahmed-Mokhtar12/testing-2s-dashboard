export function authorizeServiceRole(authorization) {
  if (!authorization?.startsWith('Bearer ')) return false;
  try {
    const payload = authorization.slice(7).split('.')[1];
    if (!payload) return false;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = globalThis.atob
      ? globalThis.atob(normalized)
      : Buffer.from(normalized, 'base64').toString('utf8');
    return JSON.parse(json).role === 'service_role';
  } catch {
    return false;
  }
}

export function validateRequest(input) {
  if (!input || typeof input !== 'object') throw new Error('INVALID_REQUEST');
  if (input.action === 'health' || input.action === 'refresh_if_due') {
    return { action: input.action };
  }
  if (input.action === 'send_dm') {
    const igUserId = String(input.ig_user_id ?? '');
    const recipientId = String(input.recipient_id ?? '');
    const message = String(input.message ?? '').trim();
    if (!/^\d{5,30}$/.test(igUserId)) throw new Error('INVALID_IG_USER_ID');
    if (!/^\d{5,30}$/.test(recipientId)) throw new Error('INVALID_RECIPIENT_ID');
    if (message.length < 1 || message.length > 1000) throw new Error('INVALID_MESSAGE');
    return {
      action: 'send_dm',
      ig_user_id: igUserId,
      recipient_id: recipientId,
      message,
    };
  }
  if (input.action !== 'reply') throw new Error('INVALID_ACTION');

  const commentId = String(input.comment_id ?? '');
  const message = String(input.message ?? '').trim();
  if (!/^\d{5,30}$/.test(commentId)) throw new Error('INVALID_COMMENT_ID');
  if (message.length < 1 || message.length > 1000) throw new Error('INVALID_MESSAGE');
  return { action: 'reply', comment_id: commentId, message };
}

export function buildDirectMessageRequest(metaVersion, accessToken, input) {
  return {
    url: `https://graph.instagram.com/${metaVersion}/${input.ig_user_id}/messages`,
    init: {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_type: 'RESPONSE',
        recipient: { id: input.recipient_id },
        message: { text: input.message },
      }),
    },
  };
}

export function classifyMetaFailure(status, payload) {
  const code = Number(payload?.error?.code);
  const message = String(payload?.error?.message ?? '').toLowerCase();
  if (code === 190 || /expired|revoked|invalid access token/.test(message)) {
    return 'reauthorization_required';
  }
  return status >= 500 ? 'refresh_failed' : 'refresh_failed';
}

export function shouldNotify(consecutiveFailures) {
  return consecutiveFailures === 1 || consecutiveFailures === 3;
}
