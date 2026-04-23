import React from 'react';
import { Mail, ArrowDownToLine, ArrowUpFromLine, Layers } from 'lucide-react';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { useEmailInsights } from '@/hooks/insights/useEmailInsights';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle, barCursor } from '@/components/dashboard/chartTheme';

const PALETTE = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-6))'];

const EmailPage: React.FC = () => {
  const { data, isLoading } = useEmailInsights();

  return (
    <div className="space-y-6">
      <SectionHeader title="Email" subtitle="Email threads across guest, website, and burst channels" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total threads" value={data?.kpis.total ?? 0} icon={Mail} tone="primary" loading={isLoading} />
        <KpiCard label="Inbound" value={data?.kpis.inbound ?? 0} icon={ArrowDownToLine} tone="accent" loading={isLoading} />
        <KpiCard label="Outbound" value={data?.kpis.outbound ?? 0} icon={ArrowUpFromLine} tone="magenta" loading={isLoading} />
        <KpiCard label="Burst platforms" value={data?.kpis.platformsCount ?? 0} icon={Layers} tone="success" loading={isLoading} />
      </div>

      <ChartCard title="Threads per day · stacked by source">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data?.trend || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="guest" stackId="a" fill="hsl(var(--chart-1))" radius={[0, 0, 0, 0]} />
            <Bar dataKey="website" stackId="a" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Categories">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data?.categories || []} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} />
              <Bar dataKey="value" fill="hsl(var(--chart-3))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Burst platform split">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data?.platforms || []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                {(data?.platforms || []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
};

export default EmailPage;
