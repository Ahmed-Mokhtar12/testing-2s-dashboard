// WhatsApp-style inline formatting: *bold* _italic_ ~strike~ ```mono``` plus
// URL autolinking. Pure tokenizer (no React, no deps) so node --test can cover
// it; WhatsAppMessage maps tokens to elements. Output is a token TREE rendered
// as React nodes — never HTML strings, so no sanitizer is needed.
//
// Rules (practical subset of WhatsApp's):
// - a marker opens at start-of-text or after whitespace/punctuation, and the
//   wrapped text has no leading/trailing whitespace and no newline inside;
// - unmatched or empty markers stay literal ("**", "a * b");
// - ``` blocks are matched first and their contents are never re-parsed;
// - links match http(s):// and www., with trailing punctuation trimmed.

export type WaToken =
  | { kind: 'text'; text: string }
  | { kind: 'link'; href: string; text: string }
  | { kind: 'mono'; text: string }
  | { kind: 'bold' | 'italic' | 'strike'; children: WaToken[] };

type PairMarker = { marker: string; kind: 'bold' | 'italic' | 'strike' };

const PAIR_MARKERS: PairMarker[] = [
  { marker: '*', kind: 'bold' },
  { marker: '_', kind: 'italic' },
  { marker: '~', kind: 'strike' },
];

const URL_RE = /(?:https?:\/\/|www\.)[^\s]+/gi;
const TRAILING_PUNCT_RE = /[.,:;!?)\]}'"]+$/;
const BOUNDARY_RE = /[\s\p{P}\p{S}]/u;

const linkify = (text: string): WaToken[] => {
  const out: WaToken[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const trimmed = raw.replace(TRAILING_PUNCT_RE, '');
    if (!trimmed) continue;
    const start = match.index ?? 0;
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) });
    out.push({
      kind: 'link',
      text: trimmed,
      href: trimmed.toLowerCase().startsWith('www.') ? `https://${trimmed}` : trimmed,
    });
    last = start + trimmed.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
};

const findPair = (
  text: string,
  marker: string
): { start: number; end: number } | null => {
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] !== marker) continue;
    if (i > 0 && !BOUNDARY_RE.test(text[i - 1])) continue;
    const next = text[i + 1];
    if (!next || next === marker || /\s/.test(next)) continue;
    for (let j = i + 2; j < text.length; j++) {
      if (text[j] === '\n') break;
      if (text[j] !== marker) continue;
      if (/\s/.test(text[j - 1])) continue;
      const after = text[j + 1];
      if (after !== undefined && !BOUNDARY_RE.test(after)) continue;
      return { start: i, end: j };
    }
    // no closing marker on this line — keep scanning after this opener
  }
  return null;
};

const parseInline = (text: string, markers: PairMarker[]): WaToken[] => {
  if (!text) return [];
  let best: { m: PairMarker; pos: { start: number; end: number } } | null = null;
  for (const m of markers) {
    const pos = findPair(text, m.marker);
    if (pos && (!best || pos.start < best.pos.start)) best = { m, pos };
  }
  if (!best) return linkify(text);
  const inner = text.slice(best.pos.start + 1, best.pos.end);
  const rest = text.slice(best.pos.end + 1);
  return [
    ...linkify(text.slice(0, best.pos.start)),
    {
      kind: best.m.kind,
      children: parseInline(
        inner,
        markers.filter((x) => x.marker !== best!.m.marker)
      ),
    },
    ...parseInline(rest, markers),
  ];
};

export const parseWhatsAppText = (text: string): WaToken[] => {
  if (!text) return [];
  const out: WaToken[] = [];
  // split(/```([\s\S]*?)```/) yields [text, mono, text, mono, …, text]; an
  // unclosed ``` never matches and stays literal in a text part.
  const parts = text.split(/```([\s\S]*?)```/);
  parts.forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) out.push({ kind: 'mono', text: part });
    else out.push(...parseInline(part, PAIR_MARKERS));
  });
  return out;
};
