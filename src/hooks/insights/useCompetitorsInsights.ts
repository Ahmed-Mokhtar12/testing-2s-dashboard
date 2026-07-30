import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/useDateRange';
import { safeNum, fetchAllRows } from './utils';

const QUERY_STALE_TIME = 5 * 60 * 1000;
const QUERY_GC_TIME = 10 * 60 * 1000;
const OUR_HOTEL_KEYWORDS = ['two seasons', 'twoseasons', '2 seasons'];

function isOurHotel(name: string | null | undefined) {
  if (!name) return false;
  const value = name.toLowerCase();
  return OUR_HOTEL_KEYWORDS.some((keyword) => value.includes(keyword));
}

export function useCompetitorsInsights() {
  const { fromDateKey, toDateKey } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'competitors', fromDateKey, toDateKey],
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('Two Seasons Competitor Hotel room Rates')
          .select('id, hotel_name, checkin_date, report_date, converted_price_aed, status, dry_run, is_lowest_for_day, lowest_price_for_day_aed')
          .gte('report_date', fromDateKey)
          .lte('report_date', toDateKey)
          .eq('dry_run', false)
          .in('status', ['success', 'price_found'])
          .order('report_date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      );

      const ours = rows.filter((row) => isOurHotel(row.hotel_name));
      const comps = rows.filter((row) => !isOurHotel(row.hotel_name));

      const ourAvg = ours.length ? ours.reduce((sum, row) => sum + safeNum(row.converted_price_aed), 0) / ours.length : 0;
      const compAvg = comps.length ? comps.reduce((sum, row) => sum + safeNum(row.converted_price_aed), 0) / comps.length : 0;
      const diff = ourAvg - compAvg;
      const diffPct = compAvg ? (diff / compAvg) * 100 : 0;

      const byHotel = new Map<string, number[]>();
      const trendIndex = new Map<string, Map<string, number>>();
      const dates = new Set<string>();

      rows.forEach((row) => {
        const hotelName = row.hotel_name;
        const reportDate = String(row.report_date);
        const price = safeNum(row.converted_price_aed);

        dates.add(reportDate);
        const hotelRows = byHotel.get(hotelName) || [];
        hotelRows.push(price);
        byHotel.set(hotelName, hotelRows);

        if (!trendIndex.has(reportDate)) {
          trendIndex.set(reportDate, new Map());
        }
        trendIndex.get(reportDate)?.set(hotelName, price);
      });

      const hotelAvgs = Array.from(byHotel.entries())
        .map(([name, values]) => ({
          name,
          avg: values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1),
        }))
        .sort((a, b) => a.avg - b.avg);
      const ourRank = hotelAvgs.findIndex((hotel) => isOurHotel(hotel.name)) + 1;

      const hotelNames = Array.from(byHotel.keys());
      const trend = Array.from(dates)
        .sort()
        .map((date) => {
          const row: Record<string, string | number> = { label: date.slice(5) };
          const dateIndex = trendIndex.get(date);
          hotelNames.forEach((hotel) => {
            row[hotel] = dateIndex?.get(hotel) ?? 0;
          });
          return row;
        });

      const lowestDays = rows.reduce((acc, row) => {
        if (row.is_lowest_for_day) {
          acc[row.hotel_name] = (acc[row.hotel_name] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      const lowestDaysArr = Object.entries(lowestDays)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      return {
        rows,
        kpis: { ourAvg, compAvg, diff, diffPct, ourRank, totalHotels: hotelNames.length },
        hotelAvgs,
        trend,
        hotels: hotelNames,
        lowestDaysArr,
      };
    },
  });
}
