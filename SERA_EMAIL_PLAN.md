# Sera Sent Emails — Implementation Plan

## Context
Replace the existing Email dashboard with a new "Sera Sent Emails" page that reads exclusively from the `2Seasons_Sera_Email_Log` Supabase table. The table is currently empty (0 rows), so all widgets must gracefully show zero values without crashing.

**Modify only these 2 files. Touch nothing else.**
- `src/hooks/insights/useEmailInsights.ts`
- `src/pages/dashboard/Email.tsx`

Do NOT modify: routing, sidebar, auth, global layout, or any other dashboard pages or tables.

---

## Table Schema: `2Seasons_Sera_Email_Log`

| Column | Type | Use |
|---|---|---|
| `id` | bigint | Row key |
| `sent_at` | timestamptz | **Date filter field** |
| `email_type` | text `'new'\|'reply'` | KPI split + stacked trend |
| `category` | text | Department breakdown chart |
| `nature_of_request` | text | Nature breakdown chart |
| `guest_name` | text | Table display |
| `guest_email` | text | Unique guests KPI + table |
| `email_subject` | text | Table display |

---

## Phase 1 — Rewrite `useEmailInsights.ts`

**File:** `web-mirror-magic-app/src/hooks/insights/useEmailInsights.ts`

Replace the entire file with the following:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/useDateRange';
import { dailySeries, countBy } from './utils';

const QUERY_STALE_TIME = 5 * 60 * 1000;
const QUERY_GC_TIME = 10 * 60 * 1000;

export function useEmailInsights() {
  const { from, to, fromISO, toISO } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'sera-email', fromISO, toISO],
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('2Seasons_Sera_Email_Log')
        .select('id, sent_at, email_type, category, nature_of_request, guest_name, guest_email, email_subject')
        .gte('sent_at', fromISO)
        .lte('sent_at', toISO)
        .order('sent_at', { ascending: false })
        .limit(10000);

      if (error) throw error;
      const rows = data || [];

      const newEmails = rows.filter((r) => r.email_type === 'new').length;
      const replyEmails = rows.filter((r) => r.email_type === 'reply').length;
      const uniqueGuests = new Set(rows.map((r) => r.guest_email).filter(Boolean)).size;

      const newRows = rows.filter((r) => r.email_type === 'new');
      const replyRows = rows.filter((r) => r.email_type === 'reply');
      const newTrend = dailySeries(from, to, newRows, (r) => (r.sent_at ? new Date(r.sent_at) : null));
      const replyTrend = dailySeries(from, to, replyRows, (r) => (r.sent_at ? new Date(r.sent_at) : null));
      const trend = newTrend.map((row, i) => ({
        label: row.label,
        new: row.value,
        reply: replyTrend[i]?.value ?? 0,
      }));

      const categoryBreakdown = countBy(rows, (r) => r.category as string).slice(0, 8);
      const natureBreakdown = countBy(rows, (r) => r.nature_of_request as string).slice(0, 8);
      const newVsReply = [
        { name: 'New', value: newEmails },
        { name: 'Reply', value: replyEmails },
      ];

      return {
        kpis: { total: rows.length, newEmails, replyEmails, uniqueGuests },
        trend,
        categoryBreakdown,
        natureBreakdown,
        newVsReply,
        latestEmails: rows,
      };
    },
  });
}
```

**What changed:**
- Removed queries to `website_email_threads` and `2s burst_email`
- Single query to `2Seasons_Sera_Email_Log` filtered by `sent_at`
- Returns new KPI shape: `total`, `newEmails`, `replyEmails`, `uniqueGuests`
- Returns `trend` stacked by `email_type` (new vs reply)
- Returns `categoryBreakdown`, `natureBreakdown`, `newVsReply`, `latestEmails`

---

## Phase 2 — Redesign `Email.tsx`

**File:** `web-mirror-magic-app/src/pages/dashboard/Email.tsx`

Replace the entire file with the following:

```tsx
import React from 'react';
import { Mail, MailPlus, Reply, Users } from 'lucide-react';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEmailInsights } from '@/hooks/insights/useEmailInsights';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
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

      {/* KPI cards */}
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
          label="Reply Emails"
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

      {/* Daily trend: new vs reply */}
      <ChartCard title="Daily sent emails · new vs reply">
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

      {/* By department + New vs Reply ratio */}
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

      {/* Nature of request */}
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

      {/* Latest sent emails table */}
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
                      {row.guest_name || row.guest_email || '—'}
                    </td>
                    <td className="py-2 pr-4 max-w-[200px] truncate">
                      {row.email_subject || '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.email_type === 'new'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}
                      >
                        {row.email_type ?? '—'}
                      </span>
                    </td>
                    <td className="py-2 pr-4 max-w-[140px] truncate">
                      {row.nature_of_request || '—'}
                    </td>
                    <td className="py-2 pr-4 max-w-[120px] truncate">
                      {row.category || '—'}
                    </td>
                    <td className="py-2 text-muted-foreground whitespace-nowrap">
                      {row.sent_at ? format(new Date(row.sent_at), 'MMM d, HH:mm') : '—'}
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
```

**What changed:**
- Title → `"Sera Sent Emails"`, subtitle → `"Outbound emails sent by Sera AI"`
- 4 KPI cards: Total Sent, New Emails, Reply Emails, Unique Guests
- Stacked bar chart: daily new vs reply trend
- Horizontal bar chart: emails by department (`category`)
- Donut pie chart: new vs reply ratio
- Horizontal bar chart: nature of request (`nature_of_request`)
- Table: latest 50 sent emails with graceful empty state

---

## Phase 3 — Verification

After applying both file changes, verify the following:

1. **Dev server starts clean**
   ```bash
   cd web-mirror-magic-app
   npm run dev
   ```
   No TypeScript errors or build warnings.

2. **Page loads at** `http://localhost:8080/dashboard/email`
   - Title shows **"Sera Sent Emails"**
   - Subtitle shows **"Outbound emails sent by Sera AI"**

3. **Empty state (table has 0 rows)**
   - All 4 KPI cards show **0**
   - All charts render without crashing (blank axes, no errors)
   - Latest emails table shows: **"No emails in the selected date range."**

4. **Date filter triggers refetch**
   - Click "Last 7 days" or "Last 30 days" in the header
   - Network tab shows new Supabase request to `2Seasons_Sera_Email_Log`
   - Query key `['insights', 'sera-email', ...]` updates correctly

5. **Other sections unchanged**
   - Navigate to Overview, WhatsApp, Reviews, Info Email, Competitors — all work normally

6. **No modifications to old tables**
   - `website_email_threads` and `2s burst_email` are untouched (only reading stopped)
