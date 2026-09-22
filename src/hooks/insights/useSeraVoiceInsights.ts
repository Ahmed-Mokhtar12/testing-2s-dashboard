import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/useDateRange';
import { fetchAllRows } from './utils';
import { dubaiDateKey } from '@/utils/timezone';
import {
  aggregateSeraVoice,
  SERA_VOICE_LIST_COLUMNS,
  type SeraVoiceCallRow,
  type SeraVoiceInsights,
} from '@/lib/sera-voice-aggregate';

const QUERY_STALE_TIME = 5 * 60 * 1000;
const QUERY_GC_TIME = 10 * 60 * 1000;

/**
 * Sera Voice page data: every `sera_voice_calls_v` row whose Dubai `call_date` falls inside the
 * selected range (answered + unanswered), aggregated by the pure `aggregateSeraVoice`.
 */
export function useSeraVoiceInsights() {
  const { fromDateKey, toDateKey } = useDateRange();
  // Poll only while the selected range can still receive calls (its end is today in Dubai);
  // historical ranges never change, so they keep the plain 5-min cache.
  const includesToday = toDateKey >= dubaiDateKey(new Date());

  return useQuery<SeraVoiceInsights>({
    queryKey: ['insights', 'sera-voice', fromDateKey, toDateKey],
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
    // Live page: the archive workflow lands a call ≤ 2 min after it ends; poll while the tab is
    // visible and on focus so a new call shows within ~3 min with no reload (Codex C3).
    refetchInterval: includesToday ? 60_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    queryFn: async () => {
      const rows = await fetchAllRows<SeraVoiceCallRow>((from, to) =>
        supabase
          .from('sera_voice_calls_v')
          .select(SERA_VOICE_LIST_COLUMNS)
          .gte('call_date', fromDateKey)
          .lte('call_date', toDateKey)
          .order('started_at', { ascending: false })
          .range(from, to)
      );
      return aggregateSeraVoice(rows, fromDateKey, toDateKey);
    },
  });
}
