#!/usr/bin/env bash
# Send a REAL training-report email to the REAL recipient list, for one
# explicitly chosen period, once. This is mode:'send' — the deliberate,
# operator-triggered path described in training-report/index.ts.
#
# It is NOT the preview path. For a preview that goes only to you and writes
# nothing to the ledger, use ./scripts/send-training-report-test.sh instead.
#
# WHY THIS SCRIPT EXISTS
#   EARLIEST_PERIOD is '2026-08', so dueReports() will never surface July 2026
#   — the only month with real training data. Left alone, the first automated
#   email anyone receives is the August report on 1 September, and for the
#   reminder, 24 August. mode:'send' exists so the managers' first email
#   contains real numbers instead of a near-empty month.
#
# WHY IT CANNOT BE RUN BY CLAUDE
#   mode:'send' is admin-gated the same way mode:'test' is: getCallerUser(req)
#   requires a valid *user* JWT and then has_role(caller, 'admin') must be true
#   (index.ts:531-535). A service-role key has no user, so it fails the first
#   check. There is no credential in the repo or the environment that satisfies
#   this — it needs your session. That is the gate working as designed.
#
# WHAT THE FUNCTION GUARANTEES (so this script does not have to)
#   - confirm:true is mandatory server-side; without it you get a 400 naming
#     every real recipient.
#   - The send goes through the same ensureRunRow/claimRun/recordRun ledger
#     path as the cron, so a second run of this script CANNOT double-send: an
#     already-'sent' row short-circuits to 409 before any mail is attempted.
#     Re-running by mistake is safe.
#
# Usage:
#   ./scripts/send-training-report-real.sh                    # monthly, 2026-07
#   ./scripts/send-training-report-real.sh monthly 2026-07
#   ./scripts/send-training-report-real.sh reminder 2026-08
#
# Both arguments default to the July summary, because that is the one send this
# was written for. period is never inferred from the clock — mode:'send'
# requires it explicitly and so does this script's confirmation prompt.
#
# Admin access token, tried in order (same as send-training-report-test.sh):
#   1. TRAINING_REPORT_JWT, if already exported.
#   2. Supabase password grant (prompts; password read with `read -rs`).
#   3. Otherwise prints the browser-console snippet and exits non-zero.
#
# KNOWN DUPLICATION: the JWT-acquisition block below is the third copy of the
# same routine (send-training-report-test.sh, sera-battery.sh, here). It is
# duplicated rather than factored into a shared lib on purpose — the other two
# are working scripts in active use, and refactoring them cannot be verified
# end to end without a live admin credential. Worth extracting the next time
# one of the three needs a real change.
set -euo pipefail

PROJECT_URL="https://yczcebfaqerlwfalrbjn.supabase.co"
# Public anon key — same value published in src/integrations/supabase/client.ts.
# Grants nothing by itself: the function still requires an admin-user JWT.
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljemNlYmZhcWVybHdmYWxyYmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0ODE1MTcsImV4cCI6MjA2MTA1NzUxN30.fcVru8vxui_Jsuv1O8J7vh-Yn4dCcvPQ9UaOFZNjjQI"
FUNCTION_URL="$PROJECT_URL/functions/v1/training-report"
DEFAULT_EMAIL="ahmed.mokhtar@2seasonshotels.com"

# Display only. The function's RECIPIENTS list (index.ts:16-20) is the
# authority; if these ever disagree, the function wins and this comment is the
# bug. Shown here so the confirmation prompt names actual people.
RECIPIENTS_DISPLAY="amir.monir@2seasonshotels.com, xarmaigne.narciso@2seasonshotels.com, ahmed.mokhtar@2seasonshotels.com"

REPORT="${1:-monthly}"
PERIOD="${2:-2026-07}"

case "$REPORT" in
  monthly|reminder) ;;
  *)
    echo "Usage: $0 [monthly|reminder] [YYYY-MM]   (default: monthly 2026-07)" >&2
    echo "'both' is deliberately NOT accepted — a real send is one decision at a time." >&2
    exit 1
    ;;
esac

if ! [[ "$PERIOD" =~ ^[0-9]{4}-(0[1-9]|1[0-2])$ ]]; then
  echo "FATAL: period must look like YYYY-MM (e.g. 2026-07), got: '$PERIOD'" >&2
  exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo " REAL SEND — this emails other people."
echo "════════════════════════════════════════════════════════════════════"
echo "  report:     $REPORT"
echo "  period:     $PERIOD"
echo "  recipients: $RECIPIENTS_DISPLAY"
echo "  subject:    NO [TEST] prefix — it reads as a normal report."
echo "  ledger:     writes report_runs($([ "$REPORT" = monthly ] && echo monthly_summary || echo reminder), $PERIOD)"
echo "              -> after this, that period can never be sent again."
if [ "$REPORT" = monthly ] && [ "$PERIOD" = "2026-07" ]; then
  echo ""
  echo "  Expected content, as approved in the test email:"
  echo "    Revenue 2 sessions / 4 participants / 10.0 hours"
  echo "    Front Office 1 / 3 / 1.5     total 11.5 hours"
  echo "  No 'delayed' banner if sent on or before 2026-08-01 (due date is"
  echo "  2026-08-01; the banner appears only once today is PAST it)."
fi
echo ""

