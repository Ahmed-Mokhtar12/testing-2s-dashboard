

Got it — before I extend the plan, I need your brief on each new table so the KPIs and charts are meaningful (not generic counts).

### Tables to add to the dashboard
1. **Two Seasons Competitor Hotel room Rates** — competitor pricing data (multiple hotels, daily rates in AED, lowest-price flag, Accor tax type, dry-run flag).
2. **info_email_audit_log** — email routing/audit decisions (department, action, confidence, override, error).
3. **social_engagement_logs** — social DM engagement events (platform, channel, event_type, status, escalation flag, grouped messages).
4. **daily_welcome_message_stats** — *not found in the current schema.* I see only `welcome_message_success_log` (one row per sent welcome message with guest/reservation/arrival info). Please confirm:
   - Should I use `welcome_message_success_log` and aggregate it daily myself, OR
   - Is `daily_welcome_message_stats` a table/view you plan to create (and what columns)?

### What I need from you for each table
For each of the 4 tables, please send a short brief covering:

- **Purpose** — one line on what the table represents
- **Primary date column** — which timestamp drives "trend over time" (e.g. `created_at`, `report_date`, `sent_date`)
- **Key dimensions to break down by** — e.g. for Competitor Rates: `hotel_name`, `source_group`, `status`; for audit log: `department`, `action`, `confidence`
- **KPIs you want at the top** — 2–4 numbers per section (e.g. "today's lowest rate per hotel", "% of emails auto-routed", "% escalated DMs", "welcome messages sent today vs yesterday")
- **Charts you want** — e.g. "rate trend line per hotel", "department pie", "escalation rate over time", "welcome sends per day"
- **Filters** — date range is default; anything else? (hotel, platform, department…)
- **Any rows to exclude** — e.g. exclude `dry_run = true` from competitor rates, exclude `error IS NOT NULL` from audit log

### Once you send the briefs, I will deliver the final consolidated plan
It will cover all 8 sections (Reviews, WhatsApp, Bursts, Email, Competitor Rates, Email Audit, Social Engagement, Welcome Messages) on top of the Midnight Indigo shell, with sidebar nav, `/dashboard` overview, and per-section pages — all in one go.

Please send the briefs (even bullet points are fine) and I'll finalize the plan.

