import React from 'react';
import { Inbox, Forward, Trash2, ShieldAlert } from 'lucide-react';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { useInfoEmailInsights } from '@/hooks/insights/useInfoEmailInsights';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle, barCursor } from '@/components/dashboard/chartTheme';

const PALETTE = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-6))'];

const InfoEmailPage: React.FC = () => {
  const isMobile = useIsMobile();
  const { data, isLoading, isError } = useInfoEmailInsights();
  const chartHeight = isMobile ? 180 : 280;
  const axisFontSize = isMobile ? 9 : 11;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 short:gap-3">
      <SectionHeader title="Info Email Audit" subtitle="Auto-routing log for info@ inbox" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <KpiCard label="Total received" value={data?.kpis.total ?? 0} icon={Inbox} tone="primary" loading={isLoading} error={isError} />
        <KpiCard label="Forwarded" value={data?.kpis.forwarded ?? 0} icon={Forward} tone="accent" loading={isLoading} error={isError} />
        <KpiCard label="Deleted" value={data?.kpis.deleted ?? 0} icon={Trash2} tone="destructive" loading={isLoading} error={isError} />
        <KpiCard label="Manual override" value={data?.kpis.overridden ?? 0} icon={ShieldAlert} tone="warning" loading={isLoading} error={isError} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:flex-1 lg:min-h-0">
        <ChartCard title="Action breakdown" fill error={isError}>
          <ResponsiveContainer width="100%" height={isMobile ? chartHeight : '100%'} minHeight={isMobile ? undefined : 160}>
            <PieChart>
              <Pie data={data?.actions || []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                {(data?.actions || []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Forwarded by department" className="lg:col-span-2" fill error={isError}>
          <ResponsiveContainer width="100%" height={isMobile ? chartHeight : '100%'} minHeight={isMobile ? undefined : 160}>
            <BarChart data={data?.departments || []} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} width={140} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} />
              <Bar dataKey="value" fill="hsl(var(--chart-3))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Confidence distribution" className="lg:flex-1 lg:min-h-0" fill error={isError}>
        <ResponsiveContainer width="100%" height={isMobile ? chartHeight : '100%'} minHeight={isMobile ? undefined : 160}>
          <BarChart data={data?.confidence || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} />
            <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

export default InfoEmailPage;
