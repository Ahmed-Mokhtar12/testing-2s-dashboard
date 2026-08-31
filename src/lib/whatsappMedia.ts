// One parser for the "Chat History".Media column, shared by the history,
// polling, and realtime paths in useWhatsAppChat so a row renders identically
// however it arrives. Pure module (no React/Supabase imports) so
// tests/unit/whatsapp-media-parse.test.ts can import it under node --test.
//
// Live column contents when this was written (2026-08-31, 36,525 rows):
// 6,450 blank strings, 58 whitespace-only junk strings (previously rendered
// as garbage link bubbles), 362 Drive links often carrying a trailing \n,
// 12 structured objects, 4 arrays (unhandled by every previous parser too).

export type MediaAttachmentKind = 'document' | 'image' | 'video';

export interface MediaAttachment {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  kind: MediaAttachmentKind;
}

export interface ParsedMedia {
  mediaUrl?: string;
  attachment?: MediaAttachment;
}

const fromObject = (m: Record<string, unknown>): ParsedMedia => {
  const rawUrl = (m.url || m.link || m.src) as unknown;
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!url) return {};
  if (typeof m.kind === 'string' && m.kind) {
    return {
      attachment: {
        url,
        filename: typeof m.filename === 'string' && m.filename ? m.filename : 'file',
        mimeType: typeof m.mimeType === 'string' ? m.mimeType : '',
        size: typeof m.size === 'number' ? m.size : 0,
        kind: m.kind as MediaAttachmentKind,
      },
    };
  }
  return { mediaUrl: url };
};

export const parseMediaColumn = (raw: unknown): ParsedMedia => {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return {}; // blank/whitespace-only — treat as no media
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed !== raw) return parseMediaColumn(parsed);
      } catch {
        // not JSON — fall through and treat as a bare URL
      }
    }
    return { mediaUrl: trimmed };
  }
  if (Array.isArray(raw)) return {};
  if (typeof raw === 'object') return fromObject(raw as Record<string, unknown>);
  return {};
};

export const hasMediaContent = (raw: unknown): boolean => {
  const parsed = parseMediaColumn(raw);
  return Boolean(parsed.mediaUrl || parsed.attachment);
};
