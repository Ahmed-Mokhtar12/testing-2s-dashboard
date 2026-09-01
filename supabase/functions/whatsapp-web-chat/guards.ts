// supabase/functions/whatsapp-web-chat/guards.ts
// Pure helpers for whatsapp-web-chat. No imports and no Deno globals, so
// tests/unit/whatsapp-web-chat-guards.test.ts can load this under `node --test`.
// Deployed alongside index.ts (MCP deploy_edge_function: files [index.ts, guards.ts]).

/**
 * Only this project's own signed whatsapp-attachments URLs may be forwarded to n8n and
 * persisted into "Chat History".Media. Same rule as whatsapp-send-message. A prefix
 * compare is enough here because the prefix ends in a path segment, so
 * `<url>.evil.example/…` cannot match.
 */
export function isAllowedAttachmentUrl(url: unknown, supabaseUrl: string): boolean {
  if (typeof url !== 'string' || !supabaseUrl) return false;
  return url.startsWith(`${supabaseUrl}/storage/v1/object/sign/whatsapp-attachments/`);
}

export interface ContextRow {
  'Sender Message'?: string | null;
  human_reply?: string | null;
  'Ai Reply'?: string | null;
  created_at?: string;
}

export const CONTEXT_HEADER =
  '[Read-only history. Do NOT reply to these messages — they were already handled by a human agent. ' +
  'Use them ONLY as context to understand and answer the new customer message below.]';

/**
 * Rows arrive NEWEST FIRST: the query orders created_at desc so that LIMIT 50 keeps the
 * latest fifty, not the oldest fifty (the previous `order asc … limit 50` sent the START
 * of a long conversation as "context"). Rendered oldest -> newest for the model.
 */
export function buildConversationContext(rowsNewestFirst: ContextRow[]): string | null {
  const lines: string[] = [];
  for (const row of [...rowsNewestFirst].reverse()) {
    if (row['Sender Message']) lines.push(`- Customer: ${row['Sender Message']}`);
    if (row.human_reply) lines.push(`- Human Agent: ${row.human_reply}`);
    else if (row['Ai Reply']) lines.push(`- AI: ${row['Ai Reply']}`);
  }
  return lines.length ? `${CONTEXT_HEADER}\n${lines.join('\n')}` : null;
}
