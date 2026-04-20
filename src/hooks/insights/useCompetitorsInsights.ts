import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/DateRangeContext';
import { safeNum } from './utils';

const OUR_HOTEL_KEYWORDS = ['two seasons', 'twoseasons', '2 seasons'];

function isOurHotel(name: string | null | undefined) {
  if (!name) return false;
  const lo = name.toLowerCase();
  return OUR_HOTEL_KEYWORDS.some((k) => lo.includes(k));
}

export function useCompetitorsInsights() {
  const { from, to, fromISO, toISO } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'competitors', fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('Two Seasons Competitor Hotel room Rates')
        .select('id, hotel_name, checkin_date, report_date, converted_price_aed, status, dry_run, is_lowest_for_day, lowest_price_for_day_aed')
        .gte('report_date', from.toISOString().slice(0, 10))
        .lte('report_date', to.toISOString().slice(0, 10))
        .eq('dry_run', false)
        .eq('status', 'success')
        .order('report_date', { ascending: true })
        .limit(1000);
      if (error) throw error;
      const rows = data || [];

      const ours = rows.filter((r) => isOurHotel(r.hotel_name));
      const comps = rows.filter((r) => !isOurHotel(r.hotel_name));

      const ourAvg = ours.length ? ours.reduce((a, r) => a + safeNum(r.converted_price_aed), 0) / ours.length : 0;
      const compAvg = comps.length ? comps.reduce((a, r) => a + safeNum(r.converted_price_aed), 0) / comps.length : 0;
      const diff = ourAvg - compAvg;
      const diffPct = compAvg ? (diff / compAvg) * 100 : 0;

      // Rank: average price per hotel for the period, sorted ascending — our position
      const byHotel = new Map<string, number[]>();
      rows.forEach((r) => {
        const arr = byHotel.get(r.hotel_name) || [];
        arr.push(safeNum(r.converted_price_aed));
        byHotel.set(r.hotel_name, arr);
      });
      const hotelAvgs = Array.from(byHotel.entries())
        .map(([name, arr]) => ({ name, avg: arr.reduce((a, b) => a + b, 0) / Math.max(arr.length, 1) }))
        .sort((a, b) => a.avg - b.avg);
      const ourRank = hotelAvgs.findIndex((h) => isOurHotel(h.name)) + 1;

      // Trend per hotel: pivot
      const dates = Array.from(new Set(rows.map((r) => r.report_date as string))).sort();
      const hotels = Array.from(byHotel.keys());
      const trend = dates.map((d) => {
        const row: Record<string, string | number> = { label: d.slice(5) };
        hotels.forEach((h) => {
          const match = rows.find((r) => r.report_date === d && r.hotel_name === h);
          if (match) row[h] = safeNum(match.converted_price_aed);
        });
        return row;
      });

      const lowestDays = rows.filter((r) => r.is_lowest_for_day).reduce((acc, r) => {
        acc[r.hotel_name] = (acc[r.hotel_name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const lowestDaysArr = Object.entries(lowestDays)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      return {
        rows,
        kpis: { ourAvg, compAvg, diff, diffPct, ourRank, totalHotels: hotels.length },
        hotelAvgs,
        trend,
        hotels,
        lowestDaysArr,
      };
    },
  });
}
