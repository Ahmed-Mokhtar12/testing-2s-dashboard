export interface RateRow { report_date: string; hotel: string; price_aed: number | null; }
export interface RatesSummary {
  days_covered: number;
  hotels: Array<{ hotel: string; quotes: number; min_aed: number | null; avg_aed: number | null }>;
  cheapest_by_day: Array<{ date: string; hotel: string; price_aed: number }>;
}

export function aggregateRates(rows: RateRow[]): RatesSummary {
  const byHotel = new Map<string, number[]>(); const quotes = new Map<string, number>();
  const byDay = new Map<string, { hotel: string; price_aed: number }>();
  for (const r of rows) {
    quotes.set(r.hotel, (quotes.get(r.hotel) ?? 0) + 1);
    if (typeof r.price_aed === 'number') {
      byHotel.set(r.hotel, [...(byHotel.get(r.hotel) ?? []), r.price_aed]);
      const best = byDay.get(r.report_date);
      if (!best || r.price_aed < best.price_aed) byDay.set(r.report_date, { hotel: r.hotel, price_aed: r.price_aed });
    } else if (!byHotel.has(r.hotel)) byHotel.set(r.hotel, []);
  }
  return {
    days_covered: new Set(rows.map(r => r.report_date)).size,
    hotels: [...byHotel.entries()].map(([hotel, ps]) => ({
      hotel, quotes: quotes.get(hotel) ?? 0,
      min_aed: ps.length ? Math.min(...ps) : null,
      avg_aed: ps.length ? Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 100) / 100 : null,
    })).sort((a, b) => a.hotel.localeCompare(b.hotel)),
    cheapest_by_day: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
  };
}
