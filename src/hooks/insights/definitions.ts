// Metric definitions that exist on BOTH surfaces — the dashboard hooks in this
// directory and the Sera edge-function aggregators in
// supabase/functions/chat-with-data. They live here, pure and importable, so
// tests/unit/definition-divergence.test.ts can run the real dashboard code
// against the real Sera code over identical rows instead of comparing a copy.
//
// ZERO imports on purpose: the divergence test runs under `node --test` type
// stripping alongside the Deno-side modules.
//
// If you add a metric that both surfaces report, define it here and register
// the pair in that test. A definition that exists in two places and is written
// out twice will drift — that is not a hypothetical, it is why this file exists.

/** True when a text column carries actual content (not null, not whitespace). */
export function isNonBlank(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Numeric review scores. A null/absent/unparseable Score is excluded; zero is
 * NOT — it is a real score on the 0–5 scale this table uses.
 *
 * The dashboard previously wrote `safeNum(row.Score) > 0`, where safeNum maps
 * null to 0, so one comparison did double duty as both the null guard and an
 * arbitrary zero filter. Sera's reviews-aggregator kept zeros. Same metric,
 * two definitions: they agree only while no source has ever emitted a 0.
 */
export function reviewScores(rows: Array<{ Score?: unknown }>): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const raw = r.Score;
    if (raw === null || raw === undefined || raw === '') continue;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Mean review score, rounded to 2dp, or null when the range holds no scored
 * review. Rounding is part of the definition so the two surfaces are comparable
 * exactly rather than "close enough" — Sera's aggregator rounds the same way.
 */
export function reviewAverageScore(rows: Array<{ Score?: unknown }>): number | null {
  const scores = reviewScores(rows);
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
}

/**
 * Distinct guests in the Sera email log. Case-INSENSITIVE: mail addresses are
 * one identity regardless of casing, and 24 rows in the live log carry
 * uppercase. The dashboard used to compare raw strings while Sera lowercased,
 * so the two would disagree the first time one guest wrote in twice with
 * different capitalisation.
 */
export function emailUniqueGuests(rows: Array<{ guest_email?: unknown }>): number {
  const seen = new Set<string>();
  for (const r of rows) {
    if (isNonBlank(r.guest_email)) seen.add(String(r.guest_email).trim().toLowerCase());
  }
  return seen.size;
}

/**
 * Rows whose `is_human_controlled` flag is set.
 *
 * DO NOT read this as "messages a human answered". The flag is
 * conversation-level and mutable: whatsapp-send-message sets it per sender with
 * no date bound, so a takeover today rewrites the sender's whole history. Live,
 * 67 rows carrying it hold a guest message AND an `Ai Reply`. Kept only because
 * the WhatsApp page has shown this figure for months; `handled_by` (migration
 * 20260731201138) is the signal to trust.
 */
export function whatsappHumanControlledCount(rows: Array<{ is_human_controlled?: unknown }>): number {
  return rows.filter((r) => r.is_human_controlled === true).length;
}

/** Rows carrying human-written reply text. The other signal the same page shows. */
export function whatsappHumanReplyCount(rows: Array<{ human_reply?: unknown }>): number {
  return rows.filter((r) => isNonBlank(r.human_reply)).length;
}

/**
 * Average AED price over rows that actually carry a numeric price. A null or unparseable
 * converted_price_aed is EXCLUDED, never counted as 0 — the dashboard used to average it
 * as AED 0 and drag every hotel average, rank and diff down (audit A10). Sera's
 * rates-aggregator skips non-numbers the same way; the pair is pinned in
 * tests/unit/definition-divergence.test.ts.
 */
export function averageAedPrice(rows: Array<{ converted_price_aed?: unknown }>): number | null {
  const prices: number[] = [];
  for (const r of rows) {
    const n = typeof r.converted_price_aed === 'number' ? r.converted_price_aed : Number(r.converted_price_aed);
    if (r.converted_price_aed !== null && r.converted_price_aed !== undefined && Number.isFinite(n)) prices.push(n);
  }
  return prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
}