# SEND_CONFIRM=SEND skips the prompt for a non-interactive run. Deliberately a
# whole word, not a 'y': this is the only guard between a keystroke and three
# managers' inboxes.
if [ "${SEND_CONFIRM:-}" = "SEND" ]; then
  echo "SEND_CONFIRM=SEND set — skipping the prompt."
else
  read -r -p "Type SEND (uppercase) to send, anything else to abort: " TYPED
  if [ "$TYPED" != "SEND" ]; then
    echo "Aborted. Nothing was sent and nothing was written to report_runs." >&2
    exit 1
  fi
fi

fallback_and_die() {
  cat >&2 <<EOF

Could not obtain an admin access token via password login.
If this account signs in via Azure AD (no Supabase password), take a JWT from
the browser instead:

  1. Log into the dashboard as an admin.
  2. DevTools -> Console:

     JSON.parse(localStorage.getItem('sb-yczcebfaqerlwfalrbjn-auth-token')).access_token

  3. In this shell (NOT as a 'VAR=value cmd' prefix — that lands in
     ~/.bash_history):

     read -rs TRAINING_REPORT_JWT; export TRAINING_REPORT_JWT

  4. Re-run with no prefix:

     $0 $REPORT $PERIOD
EOF
  exit 1
}

obtain_jwt() {
  if [ -n "${TRAINING_REPORT_JWT:-}" ]; then
    echo "Using TRAINING_REPORT_JWT from environment." >&2
    printf '%s' "$TRAINING_REPORT_JWT"
    return 0
  fi

  echo "No TRAINING_REPORT_JWT set — logging in with the Supabase password grant." >&2
  read -r -p "Admin email [$DEFAULT_EMAIL]: " LOGIN_EMAIL
  LOGIN_EMAIL="${LOGIN_EMAIL:-$DEFAULT_EMAIL}"
  read -rs -p "Password (not echoed): " LOGIN_PASSWORD
  echo "" >&2

  # Body built by python3 from the ENVIRONMENT and piped in on stdin: the
  # password never reaches curl's argv (world-readable via /proc/<pid>/cmdline)
  # and a quote or backslash in it cannot produce malformed JSON.
  local resp status body payload
  payload=$(LOGIN_EMAIL="$LOGIN_EMAIL" LOGIN_PASSWORD="$LOGIN_PASSWORD" python3 -c 'import json, os
print(json.dumps({"email": os.environ["LOGIN_EMAIL"], "password": os.environ["LOGIN_PASSWORD"]}))')
  unset LOGIN_PASSWORD

  resp=$(printf '%s' "$payload" | curl -sS -w '\n%{http_code}' \
    -X POST "$PROJECT_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    --data-binary @-)
  unset payload

  status="${resp##*$'\n'}"
  body="${resp%$'\n'*}"

  if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
    echo "Password login failed (HTTP $status):" >&2
    echo "$body" >&2
    fallback_and_die
  fi

  local token
  token=$(printf '%s' "$body" | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin).get("access_token") or "")
except Exception:
    print("")')

  if [ -z "$token" ]; then
    echo "Login response contained no access_token:" >&2
    echo "$body" >&2
    fallback_and_die
  fi

  echo "Login succeeded." >&2
  printf '%s' "$token"
}

JWT=$(obtain_jwt)

BODY=$(REPORT="$REPORT" PERIOD="$PERIOD" python3 -c 'import json, os
print(json.dumps({"mode": "send", "report": os.environ["REPORT"],
                  "period": os.environ["PERIOD"], "confirm": True}))')

echo ""
echo "=== POST mode:send $REPORT $PERIOD ==="
# Auth headers go through a curl --config file fed by process substitution, not
# -H flags: -H values land in argv, which is world-readable via
# /proc/<pid>/cmdline for the life of the request.
RESP=$(printf '%s' "$BODY" | curl -sS -m 120 -w '\n%{http_code}' \
  --config <(printf 'header = "Authorization: Bearer %s"\nheader = "apikey: %s"\n' "$JWT" "$ANON_KEY") \
  -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  --data-binary @-)
STATUS="${RESP##*$'\n'}"
HTTP_BODY="${RESP%$'\n'*}"

echo "HTTP status: $STATUS"
echo "Response body: $HTTP_BODY"
echo ""

# 409 is a distinct outcome, not a generic failure: it means the ledger already
# has this period as 'sent' (or a send is in flight). Nothing was emailed twice
# and nothing is wrong — say so, instead of leaving "FAILED" on screen.
if [ "$STATUS" = "409" ]; then
  echo "ALREADY SENT — the function refused to send $REPORT/$PERIOD a second time." >&2
  echo "That is the double-send guard working. The body above shows status/sentAt/recipients" >&2
  echo "from report_runs. No email was sent by this run." >&2
  exit 2
fi

if [ "$STATUS" -lt 200 ] || [ "$STATUS" -ge 300 ] || ! printf '%s' "$HTTP_BODY" | grep -q '"ok":true'; then
  echo "FAILED: $REPORT/$PERIOD was not confirmed sent (see status/body above)." >&2
  echo "A 500 with a Graph error means the ledger recorded a failed attempt;" >&2
  echo "re-running is safe (attempts increments, the claim is not stuck)." >&2
  exit 1
fi

echo "OK: $REPORT report for $PERIOD sent to the real recipient list."
echo ""
echo "Verify it landed in the ledger:"
echo "  select report_type, period, status, sent_at, attempts, recipients"
echo "    from report_runs where period = '$PERIOD';"
