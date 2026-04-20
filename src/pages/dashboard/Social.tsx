import React from 'react';
import { Instagram, MessageSquare, Facebook, Hash } from 'lucide-react';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { useSocialInsights } from '@/hooks/insights/useSocialInsights';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

const PALETTE = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 } as const;

const SocialPage: React.FC = () => {
  const { data, isLoading } = useSocialInsights();

  return (
    <div className="space-y-6">
      <SectionHeader title="Social Engagement" subtitle="Instagram & Facebook DMs and comments" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="IG comments" value={data?.kpis.igComments ?? 0} icon={Hash} tone="magenta" loading={isLoading} />
        <KpiCard label="Total DMs" value={data?.kpis.totalDMs ?? 0} icon={MessageSquare} tone="primary" loading={isLoading} />
        <KpiCard label="Instagram DMs" value={data?.kpis.igDMs ?? 0} icon={Instagram} tone="accent" loading={isLoading} />
        <KpiCard label="Facebook DMs" value={data?.kpis.fbDMs ?? 0} icon={Facebook} tone="success" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Platform split">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data?.platformSplit || []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                {(data?.platformSplit || []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Event type">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data?.eventSplit || []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                {(data?.eventSplit || []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Conversation nature" description="Inferred from notes / status / message text">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data?.natureSplit || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" fill="hsl(var(--chart-3))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

export default SocialPage;
