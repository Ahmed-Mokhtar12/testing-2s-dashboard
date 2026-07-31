#!/usr/bin/env bash
# Send a real-data TEST training-report email to yourself via the deployed
# training-report edge function. mode:'test' sends ONLY to the caller (never
# the real recipient list), prefixes the subject with "[TEST]", and writes
# nothing to report_runs — this is the safe, repeatable preview path so
# nobody has to hand-extract a JWT from DevTools to try it.
#
# Usage: ./scripts/send-training-report-test.sh [monthly|reminder|both] [YYYY-MM]
#   report  monthly, reminder, or both (default: both)
#   period  optional YYYY-MM override; omit to let the function pick the
#           natural period (previous month for monthly, current month for
#           reminder) — NOTE: as of this writing the natural monthly period
#           is 2026-06, which has ZERO training sessions. All real training
#           data is dated 2026-07-29. To preview against real data, pass the
#           period explicitly:
#
#             ./scripts/send-training-report-test.sh both 2026-07
#
# Admin access token, tried in order:
#   1. TRAINING_REPORT_JWT env var, if already set.
#   2. Supabase password-grant login: prompts for email (default
#      ahmed.mokhtar@2seasonshotels.com) and reads the password with
#      `read -rs` so it is never echoed to the terminal or written to disk.
#   3. If that fails (e.g. the account is Azure-AD-only and has no Supabase
#      password), prints a one-line browser-console snippet to copy a live
#      JWT and instructs re-running with TRAINING_REPORT_JWT=... set.
#
# Self-verifying: a non-2xx response, or a 2xx body without "ok":true, is
# treated as failure — status and body are echoed and the script exits
# non-zero rather than reporting success on a bad send.
set -euo pipefail

PROJECT_URL="https://yczcebfaqerlwfalrbjn.supabase.co"
# Public anon key — same value published in src/integrations/supabase/client.ts.
# Safe to hardcode: it identifies the API, not a caller, and grants nothing by
# itself (the function still requires a valid admin-user JWT for mode:'test').
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljemNlYmZhcWVybHdmYWxyYmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0ODE1MTcsImV4cCI6MjA2MTA1NzUxN30.fcVru8vxui_Jsuv1O8J7vh-Yn4dCcvPQ9UaOFZNjjQI"
FUNCTION_URL="$PROJECT_URL/functions/v1/training-report"
DEFAULT_EMAIL="ahmed.mokhtar@2seasonshotels.com"

REPORT="${1:-both}"
PERIOD="${2:-}"

case "$REPORT" in
  monthly|reminder|both) ;;
  *)
    echo "Usage: $0 [monthly|reminder|both] [YYYY-MM]" >&2
    exit 1
    ;;
esac

if [ -n "$PERIOD" ] && ! [[ "$PERIOD" =~ ^[0-9]{4}-(0[1-9]|1[0-2])$ ]]; then
  echo "FATAL: period must look like YYYY-MM (e.g. 2026-07), got: '$PERIOD'" >&2
  exit 1
fi

if [ -z "$PERIOD" ]; then
  echo "No period given — using each report's natural period (previous month for monthly, current month for reminder)." >&2
  echo "That natural period may be EMPTY (e.g. 2026-06 has zero training sessions). All real data is dated 2026-07-29 —" >&2
  echo "pass '2026-07' explicitly to preview against it, e.g.: $0 both 2026-07" >&2
fi

fallback_and_die() {
  echo "" >&2
  echo "Could not obtain an admin access token via password login." >&2
  echo "If this account signs in via Azure AD (no Supabase password), get a JWT from the browser instead:" >&2
  echo "" >&2
  echo "  1. Log into the dashboard as an admin in your browser." >&2
  echo "  2. Open DevTools -> Console and run:" >&2
  echo "" >&2
  echo "     JSON.parse(localStorage.getItem('sb-yczcebfaqerlwfalrbjn-auth-token')).access_token" >&2
  echo "" >&2
  echo "  3. Copy the printed token (no quotes). In this shell, run these two lines" >&2
  echo "     (NOT 'TRAINING_REPORT_JWT=<token> $0 ...' — an env-assignment prefix on a" >&2
  echo "     command line gets recorded in ~/.bash_history):" >&2
  echo "" >&2
  echo "     read -rs TRAINING_REPORT_JWT; export TRAINING_REPORT_JWT" >&2
  echo "     (paste the token, press Enter — it is not echoed or saved to disk)" >&2
  echo "" >&2
  echo "  4. Then re-run with no prefix (the script reads the exported var):" >&2
  echo "" >&2
  echo "     $0 $REPORT $PERIOD" >&2
  echo "" >&2
  exit 1
}

