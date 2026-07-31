#!/usr/bin/env bash
# Sera regression battery — the model-sensitive subset.
#
# WHY THIS EXISTS: chat-with-data's Lovable branch runs `openai/gpt-5.2` and,
# because the GPT-5 family rejects an explicit temperature, sends NO temperature
# at all (openai-client.ts: `tempParam = isGpt5Family ? {} : { temperature: 0.7 }`).
# The previous model ran at 0.7. Every case below depends on the model RELAYING
# something the tool told it to say — a truncation caveat, an empty result, an
# approximate-figure warning — and that is exactly the behaviour a temperature
# change degrades. The model swap matters less than the sampling change.
#
# Each case therefore runs RUNS times (default 3) and reports a pass RATE. A
# case that passes 2 of 3 is not passing; it is a caveat the model drops a third
# of the time, which is worse than one that never appears because nobody will
# notice.
#
# Usage:
#   ./scripts/sera-battery.sh                # all cases, 3 runs each
#   RUNS=5 ./scripts/sera-battery.sh         # 5 runs each
#   ./scripts/sera-battery.sh truncation     # one case by id
#
# NOT read-only: every call makes chat-with-data insert a row into
# LongTermMemory, and (because this script passes a sessionId) one into
# "2s-dashboard_AI_Chat". Both are tagged with the session id printed at the
# start, and the cleanup SQL is printed at the end. It also spends real LLM
# tokens — RUNS x 6 calls per full run.
set -uo pipefail

PROJECT_URL="https://yczcebfaqerlwfalrbjn.supabase.co"
# Public anon key — same value published in src/integrations/supabase/client.ts.
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljemNlYmZhcWVybHdmYWxyYmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0ODE1MTcsImV4cCI6MjA2MTA1NzUxN30.fcVru8vxui_Jsuv1O8J7vh-Yn4dCcvPQ9UaOFZNjjQI"
FUNCTION_URL="$PROJECT_URL/functions/v1/chat-with-data"
DEFAULT_EMAIL="ahmed.mokhtar@2seasonshotels.com"
RUNS="${RUNS:-3}"
ONLY_CASE="${1:-}"
SESSION_ID="sera-battery-$(date -u +%Y%m%dT%H%M%SZ)"

# ---------------------------------------------------------------------------
# GROUND TRUTH — computed 2026-07-31 directly against project yczcebfaqerlwfalrbjn.
# Every number an assertion checks is listed here with the query that produced
# it, so a failure can be told apart from stale expectations. Re-run these in the
# Supabase SQL editor before trusting a failure.
#
#   wa_year_messages = 33526, wa_year_unique_senders = 3511
#     select count(*), count(distinct "Sender Number") from "Chat History"
#      where created_at >= '2025-08-01T00:00:00+04:00'
#        and created_at <  '2026-08-01T00:00:00+04:00';
#
#   reviews_may_2026 = 23, avg = 4.33
#     select count(*), round(avg("Score"),2) from "Two Seasons and Reviews"
#      where "Date" between '2026-05-01' and '2026-05-31';
#
#   reviews_june_2026 = 0
#     select count(*) from "Two Seasons and Reviews"
#      where "Date" between '2026-06-01' and '2026-06-30';
#
#   training_jan_2026 = 0
#     select count(*) from training_sessions
#      where training_date >= '2026-01-01T00:00:00+04:00'
#        and training_date <  '2026-02-01T00:00:00+04:00';
#
#   wa_july_messages = 1598, flag_human = 1, human_reply_text = 11
#     select count(*),
#            count(*) filter (where is_human_controlled),
#            count(*) filter (where btrim(coalesce(human_reply,'')) <> '')
#       from "Chat History"
#      where created_at >= '2026-07-01T00:00:00+04:00'
#        and created_at <  '2026-08-01T00:00:00+04:00';
# ---------------------------------------------------------------------------

# Cases are keyed arrays rather than delimiter-separated strings ON PURPOSE:
# the assertions are extended regexes full of `|` alternations, and any
# single-character field separator would have been eaten by one of them. The
# first draft of this script used `|` for both and would have mis-parsed every
# multi-alternative pattern into the wrong field.
#
# MUSTNOT of "-" means "no forbidden pattern". Matching is case-insensitive.
declare -A PROMPT MUST MUSTNOT NOTE

# The tool's row cap is 4000 (whatsapp-query-service.ts ROW_CAP), so the
# 33,526-message window is truncated by design and its caveat is mandatory.
WA_YEAR_Q="How many WhatsApp messages did we receive between 1 August 2025 and 31 July 2026, and how many unique guests were there?"
MAY_REVIEWS_Q="Exactly how many guest reviews did we get in May 2026, and what was the average score?"

ORDER=(truncation_total truncation_caveat empty_reviews empty_training exact_reviews exact_reviews_avg handling_caveat invalid_phone)

