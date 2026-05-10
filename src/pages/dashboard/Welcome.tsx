import React from 'react';
import { Send, Plane, CheckCircle2, Users } from 'lucide-react';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWelcomeInsights } from '@/hooks/insights/useWelcomeInsights';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle, lineCursor } from '@/components/dashboard/chartTheme';

const PALETTE = ['hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-3))', 'hsl(var(--chart-1))'];

const WelcomePage: React.FC = () => {
  const isMobile = useIsMobile();
  const { data, isLoading } = useWelcomeInsights();
  const k = data?.kpis;
  const chartHeight = isMobile ? 180 : 280;
  const axisFontSize = isMobile ? 9 : 11;

  return (
    <div className="space-y-6">
      <SectionHeader title="Welcome Messages" subtitle="Arrivals & welcome message delivery" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total arrivals" value={k?.arrivals ?? 0} icon={Plane} tone="primary" loading={isLoading} />
        <KpiCard label="Welcome sent" value={k?.sent ?? 0} icon={Send} tone="accent" loading={isLoading} />
        <KpiCard label="Successful" value={k?.successful ?? 0} hint={`${k?.successRate ?? 0}% rate`} icon={CheckCircle2} tone="success" loading={isLoading} />
        <KpiCard label="Unique guests" value={k?.uniqueGuests ?? 0} icon={Users} tone="magenta" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Sent per day" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={data?.trend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={lineCursor} />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-4))" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Status">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie data={data?.statusSplit || []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                {(data?.statusSplit || []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
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

export default WelcomePage;
