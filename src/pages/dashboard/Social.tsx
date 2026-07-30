import React from 'react';
import { Instagram, MessageSquare, Facebook, Hash } from 'lucide-react';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSocialInsights } from '@/hooks/insights/useSocialInsights';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle, barCursor } from '@/components/dashboard/chartTheme';

const PALETTE = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const SocialPage: React.FC = () => {
  const isMobile = useIsMobile();
  const { data, isLoading } = useSocialInsights();
  const chartHeight = isMobile ? 180 : 280;
  const axisFontSize = isMobile ? 9 : 11;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 short:gap-3">
      <SectionHeader title="Social Engagement" subtitle="Instagram & Facebook DMs and comments" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <KpiCard label="IG comments" value={data?.kpis.igComments ?? 0} icon={Hash} tone="magenta" loading={isLoading} />
        <KpiCard label="Total DMs" value={data?.kpis.totalDMs ?? 0} icon={MessageSquare} tone="primary" loading={isLoading} />
        <KpiCard label="Instagram DMs" value={data?.kpis.igDMs ?? 0} icon={Instagram} tone="accent" loading={isLoading} />
        <KpiCard label="Facebook DMs" value={data?.kpis.fbDMs ?? 0} icon={Facebook} tone="success" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:flex-1 lg:min-h-0">
        <ChartCard title="Platform split" fill>
          <ResponsiveContainer width="100%" height={isMobile ? chartHeight : '100%'} minHeight={isMobile ? undefined : 160}>
            <PieChart>
              <Pie data={data?.platformSplit || []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                {(data?.platformSplit || []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Event type" fill>
          <ResponsiveContainer width="100%" height={isMobile ? chartHeight : '100%'} minHeight={isMobile ? undefined : 160}>
            <PieChart>
              <Pie data={data?.eventSplit || []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                {(data?.eventSplit || []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Conversation nature" description="Inferred from notes / status / message text" className="lg:flex-1 lg:min-h-0" fill>
        <ResponsiveContainer width="100%" height={isMobile ? chartHeight : '100%'} minHeight={isMobile ? undefined : 160}>
          <BarChart data={data?.natureSplit || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={barCursor} />
            <Bar dataKey="value" fill="hsl(var(--chart-3))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

export default SocialPage;