obtain_jwt() {
  if [ -n "${TRAINING_REPORT_JWT:-}" ]; then
    echo "Using TRAINING_REPORT_JWT from environment." >&2
    printf '%s' "$TRAINING_REPORT_JWT"
    return 0
  fi

  echo "No TRAINING_REPORT_JWT set — logging in with Supabase password grant." >&2
  read -r -p "Admin email [$DEFAULT_EMAIL]: " LOGIN_EMAIL
  LOGIN_EMAIL="${LOGIN_EMAIL:-$DEFAULT_EMAIL}"
  read -rs -p "Password (not echoed): " LOGIN_PASSWORD
  echo "" >&2

  # Build the login body with python3 instead of hand-spliced JSON:
  #   - avoids malformed JSON if the password contains a quote/backslash
  #     (fixes the GoTrue-4xx-then-confusing-fallback failure mode)
  #   - and, combined with piping it into curl via --data-binary @- below,
  #     keeps the password out of curl's argv entirely
  # The password is handed to python3 via an env-var prefix (LOGIN_PASSWORD=...
  # python3 ...), not a CLI argument: that only sets the *child* python3
  # process's environment, which is exposed via /proc/<pid>/environ —
  # readable only by this user (and root) — never via /proc/<pid>/cmdline,
  # which is world-readable for the life of the process. Unset immediately
  # after use to shrink the exposure window further.
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
    d = json.load(sys.stdin)
    print(d.get("access_token") or "")
except Exception:
    print("")')

  if [ -z "$token" ]; then
    echo "Password login response did not contain an access_token:" >&2
    echo "$body" >&2
    fallback_and_die
  fi

  echo "Login succeeded." >&2
  printf '%s' "$token"
}

JWT=$(obtain_jwt)

send_one() {
  local report="$1"
  local body="{\"mode\":\"test\",\"report\":\"$report\""
  if [ -n "$PERIOD" ]; then
    body="$body,\"period\":\"$PERIOD\""
  fi
  body="$body}"

  echo ""
  echo "=== Sending TEST $report report ${PERIOD:+(period $PERIOD) }==="
  # Auth headers (admin JWT + anon key) go through a curl --config file fed
  # via process substitution, NOT -H flags: -H values land in this curl
  # process's argv, which is world-readable via /proc/<pid>/cmdline for the
  # life of the request. The config-file approach keeps the JWT out of argv
  # entirely. (The anon key isn't sensitive — it's the same public value
  # hardcoded above — but it rides along in the same file for simplicity.)
  local resp status http_body
  resp=$(curl -sS -w '\n%{http_code}' \
    --config <(printf 'header = "Authorization: Bearer %s"\nheader = "apikey: %s"\n' "$JWT" "$ANON_KEY") \
    -X POST "$FUNCTION_URL" \
    -H "Content-Type: application/json" \
    -d "$body")
  status="${resp##*$'\n'}"
  http_body="${resp%$'\n'*}"

  echo "HTTP status: $status"
  echo "Response body: $http_body"

  if [ "$status" -lt 200 ] || [ "$status" -ge 300 ] || ! printf '%s' "$http_body" | grep -q '"ok":true'; then
    echo "" >&2
    echo "FAILED: $report report was not confirmed sent (see status/body above)." >&2
    exit 1
  fi

  local sent_to
  sent_to=$(printf '%s' "$http_body" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get("sentTo") or "")
except Exception:
    print("")')

  echo "OK: $report report sent — check this mailbox: ${sent_to:-<unknown, see body above>}"
}

case "$REPORT" in
  both)
    send_one monthly
    send_one reminder
    ;;
  *)
    send_one "$REPORT"
    ;;
esac
