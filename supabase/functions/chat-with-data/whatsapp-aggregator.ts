// Pure aggregation logic for the query_whatsapp_chats tool.
// ZERO imports on purpose: this module runs under Deno (edge deploy)
// and under Node 24 type-stripping (unit tests via `node --test`).

export type HandledBy = 'ai' | 'human' | 'system' | null;

export interface WhatsAppRow {
  created_at: string;
  sender: string;
  name: string | null;
  /** `is_human_controlled`: a MUTABLE, conversation-level flag. When an agent
      takes over a number, whatsapp-send-message sets it with no date bound, so
      every historical row for that sender flips too. It therefore overstates
      human handling and cannot be trusted per row. */
  humanControlled: boolean;
  /** `handled_by`: the immutable per-row stamp (migration 20260731201138).
      null on rows that predate it. */
  handledBy: HandledBy;
  /** Whether this row carries a reply of either kind (`Ai Reply` or
      `human_reply`). This is what makes coverage detectable WITHOUT hardcoding
      when the stamp went live: after the migration, any row with a reply is
      stamped by trigger, so a row that has a reply but NO stamp can only be a
      legacy row. A row with no reply carries no handling claim either way. */
  hasReply: boolean;
}

export interface WhatsAppHandling {
  /** Which signal the top-level human/ai counts came from. Flips to
      'handled_by' by itself once a query window contains no legacy rows — the
      interim retires without a flag day. */
  primary_signal: 'handled_by' | 'is_human_controlled';
  human_handled_messages: number;
  ai_handled_messages: number;
  /** Takeover/release marker rows: no message, no reply, handled by neither. */
  system_rows: number;
  /** Inbound guest messages with no reply yet. Not a handling category. */
  awaiting_reply_rows: number;
  /** Rows with a reply but no stamp, i.e. predating the column. While this is
      above zero the stamp cannot answer the question on its own. */
  legacy_unstamped_rows: number;
  coverage_complete: boolean;
  legacy_control_flag: { human_handled_messages: number; ai_handled_messages: number };
  /** Stamped rows where the two signals contradict each other. */
  disagreement_rows: number;
  instruction_to_model: string | null;
}

export interface WhatsAppSummary {
  total_messages: number; unique_guests: number;
  human_handled_messages: number; ai_handled_messages: number;
  handling: WhatsAppHandling;
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
  let flagHuman = 0;
  let stampHuman = 0, stampAi = 0, stampSystem = 0;
  let legacyUnstamped = 0, awaitingReply = 0;
  let disagreements = 0;

  for (const r of rows) {
    guests.add(r.sender);
    if (r.humanControlled) flagHuman++;

    switch (r.handledBy) {
      case 'human':
        stampHuman++;
        if (!r.humanControlled) disagreements++;
        break;
      case 'ai':
        stampAi++;
        // The retroactive-relabel signature: an AI exchange whose sender was
        // later taken over, so the flag now claims a human handled it.
        if (r.humanControlled) disagreements++;
        break;
      case 'system':
        // Marker rows. Excluded from disagreement counting on purpose: the
        // flag makes no handling claim about a row with no message at all.
        stampSystem++;
        break;
      default:
        if (r.hasReply) legacyUnstamped++;
        else awaitingReply++;
    }

    const day = dubaiDateKey(r.created_at);
    const bucket = byDay.get(day) ?? { messages: 0, guests: new Set<string>() };
    bucket.messages++; bucket.guests.add(r.sender);
    byDay.set(day, bucket);
  }

  const total = rows.length;
  const coverageComplete = legacyUnstamped === 0;
  const legacyFlag = {
    human_handled_messages: flagHuman,
    ai_handled_messages: total - flagHuman,
  };

  // While any legacy row is in range, keep answering from the old signal — the
  // stamp genuinely does not know about those rows, and quietly reporting a
  // stamp-only count would understate human handling instead of overstating it.
  // Swapping one wrong number for another wrong number is not progress; the
  // caveat is what makes it honest.
  const primary: WhatsAppHandling['primary_signal'] =
    coverageComplete ? 'handled_by' : 'is_human_controlled';
  const human = coverageComplete ? stampHuman : legacyFlag.human_handled_messages;
  const ai = coverageComplete ? stampAi : legacyFlag.ai_handled_messages;

  let instruction: string | null = null;
  if (!coverageComplete) {
    instruction =
      `human_handled_messages and ai_handled_messages come from is_human_controlled, ` +
      `because ${legacyUnstamped} of ${total} rows in this window predate the immutable ` +
      `handled_by stamp. That flag is set per SENDER with no date bound, so taking over a ` +
      `conversation rewrites its whole history — it OVERSTATES human handling. You MUST ` +
      `present these two figures as approximate and say why.` +
      (disagreements > 0
        ? ` On the ${stampHuman + stampAi} rows that DO carry the stamp, the two signals ` +
          `disagree about ${disagreements}; where they disagree, handled_by is the correct one.`
        : '');
  } else if (disagreements > 0) {
    instruction =
      `Every row in this window carries the immutable handled_by stamp, so these figures are ` +
      `exact. For reference, the older is_human_controlled flag disagrees on ${disagreements} ` +
      `of them (it counts ${legacyFlag.human_handled_messages} human rows); that flag is ` +
      `rewritten on takeover and is wrong. Do not mention it unless asked.`;
  }

  return {
    total_messages: total,
    unique_guests: guests.size,
    human_handled_messages: human,
    ai_handled_messages: ai,
    handling: {
      primary_signal: primary,
      human_handled_messages: human,
      ai_handled_messages: ai,
      system_rows: stampSystem,
      awaiting_reply_rows: awaitingReply,
      legacy_unstamped_rows: legacyUnstamped,
      coverage_complete: coverageComplete,
      legacy_control_flag: legacyFlag,
      disagreement_rows: disagreements,
      instruction_to_model: instruction,
    },
    by_day: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, messages: v.messages, guests: v.guests.size })),
  };
}
