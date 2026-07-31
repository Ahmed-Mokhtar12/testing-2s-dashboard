import React from 'react';
import { TrendingUp, Trophy, Building2, Percent } from 'lucide-react';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCompetitorsInsights } from '@/hooks/insights/useCompetitorsInsights';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle, barCursor, lineCursor } from '@/components/dashboard/chartTheme';

const PALETTE = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-6))'];
const fmt = (n: number) => n ? `AED ${Math.round(n).toLocaleString()}` : '—';

const CompetitorsPage: React.FC = () => {
  const isMobile = useIsMobile();
  const { data, isLoading, isError } = useCompetitorsInsights();
  const k = data?.kpis;
  const chartHeight = isMobile ? 220 : 300;
  const axisFontSize = isMobile ? 9 : 11;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 short:gap-3">
      <SectionHeader title="Competitor Rates" subtitle="Live rate comparison across the comp set (AED, post-tax)" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <KpiCard label="Our avg rate" value={fmt(k?.ourAvg ?? 0)} icon={Building2} tone="primary" loading={isLoading} error={isError} />
        <KpiCard label="Comp set avg" value={fmt(k?.compAvg ?? 0)} icon={TrendingUp} tone="accent" loading={isLoading} error={isError} />
        <KpiCard
          label="Diff vs comp set"
          value={`${(k?.diff ?? 0) >= 0 ? '+' : ''}${Math.round(k?.diff ?? 0).toLocaleString()} AED`}
          hint={`${(k?.diffPct ?? 0).toFixed(1)}%`}
          icon={Percent}
          tone={(k?.diff ?? 0) >= 0 ? 'warning' : 'success'}
          loading={isLoading}
          error={isError}
        />
        <KpiCard label="Our rank" value={k?.ourRank ? `#${k.ourRank}` : '—'} hint={`of ${k?.totalHotels ?? 0} hotels`} icon={Trophy} tone="magenta" loading={isLoading} error={isError} />
      </div>

      <ChartCard title="Rate trend per hotel" description="Daily AED price across the period" className="lg:flex-[3] lg:min-h-0" fill error={isError}>
        <ResponsiveContainer width="100%" height={isMobile ? 220 : '100%'} minHeight={isMobile ? undefined : 160}>
          <LineChart data={data?.trend || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={lineCursor} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {(data?.hotels || []).map((h, i) => (
              <Line key={h} type="monotone" dataKey={h} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:flex-[2] lg:min-h-0">
        <ChartCard title="Average price per hotel" fill error={isError}>
          <ResponsiveContainer width="100%" height={isMobile ? chartHeight : '100%'} minHeight={isMobile ? undefined : 90}>
            <BarChart data={data?.hotelAvgs || []} layout="vertical" margin={{ left: 90 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={isMobile ? 9 : 10} width={140} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} formatter={(v: number) => `AED ${Math.round(v).toLocaleString()}`} />
              <Bar dataKey="avg" fill="hsl(var(--chart-1))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Days as lowest price" fill error={isError}>
          <ResponsiveContainer width="100%" height={isMobile ? chartHeight : '100%'} minHeight={isMobile ? undefined : 90}>
            <BarChart data={data?.lowestDaysArr || []} layout="vertical" margin={{ left: 90 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={isMobile ? 9 : 10} width={140} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} />
              <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
};

export default CompetitorsPage;
