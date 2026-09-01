// VENDORED from the deployed function (slug: export-booking-inquiries, version: 9) on 2026-07-31.
// Recovered because the March revert left this function deployed with no repo
// source. Reviewed on 2026-07-31 and is now the source of truth for this
// function. Security fix (2026-07-31): set verify_jwt = true at the gateway
// as defence-in-depth (no code change; the internal auth.getUser() +
// is_hotel_staff RPC gate below was already correct and fail-closed).
//
// KNOWN DRIFT, deliberate: deployed version 10 still carries the pre-lint
// regex literals and `catch {}`. The cleanup below is source-level only and is
// proven behaviour-identical (exhaustive printable-ASCII comparison against the
// old patterns, tests/unit/export-booking-inquiries-regex.test.ts), so it was
// NOT redeployed just to make the bytes match — retyping 150 lines including
// the Arabic keyword classes and the U+FEFF escape in the CSV prefix into a
// deploy payload is the only real risk in that operation, and it buys nothing
// functional. (Writing this comment proved the point: the first draft embedded
// a real U+FEFF instead of naming it, caught by a non-ASCII audit.) The
// cleanup ships with the next change that actually needs deploying.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { csvCell } from "./csv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const KEYWORDS = /(book|reserv|room|apartment|stay|long.?term|short.?term|monthly|yearly|annual|availab|rate|price|rent|studio|bedroom|check.?in|check.?out|حجز|شقة|غرفة|إقامة|سعر|إيجار|نزول)/i;
// Lint-only cleanup (2026-07-31): the escapes below were redundant inside
// character classes. Every `-` now sits first or last in its class, where it is
// a literal and needs no backslash, and `.` is always literal inside a class.
// The matched language is unchanged — asserted by
// tests/unit/export-booking-inquiries-regex.test.ts against the pre-cleanup
// patterns.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const DATE_RE = /((?:\d{1,2}[\s/.-]?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{0,4})|(?:\d{4}[-/]\d{1,2}[-/]\d{1,2})|(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}))/gi;

function extractMsg(m: any): string {
  if (m == null) return "";
  if (typeof m === "string") {
    try { const j = JSON.parse(m); if (j && typeof j === "object" && "body" in j) return String(j.body ?? ""); }
    catch { /* not JSON — fall through and treat the string as the message body */ }
    return m;
  }
  if (typeof m === "object" && "body" in m) return String((m as any).body ?? "");
  return JSON.stringify(m);
}

function classifyDuration(text: string): string {
  if (/(1\s*year|one\s*year|12\s*month|annual|yearly|سنة|سنوي)/i.test(text)) return "1 year / yearly";
  if (/(6\s*month|six\s*month|6\s*أشهر|6\s*شهور)/i.test(text)) return "6 months";
  if (/(3\s*month|three\s*month|3\s*أشهر|3\s*شهور)/i.test(text)) return "3 months";
  if (/(2\s*month|two\s*month|شهرين)/i.test(text)) return "2 months";
  if (/(1\s*month|one\s*month|monthly|شهري|لمدة\s*شهر)/i.test(text)) return "1 month / monthly";
  if (/(long.?term|long\s*stay|إقامة\s*طويلة)/i.test(text)) return "long-term stay";
  if (/(short.?term|short\s*stay|إقامة\s*قصيرة)/i.test(text)) return "short-term stay";
  return "unclear booking inquiry";
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  const token = auth.replace("Bearer ", "");
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData?.user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  const { data: isStaff } = await supabase.rpc("is_hotel_staff", { _user_id: userData.user.id });
  if (!isStaff) return new Response("Forbidden", { status: 403, headers: corsHeaders });

  // Pull all rows in pages
  const PAGE = 1000;
  let from = 0;
  type Row = { id: number; created_at: string; sn: string | null; name: string | null; msg: any; ai: string | null; hr: string | null };
  const all: Row[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("Chat History")
      .select('id, created_at, "Sender Number", "Sender Message", "Ai Reply", human_reply, "Name"')
      .order("Sender Number", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return new Response("DB error: " + error.message, { status: 500, headers: corsHeaders });
    if (!data || data.length === 0) break;
    for (const r of data) {
      all.push({
        id: r.id, created_at: r.created_at,
        sn: (r as any)["Sender Number"], name: (r as any)["Name"],
        msg: (r as any)["Sender Message"], ai: (r as any)["Ai Reply"], hr: (r as any)["human_reply"],
      });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Group by sender
  const groups = new Map<string, Row[]>();
  for (const r of all) {
    if (!r.sn) continue;
    const arr = groups.get(r.sn) ?? [];
    arr.push(r);
    groups.set(r.sn, arr);
  }

  const out: string[] = [];
  out.push([
    "Guest Name", "Email", "Telephone", "Inquiry",
    "Stay Duration", "Requested Dates", "Conversation Date",
    "Response Status", "Original Guest Message",
  ].map(csvCell).join(","));

  for (const [sn, rows] of groups) {
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const allText = rows.map(r => `${extractMsg(r.msg)} ${r.ai ?? ""} ${r.hr ?? ""}`).join(" ");
    if (!KEYWORDS.test(allText)) continue;

    const name = rows.map(r => r.name).find(n => n && n.trim()) ?? "";
    const email = (allText.match(EMAIL_RE)?.[0]) ?? "";
    const dates = Array.from(new Set(Array.from(allText.matchAll(DATE_RE)).map(m => m[1]))).slice(0, 8).join("; ");
    const duration = classifyDuration(allText);
    const hasAi = rows.some(r => r.ai && r.ai.trim());
    const hasHr = rows.some(r => r.hr && r.hr.trim());
    const status = hasHr ? "Human Replied" : hasAi ? "AI Replied" : "No Reply Found";
    const bookingMsgs = rows
      .map(r => extractMsg(r.msg))
      .filter(m => m && KEYWORDS.test(m))
      .slice(0, 20).join(" || ").slice(0, 4000);
    const firstDate = rows[0].created_at;
    const inquiry = bookingMsgs.slice(0, 600);

    out.push([
      name, email, sn, inquiry, duration, dates,
      new Date(firstDate).toISOString().replace("T", " ").slice(0, 16),
      status, bookingMsgs,
    ].map(csvCell).join(","));
  }

  const csv = "\uFEFF" + out.join("\n");
  return new Response(csv, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="booking_inquiries.csv"',
    },
  });
});
