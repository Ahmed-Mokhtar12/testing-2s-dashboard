import React from 'react';
import { Mail, MailPlus, Reply, Users } from 'lucide-react';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEmailInsights } from '@/hooks/insights/useEmailInsights';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle, barCursor } from '@/components/dashboard/chartTheme';
import { format } from 'date-fns';

const PALETTE = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
];

const EmailPage: React.FC = () => {
  const isMobile = useIsMobile();
  const { data, isLoading } = useEmailInsights();
  const chartHeight = isMobile ? 180 : 280;
  const axisFontSize = isMobile ? 9 : 11;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Sera Sent Emails"
        subtitle="Outbound emails sent by Sera AI"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Sent"
          value={data?.kpis.total ?? 0}
          icon={Mail}
          tone="primary"
          loading={isLoading}
        />
        <KpiCard
          label="New Emails"
          value={data?.kpis.newEmails ?? 0}
          icon={MailPlus}
          tone="accent"
          loading={isLoading}
        />
        <KpiCard
          label="Follow-up Emails"
          value={data?.kpis.replyEmails ?? 0}
          icon={Reply}
          tone="magenta"
          loading={isLoading}
        />
        <KpiCard
          label="Unique Guests"
          value={data?.kpis.uniqueGuests ?? 0}
          icon={Users}
          tone="success"
          loading={isLoading}
        />
      </div>

      <ChartCard title="Daily sent emails - new vs reply">
        <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
          <BarChart data={data?.trend || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
              labelStyle={tooltipLabelStyle}
              cursor={barCursor}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="new" stackId="a" fill="hsl(var(--chart-1))" radius={[0, 0, 0, 0]} name="New" />
            <Bar dataKey="reply" stackId="a" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} name="Reply" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="By department" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data?.categoryBreakdown || []} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <YAxis
                type="category"
                dataKey="name"
                stroke="hsl(var(--muted-foreground))"
                fontSize={axisFontSize}
                width={140}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
                cursor={barCursor}
              />
              <Bar dataKey="value" fill="hsl(var(--chart-3))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="New vs Reply ratio">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie
                data={data?.newVsReply || []}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={3}
              >
                {(data?.newVsReply || []).map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Nature of request">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data?.natureBreakdown || []} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
            <YAxis
              type="category"
              dataKey="name"
              stroke="hsl(var(--muted-foreground))"
              fontSize={axisFontSize}
              width={160}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
              labelStyle={tooltipLabelStyle}
              cursor={barCursor}
            />
            <Bar dataKey="value" fill="hsl(var(--chart-4))" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Latest sent emails">
        {(data?.latestEmails?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No emails in the selected date range.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Guest</th>
                  <th className="pb-2 pr-4 font-medium">Subject</th>
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 pr-4 font-medium">Nature</th>
                  <th className="pb-2 pr-4 font-medium">Department</th>
                  <th className="pb-2 font-medium">Sent At</th>
                </tr>
              </thead>
              <tbody>
                {(data?.latestEmails || []).slice(0, 50).map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-4 max-w-[140px] truncate">
                      {row.guest_name || row.guest_email || '-'}
                    </td>
                    <td className="py-2 pr-4 max-w-[200px] truncate">
                      {row.email_subject || '-'}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.email_type === 'new'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}
                      >
                        {row.email_type ?? '-'}
                      </span>
                    </td>
                    <td className="py-2 pr-4 max-w-[140px] truncate">
                      {row.nature_of_request || '-'}
                    </td>
                    <td className="py-2 pr-4 max-w-[120px] truncate">
                      {row.category || '-'}
                    </td>
                    <td className="py-2 text-muted-foreground whitespace-nowrap">
                      {row.sent_at ? format(new Date(row.sent_at), 'MMM d, HH:mm') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
};

export default EmailPage;
