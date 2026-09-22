import React, { useState } from 'react';
import {
  PhoneCall, PhoneMissed, Clock, Timer, Coins, DollarSign, Gauge, CheckCircle2,
  ArrowRightLeft, Tag, ClipboardList,
} from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle, lineCursor, barCursor } from '@/components/dashboard/chartTheme';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDateRange } from '@/contexts/useDateRange';
import { useSeraVoiceInsights } from '@/hooks/insights/useSeraVoiceInsights';
import type { SeraVoiceCallRow } from '@/lib/sera-voice-aggregate';
import { DUBAI_TIMEZONE } from '@/utils/timezone';
import { CallTranscriptSheet } from '@/components/sera-voice/CallTranscriptSheet';
import { cn } from '@/lib/utils';

const PALETTE = ['hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-3))', 'hsl(var(--chart-1))', 'hsl(var(--chart-2))'];

/** 83 → "1:23". Nullable input renders "0:00" rather than NaN. */
function formatMmSs(secs: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(secs) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Dubai wall-clock of a timestamptz, "d MMM HH:mm". Nullable/garbage → "—". */
function formatDubai(iso: string | null | undefined, pattern = 'd MMM HH:mm'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return formatInTimeZone(d, DUBAI_TIMEZONE, pattern);
}

function formatUsd(v: number | null | undefined, dp = 2): string {
  return `$${(Number(v) || 0).toFixed(dp)}`;
}

/** Badge classes for the call outcome. Unanswered attempts are greyed out so they
    never read as a Sera failure — Sera did not get to speak. */
function OutcomeBadge({ row }: { row: SeraVoiceCallRow }) {
  if (row.is_answered !== true) {
    return <Badge variant="outline" className="text-muted-foreground border-border/60">Unanswered</Badge>;
  }
  const outcome = (row.call_successful ?? 'unknown').toLowerCase();
  if (outcome === 'success') {
    return <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/20">success</Badge>;
  }
  if (outcome === 'failure') {
    return <Badge variant="destructive">failure</Badge>;
  }
  return <Badge variant="secondary">unknown</Badge>;
}

const SeraVoicePage: React.FC = () => {
  const isMobile = useIsMobile();
  const { setPreset } = useDateRange();
  const { data, isLoading, isError, isFetching, isRefetchError, dataUpdatedAt } = useSeraVoiceInsights();
  const [selected, setSelected] = useState<SeraVoiceCallRow | null>(null);

  const k = data?.kpis;
  const rows = data?.rows ?? [];
  const chartHeight = isMobile ? 180 : 240;
  const axisFontSize = isMobile ? 9 : 11;
  // A failed background refresh keeps the last good data on screen (react-query keeps `data`);
  // only a failed FIRST load is an error state for the cards (kpi-error-states contract).
  const showError = isError && data === undefined;
  const isEmpty = !isLoading && !showError && rows.length === 0;
  const updatedLabel = dataUpdatedAt ? formatDubai(new Date(dataUpdatedAt).toISOString(), 'HH:mm') : '—';

  return (
    <div className="flex flex-col gap-4 short:gap-3">
      <SectionHeader title="Sera Voice" subtitle="Calls answered by Sera, the AI phone agent" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <KpiCard label="Calls answered" value={k?.answered ?? 0} icon={PhoneCall} tone="primary" loading={isLoading} error={showError} />
        <KpiCard label="Unanswered attempts" value={k?.unanswered ?? 0} icon={PhoneMissed} tone="warning" loading={isLoading} error={showError} />
        <KpiCard label="Total minutes" value={(k?.totalMinutes ?? 0).toFixed(1)} icon={Clock} tone="accent" loading={isLoading} error={showError} />
        <KpiCard label="Avg duration" value={formatMmSs(k?.avgDurationSecs)} hint="answered calls" icon={Timer} tone="accent" loading={isLoading} error={showError} />
        <KpiCard label="Credits" value={Math.round(k?.credits ?? 0)} icon={Coins} tone="magenta" loading={isLoading} error={showError} />
        <KpiCard label="Cost USD" value={formatUsd(k?.costUsd, 2)} icon={DollarSign} tone="magenta" loading={isLoading} error={showError} />
        <KpiCard label="Cost / minute" value={formatUsd(k?.costPerMinuteUsd, 3)} icon={Gauge} tone="magenta" loading={isLoading} error={showError} />
        <KpiCard label="Success rate" value={`${k?.successRatePct ?? 0}%`} hint="of answered calls" icon={CheckCircle2} tone="success" loading={isLoading} error={showError} />
        <KpiCard label="Transfers" value={k?.transfers ?? 0} icon={ArrowRightLeft} tone="primary" loading={isLoading} error={showError} />
        <KpiCard label="Rate quotes" value={k?.rateQuotes ?? 0} icon={Tag} tone="success" loading={isLoading} error={showError} />
        <KpiCard label="QMS requests" value={k?.qmsRequests ?? 0} icon={ClipboardList} tone="warning" loading={isLoading} error={showError} />
      </div>

      {isEmpty && (
        <Card className="bg-card-gradient border border-border/60 shadow-card-soft p-6 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in" data-testid="sera-voice-empty">
          <div>
            <h2 className="font-display font-semibold text-base">No Sera calls in this range</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Widen the range to see recent activity.</p>
          </div>
          <Button variant="outline" onClick={() => setPreset('last30')}>Show last 30 days</Button>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Calls per day" className="lg:col-span-2" fill error={showError}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={data?.callsPerDay || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={lineCursor} />
              <Line type="monotone" dataKey="value" name="Calls" stroke="hsl(var(--chart-4))" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Outcome" description="Answered calls" fill error={showError}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie data={data?.outcomeSplit || []} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3}>
                {(data?.outcomeSplit || []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Minutes per day" className="lg:col-span-2" fill error={showError}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data?.minutesPerDay || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} />
              <Bar dataKey="value" name="Minutes" fill="hsl(var(--chart-5))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Transfers by extension" fill error={showError}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data?.transfersByExtension || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} />
              <Bar dataKey="value" name="Transfers" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Calls by hour" description="Dubai time, answered calls" className="lg:col-span-2" fill error={showError}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data?.byHour || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} interval={isMobile ? 3 : 1} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} />
              <Bar dataKey="value" name="Calls" fill="hsl(var(--chart-3))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tools used" description="Calls per tool" fill error={showError}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data?.toolUsage || []} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} horizontal={false} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={isMobile ? 80 : 110} stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} />
              <Bar dataKey="value" name="Calls" fill="hsl(var(--chart-2))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title="Calls"
        description={`Newest first — click a row for the transcript · updated ${updatedLabel} · auto-refresh 1 min${isFetching ? ' · refreshing…' : ''}${isRefetchError ? ' · last refresh failed' : ''}`}
        error={showError}
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground px-1 py-4">Loading calls…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1 py-4">No calls in this range.</p>
        ) : (
          <Table data-testid="sera-voice-calls-table">
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Caller</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Tools</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Transfer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const answered = row.is_answered === true;
                return (
                  <TableRow
                    key={row.conversation_id ?? i}
                    data-conversation-id={row.conversation_id ?? ''}
                    className={cn('cursor-pointer', !answered && 'text-muted-foreground')}
                    onClick={() => setSelected(row)}
                  >
                    <TableCell className="whitespace-nowrap tabular-nums">{formatDubai(row.started_at)}</TableCell>
                    <TableCell className="tabular-nums">{row.caller_extension || '—'}</TableCell>
                    <TableCell className="tabular-nums">{answered ? formatMmSs(row.duration_secs) : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(row.cost_credits ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsd(row.cost_usd, 2)}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{row.summary_title || '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(row.tools_used ?? []).map((t) => (
                          <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell><OutcomeBadge row={row} /></TableCell>
                    <TableCell className="tabular-nums">{row.transferred_to || '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ChartCard>

      <CallTranscriptSheet call={selected} open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }} />
    </div>
  );
};

export default SeraVoicePage;