PROMPT[truncation_total]="$WA_YEAR_Q"
MUST[truncation_total]='33,?526'
MUSTNOT[truncation_total]='-'
NOTE[truncation_total]='total_messages is exact even when the row window is truncated (it comes from an exact count, not from len(rows)).'

PROMPT[truncation_caveat]="$WA_YEAR_Q"
MUST[truncation_caveat]='most recent|only the|narrow|subset|partial|4,?000'
MUSTNOT[truncation_caveat]='-'
NOTE[truncation_caveat]='The MANDATED truncation caveat: unique_guests covers only the newest 4000 rows. The case most at risk from the sampling change.'

PROMPT[empty_reviews]='How many guest reviews did we receive in June 2026?'
MUST[empty_reviews]='(\bno\b|\bzero\b|\b0\b)[[:space:]]+(guest[[:space:]]+)?reviews|\bnone\b|\bno reviews\b'
MUSTNOT[empty_reviews]='[1-9][0-9]*[[:space:]]+(guest[[:space:]]+)?reviews[[:space:]]+(in|during|for)[[:space:]]+June'
NOTE[empty_reviews]='June 2026 has zero review rows. The failure mode is inventing a plausible number. Patterns use \b deliberately: an earlier draft matched the "No" inside "Note" and the 0 inside "4,000", which passed on an answer about a different question entirely.'

PROMPT[empty_training]='How many training sessions were held in January 2026?'
MUST[empty_training]='(\bno\b|\bzero\b|\b0\b)[[:space:]]+training|\bnone\b'
MUSTNOT[empty_training]='[1-9][0-9]*[[:space:]]+training[[:space:]]+sessions[[:space:]]+(in|during|for)[[:space:]]+January'
NOTE[empty_training]='No training_sessions rows in that month. The forbidden pattern is scoped to January on purpose: an unscoped "N training" would fail a correct answer that also cites July for comparison.'

PROMPT[exact_reviews]="$MAY_REVIEWS_Q"
MUST[exact_reviews]='(^|[^0-9])23([^0-9]|$)'
MUSTNOT[exact_reviews]='-'
NOTE[exact_reviews]='Must use the tool rather than estimate: 23 reviews in May 2026.'

PROMPT[exact_reviews_avg]="$MAY_REVIEWS_Q"
MUST[exact_reviews_avg]='4\.3'
MUSTNOT[exact_reviews_avg]='-'
NOTE[exact_reviews_avg]='Average 4.33; accepts 4.3 or 4.33.'

PROMPT[handling_caveat]='In July 2026, how many WhatsApp chats were handled by a human rather than by the AI?'
MUST[handling_caveat]='approximate|overstate|flag|takeover|not exact|caveat'
MUSTNOT[handling_caveat]='-'
NOTE[handling_caveat]='REQUIRES the handled_by deploy. Before it the tool sends no caveat, so this SHOULD fail — that failure is the deploy gate, not a model regression. Live July figures diverge: the flag says 1, human_reply text says 11.'

PROMPT[invalid_phone]='How many WhatsApp messages did we get from Ahmed?'
MUST[invalid_phone]='phone|number'
MUSTNOT[invalid_phone]='[0-9]+[[:space:]]+messages[[:space:]]+from'
NOTE[invalid_phone]='Names cannot filter chats; the tool returns invalid_phone_number and the model must ask for a number instead of answering one.'

# ---------------------------------------------------------------------------

fallback_and_die() {
  cat >&2 <<EOF

Could not obtain an access token via password login.
If this account signs in via Azure AD (no Supabase password), take a JWT from the browser:

  1. Log into the dashboard as an admin.
  2. DevTools -> Console:

     JSON.parse(localStorage.getItem('sb-yczcebfaqerlwfalrbjn-auth-token')).access_token

  3. In this shell (NOT as a 'VAR=value cmd' prefix — that lands in ~/.bash_history):

     read -rs SERA_BATTERY_JWT; export SERA_BATTERY_JWT

  4. Re-run with no prefix:

     $0 $ONLY_CASE
EOF
  exit 1
}

