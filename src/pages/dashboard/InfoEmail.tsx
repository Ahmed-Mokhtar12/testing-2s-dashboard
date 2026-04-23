import React from 'react';
import { Inbox, Forward, Trash2, ShieldAlert } from 'lucide-react';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { useInfoEmailInsights } from '@/hooks/insights/useInfoEmailInsights';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle, barCursor } from '@/components/dashboard/chartTheme';

const PALETTE = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-6))'];

const InfoEmailPage: React.FC = () => {
  const { data, isLoading } = useInfoEmailInsights();

  return (
    <div className="space-y-6">
      <SectionHeader title="Info Email Audit" subtitle="Auto-routing log for info@ inbox" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total received" value={data?.kpis.total ?? 0} icon={Inbox} tone="primary" loading={isLoading} />
        <KpiCard label="Forwarded" value={data?.kpis.forwarded ?? 0} icon={Forward} tone="accent" loading={isLoading} />
        <KpiCard label="Deleted" value={data?.kpis.deleted ?? 0} icon={Trash2} tone="destructive" loading={isLoading} />
        <KpiCard label="Manual override" value={data?.kpis.overridden ?? 0} icon={ShieldAlert} tone="warning" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Action breakdown">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data?.actions || []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                {(data?.actions || []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Forwarded by department" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data?.departments || []} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={140} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} />
              <Bar dataKey="value" fill="hsl(var(--chart-3))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Confidence distribution">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data?.confidence || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} />
            <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

export default InfoEmailPage;
