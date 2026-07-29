// Pure aggregation logic for the query_sera_emails tool.
// ZERO imports besides dubaiDateKey on purpose: this module runs under Deno
// (edge deploy) and under Node 24 type-stripping (unit tests via `node --test`).

import { dubaiDateKey } from './whatsapp-aggregator.ts';

export interface EmailRow { sent_at: string; email_type: string | null; category: string | null; guest_email: string | null; }
export interface EmailsSummary {
  total_emails: number; new_emails: number; reply_emails: number; unique_guests: number;
  by_category: Array<{ category: string; emails: number }>;
  by_day: Array<{ date: string; emails: number }>;
}

export function aggregateEmails(rows: EmailRow[]): EmailsSummary {
  const guests = new Set<string>();
  const byCat = new Map<string, number>();
  const byDay = new Map<string, number>();
  let newE = 0, reply = 0;
  for (const r of rows) {
    if (r.guest_email) guests.add(r.guest_email.toLowerCase());
    if (r.email_type === 'new') newE++;
    else if (r.email_type === 'reply') reply++;
    const cat = r.category?.trim() || 'uncategorized';
    byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
    const day = dubaiDateKey(r.sent_at);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const sorted = <V>(m: Map<string, V>) => [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  return {
    total_emails: rows.length, new_emails: newE, reply_emails: reply, unique_guests: guests.size,
    by_category: [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([category, emails]) => ({ category, emails })),
    by_day: sorted(byDay).map(([date, emails]) => ({ date, emails })),
  };
}
