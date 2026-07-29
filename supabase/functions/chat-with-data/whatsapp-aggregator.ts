// Pure aggregation logic for the query_whatsapp_chats tool.
// ZERO imports on purpose: this module runs under Deno (edge deploy)
// and under Node 24 type-stripping (unit tests via `node --test`).

export interface WhatsAppRow { created_at: string; sender: string; name: string | null; humanControlled: boolean; }
export interface WhatsAppSummary {
  total_messages: number; unique_guests: number;
  human_handled_messages: number; ai_handled_messages: number;
  by_day: Array<{ date: string; messages: number; guests: number }>;
}

const dubaiFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' });
export function dubaiDateKey(iso: string): string { return dubaiFmt.format(new Date(iso)); }

// Strips a phone_number filter down to digits only. Non-numeric input (e.g. a
// guest name typed into the phone_number arg) collapses to '' — callers MUST
// treat an empty digest as "no usable filter" rather than passing it into an
// ilike('%%') pattern, which would silently match every row.
export function phoneDigits(raw: unknown): string {
  return raw === undefined || raw === null ? '' : String(raw).replace(/\D/g, '');
}

export function aggregateWhatsApp(rows: WhatsAppRow[]): WhatsAppSummary {
  const guests = new Set<string>();
  const byDay = new Map<string, { messages: number; guests: Set<string> }>();
  let human = 0;
  for (const r of rows) {
    guests.add(r.sender);
    if (r.humanControlled) human++;
    const day = dubaiDateKey(r.created_at);
    const bucket = byDay.get(day) ?? { messages: 0, guests: new Set<string>() };
    bucket.messages++; bucket.guests.add(r.sender);
    byDay.set(day, bucket);
  }
  return {
    total_messages: rows.length,
    unique_guests: guests.size,
    human_handled_messages: human,
    ai_handled_messages: rows.length - human,
    by_day: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, messages: v.messages, guests: v.guests.size })),
  };
}
