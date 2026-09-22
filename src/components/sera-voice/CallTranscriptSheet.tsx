import React, { useMemo } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  useSeraVoiceCall,
  parseToolCalls,
  parseToolResults,
  type SeraVoiceTurn,
  type SeraVoiceToolEvent,
} from '@/hooks/insights/useSeraVoiceCall';
import type { SeraVoiceCallRow } from '@/lib/sera-voice-aggregate';
import { DUBAI_TIMEZONE } from '@/utils/timezone';
import { cn } from '@/lib/utils';

interface CallTranscriptSheetProps {
  /** The call to show; null renders nothing (the sheet stays closed). */
  call: SeraVoiceCallRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function mmss(secs: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(secs) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function dubai(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : formatInTimeZone(d, DUBAI_TIMEZONE, 'd MMM yyyy HH:mm');
}

/** What a tool chip needs, whichever source it came from. */
interface ToolChip {
  key: string;
  tool_name: string;
  is_error: boolean;
  result_status: string | null;
  result_excerpt: string | null;
  latency_secs: number | null;
}

/** "GetRoomRate · success · 0.7 s" */
function toolChipLabel(chip: ToolChip): string {
  const status = chip.is_error ? 'error' : (chip.result_status ?? 'unknown');
  const latency = chip.latency_secs == null ? null : `${Number(chip.latency_secs).toFixed(1)} s`;
  return [chip.tool_name, status, latency].filter(Boolean).join(' · ');
}

/**
 * Chips for one agent turn. The normalised `sera_voice_call_tool_events` rows are the
 * primary source (they carry status and latency); a turn that has `tool_calls` jsonb
 * but no event rows — a call ingested before the events table existed — falls back to
 * the turn's own `tool_calls`/`tool_results` jsonb, matched by position.
 */
function chipsForTurn(turn: SeraVoiceTurn, events: SeraVoiceToolEvent[]): ToolChip[] {
  if (events.length > 0) {
    return events.map((ev) => ({
      key: `ev-${ev.turn_index}-${ev.event_index}`,
      tool_name: ev.tool_name,
      is_error: ev.is_error,
      result_status: ev.result_status,
      result_excerpt: ev.result_excerpt,
      latency_secs: ev.latency_secs,
    }));
  }
  const calls = parseToolCalls(turn.tool_calls);
  if (calls.length === 0) return [];
  const results = parseToolResults(turn.tool_results);
  return calls.map((call, i) => {
    const result = results[i]?.tool_name === call.tool_name ? results[i] : results.find((r) => r.tool_name === call.tool_name);
    return {
      key: `call-${turn.turn_index}-${i}`,
      tool_name: call.tool_name,
      is_error: result?.is_error ?? false,
      result_status: result?.result_status ?? null,
      result_excerpt: result?.result_excerpt ?? null,
      latency_secs: result?.latency_secs ?? null,
    };
  });
}

const TurnBubble: React.FC<{ turn: SeraVoiceTurn; events: SeraVoiceToolEvent[] }> = ({ turn, events }) => {
  const isUser = (turn.role ?? '').toLowerCase() === 'user';
  const chips = isUser ? [] : chipsForTurn(turn, events);
  const message = (turn.message ?? '').trim();
  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')} data-turn-role={isUser ? 'user' : 'agent'} data-turn-index={turn.turn_index}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm',
        )}
      >
        {message || <span className="italic opacity-70">(no speech)</span>}
      </div>
      <div className={cn('flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground', isUser ? 'justify-end' : 'justify-start')}>
        <span className="tabular-nums">{mmss(turn.time_in_call_secs)}</span>
        {turn.interrupted && (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal text-warning border-warning/40">interrupted</Badge>
        )}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="tool-chips">
          {chips.map((chip) => (
            <Badge
              key={chip.key}
              variant={chip.is_error ? 'destructive' : 'secondary'}
              className="h-5 px-2 text-[10px] font-normal"
              title={chip.result_excerpt ?? undefined}
            >
              {toolChipLabel(chip)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

export const CallTranscriptSheet: React.FC<CallTranscriptSheetProps> = ({ call, open, onOpenChange }) => {
  const conversationId = call?.conversation_id ?? null;
  const { data, isLoading, isError } = useSeraVoiceCall(conversationId);

  // Tool events grouped by the turn they belong to, so a chip sits under the
  // agent bubble that issued the call rather than in a separate list.
  const eventsByTurn = useMemo(() => {
    const m = new Map<number, SeraVoiceToolEvent[]>();
    for (const ev of data?.toolEvents ?? []) {
      const bucket = m.get(ev.turn_index) ?? [];
      bucket.push(ev);
      m.set(ev.turn_index, bucket);
    }
    return m;
  }, [data]);

  const turns = data?.turns ?? [];
  const title = call?.summary_title || 'Sera call';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-4 overflow-hidden p-0" data-testid="call-transcript-sheet">
        <SheetHeader className="px-6 pt-6 pr-12 text-left">
          <SheetTitle className="font-display leading-snug">{title}</SheetTitle>
          <SheetDescription className="tabular-nums">
            {dubai(call?.started_at)} · {mmss(call?.duration_secs)} · {Math.round(call?.cost_credits ?? 0)} credits · ${(Number(call?.cost_usd) || 0).toFixed(2)}
          </SheetDescription>
          {call && (
            <div className="flex flex-wrap gap-1 pt-1">
              {call.caller_extension && <Badge variant="outline" className="font-normal">ext {call.caller_extension}</Badge>}
              {call.is_answered !== true && <Badge variant="outline" className="text-muted-foreground">Unanswered</Badge>}
              {call.call_successful && <Badge variant="secondary" className="font-normal">{call.call_successful}</Badge>}
              {call.transferred_to && <Badge variant="secondary" className="font-normal">→ {call.transferred_to}</Badge>}
              {call.main_language && <Badge variant="outline" className="font-normal">{call.main_language}</Badge>}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          {call?.summary && (
            <p className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3 mb-4" data-testid="call-summary">{call.summary}</p>
          )}

          {isLoading && <p className="text-sm text-muted-foreground">Loading transcript…</p>}
          {isError && <p className="text-sm text-destructive">Couldn&apos;t load the transcript.</p>}
          {!isLoading && !isError && turns.length === 0 && (
            <p className="text-sm text-muted-foreground">No transcript stored for this call.</p>
          )}

          {turns.length > 0 && (
            <div className="flex flex-col gap-3" data-testid="call-transcript">
              {turns.map((turn) => (
                <TurnBubble key={turn.turn_index} turn={turn} events={eventsByTurn.get(turn.turn_index) ?? []} />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CallTranscriptSheet;
