// Pure aggregation logic for the query_reviews tool.
// ZERO imports on purpose: this module runs under Deno (edge deploy)
// and under Node 24 type-stripping (unit tests via `node --test`).

export interface ReviewRow { date: string; source: string | null; score: number | null; hotel: string | null; }
export interface ReviewsSummary {
  total_reviews: number; average_score: number | null;
  by_source: Array<{ source: string; reviews: number; average_score: number | null }>;
  by_month: Array<{ month: string; reviews: number; average_score: number | null }>;
}

const avg = (xs: number[]) => xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;

export function aggregateReviews(rows: ReviewRow[]): ReviewsSummary {
  const scores = rows.map(r => r.score).filter((s): s is number => typeof s === 'number');
  const group = (key: (r: ReviewRow) => string) => {
    const m = new Map<string, ReviewRow[]>();
    for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) ?? []), r]); }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  };
  return {
    total_reviews: rows.length,
    average_score: avg(scores),
    by_source: group(r => r.source ?? 'unknown').map(([source, rs]) => ({ source, reviews: rs.length, average_score: avg(rs.map(r => r.score).filter((s): s is number => typeof s === 'number')) })),
    by_month: group(r => (r.date ?? '').slice(0, 7)).map(([month, rs]) => ({ month, reviews: rs.length, average_score: avg(rs.map(r => r.score).filter((s): s is number => typeof s === 'number')) })),
  };
}
