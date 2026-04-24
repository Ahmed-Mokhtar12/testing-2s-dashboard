import React from 'react';
import { MessageCircle, Users, UserCog, Archive } from 'lucide-react';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { useWhatsAppInsights } from '@/hooks/insights/useWhatsAppInsights';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle, barCursor, lineCursor } from '@/components/dashboard/chartTheme';

const PALETTE = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const WhatsAppPage: React.FC = () => {
  const { data, isLoading } = useWhatsAppInsights();

  return (
    <div className="dark bg-background text-foreground -m-4 p-4 md:-m-6 md:p-6 rounded-lg">
    <div className="space-y-6">
      <SectionHeader title="WhatsApp" subtitle="Guest conversations on WhatsApp" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total messages" value={data?.kpis.total ?? 0} icon={MessageCircle} tone="primary" loading={isLoading} />
        <KpiCard label="Unique guests" value={data?.kpis.uniqueGuests ?? 0} icon={Users} tone="accent" loading={isLoading} />
        <KpiCard label="Human-controlled" value={data?.kpis.humanControlled ?? 0} icon={UserCog} tone="magenta" loading={isLoading} />
        <KpiCard label="Archived" value={data?.kpis.archived ?? 0} icon={Archive} tone="warning" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Messages per day" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data?.trend || []}>
              <defs>
                <linearGradient id="wa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={lineCursor} />
              <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-2))" fill="url(#wa)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Reply mix">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data?.replyMix || []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                {(data?.replyMix || []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Top guests by message volume">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data?.topGuests || []} layout="vertical" margin={{ left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} />
            <Bar dataKey="value" fill="hsl(var(--chart-3))" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
    </div>
  );
};

export default WhatsAppPage;