obtain_jwt() {
  if [ -n "${SERA_BATTERY_JWT:-}" ]; then
    echo "Using SERA_BATTERY_JWT from environment." >&2
    printf '%s' "$SERA_BATTERY_JWT"; return 0
  fi
  echo "No SERA_BATTERY_JWT set — logging in with the Supabase password grant." >&2
  read -r -p "Email [$DEFAULT_EMAIL]: " LOGIN_EMAIL
  LOGIN_EMAIL="${LOGIN_EMAIL:-$DEFAULT_EMAIL}"
  read -rs -p "Password (not echoed): " LOGIN_PASSWORD
  echo "" >&2

  # Body built by python3 from the ENVIRONMENT and piped in on stdin: the
  # password never reaches curl's argv (world-readable via /proc/<pid>/cmdline)
  # and a quote or backslash in it cannot produce malformed JSON.
  local payload resp status body
  payload=$(LOGIN_EMAIL="$LOGIN_EMAIL" LOGIN_PASSWORD="$LOGIN_PASSWORD" python3 -c 'import json, os
print(json.dumps({"email": os.environ["LOGIN_EMAIL"], "password": os.environ["LOGIN_PASSWORD"]}))')
  unset LOGIN_PASSWORD

  resp=$(printf '%s' "$payload" | curl -sS -w '\n%{http_code}' \
    -X POST "$PROJECT_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" --data-binary @-)
  unset payload
  status="${resp##*$'\n'}"; body="${resp%$'\n'*}"
  if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
    echo "Password login failed (HTTP $status): $body" >&2; fallback_and_die
  fi
  local token
  token=$(printf '%s' "$body" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("access_token") or "")
except Exception: print("")')
  [ -n "$token" ] || { echo "No access_token in login response: $body" >&2; fallback_and_die; }
  echo "Login succeeded." >&2
  printf '%s' "$token"
}

JWT=$(obtain_jwt)

ask() { # $1 = prompt -> prints the assistant's answer text, or ERROR:...
  local prompt="$1" payload resp status body
  payload=$(PROMPT="$prompt" SID="$SESSION_ID" python3 -c 'import json, os
print(json.dumps({"message": os.environ["PROMPT"], "sessionId": os.environ["SID"],
                  "messageId": os.environ["SID"] + "-" + str(abs(hash(os.environ["PROMPT"])) % 10**8)}))')
  resp=$(printf '%s' "$payload" | curl -sS -m 180 -w '\n%{http_code}' \
    --config <(printf 'header = "Authorization: Bearer %s"\nheader = "apikey: %s"\n' "$JWT" "$ANON_KEY") \
    -X POST "$FUNCTION_URL" -H "Content-Type: application/json" --data-binary @-)
  status="${resp##*$'\n'}"; body="${resp%$'\n'*}"
  if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
    printf 'ERROR: HTTP %s %s' "$status" "$(printf '%s' "$body" | head -c 300)"; return
  fi
  printf '%s' "$body" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print((d.get("response") or "").replace("\n", " "))
except Exception as e:
    print("ERROR: unparseable response: %s" % e)'
}

echo ""
echo "Sera battery — session id: $SESSION_ID"
echo "Runs per case: $RUNS   Endpoint: $FUNCTION_URL"
echo "Ground truth dated 2026-07-31 (see the header of this script for the SQL)."
echo ""

TOTAL_FAIL=0
declare -a SUMMARY=()

MATCHED_CASE=0
for id in "${ORDER[@]}"; do
  if [ -n "$ONLY_CASE" ] && [ "$ONLY_CASE" != "$id" ]; then continue; fi
  MATCHED_CASE=1
  prompt="${PROMPT[$id]}"; must="${MUST[$id]}"; must_not="${MUSTNOT[$id]}"; note="${NOTE[$id]}"

  echo "── $id"
  echo "   $note"
  passes=0
  for run in $(seq 1 "$RUNS"); do
    answer="$(ask "$prompt")"
    ok=1
    reason=""
    if [[ "$answer" == ERROR:* ]]; then
      ok=0; reason="call failed"
    else
      if ! grep -Eiq -- "$must" <<< "$answer"; then ok=0; reason="missing /$must/"; fi
      if [ "$must_not" != "-" ] && grep -Eiq -- "$must_not" <<< "$answer"; then
        ok=0; reason="${reason:+$reason; }matched forbidden /$must_not/"
      fi
    fi
    if [ "$ok" -eq 1 ]; then
      passes=$((passes + 1)); echo "   run $run: PASS"
    else
      echo "   run $run: FAIL — $reason"
      echo "      answer: $(printf '%s' "$answer" | head -c 400)"
    fi
  done
  rate="$passes/$RUNS"
  if [ "$passes" -ne "$RUNS" ]; then TOTAL_FAIL=$((TOTAL_FAIL + 1)); fi
  SUMMARY+=("$(printf '%-22s %s' "$id" "$rate")")
  echo ""
done

if [ "$MATCHED_CASE" -eq 0 ]; then
  echo "No case matches id '$ONLY_CASE'. Known ids: ${ORDER[*]}" >&2
  exit 1
fi

echo "══ Summary (a case must pass EVERY run — a dropped caveat is a failure)"
for line in "${SUMMARY[@]}"; do echo "   $line"; done
echo ""
echo "Cleanup — this run wrote rows tagged '$SESSION_ID':"
echo "   delete from public.\"LongTermMemory\" where sender = '$SESSION_ID';"
echo "   delete from public.\"2s-dashboard_AI_Chat\" where session_id = '$SESSION_ID';"
echo ""

if [ "$TOTAL_FAIL" -gt 0 ]; then
  echo "RESULT: $TOTAL_FAIL case(s) did not pass every run." >&2
  exit 1
fi
echo "RESULT: all cases passed every run."
