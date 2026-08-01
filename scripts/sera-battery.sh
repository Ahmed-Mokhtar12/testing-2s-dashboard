#!/usr/bin/env bash
# Sera regression battery — the model-sensitive subset.
#
# WHY THIS EXISTS: every case below depends on the model RELAYING something the
# tool told it to say — a truncation caveat, an empty result, an approximate
# figure warning. That is exactly the behaviour a model or sampling change
# degrades, and it is invisible to unit tests because the tool output is correct
# either way; only the prose changes.
#
# Each case runs RUNS times (default 3) and reports a pass RATE. A case that
# passes 2 of 3 is not passing; it is a caveat the model drops a third of the
# time, which is worse than one that never appears, because nobody will notice.
#
# NO STALE LITERALS. Every numeric expectation is derived from the database at
# run time, through the SAME PostgREST the tools use, with the caller's own JWT.
# The first version of this script hardcoded ground truth dated 2026-07-31 and
# was wrong within a day: it demanded 33,526 WhatsApp messages, Sera correctly
# answered 33,528, and the case reported 0/3 against a right answer. The 2026-08
# reviews backfill would have done the same to three more cases. A literal in
# here is a time bomb, so there are none.
#
# THE DERIVATION FAILS CLOSED. If any ground-truth read fails, or returns an
# unbounded/zero count where rows are expected, the script ABORTS rather than
# asserting against a fallback. A case that "passes" because its expectation
# collapsed to 0 is worse than no case.
#
# Usage:
#   ./scripts/sera-battery.sh                # all cases, 3 runs each
#   RUNS=5 ./scripts/sera-battery.sh         # 5 runs each
#   ./scripts/sera-battery.sh truncation_caveat   # one case by id
#
# NOT read-only: every call makes chat-with-data insert a row into
# LongTermMemory, and (because this script passes a sessionId) one into
# "2s-dashboard_AI_Chat". Both are tagged with the session id printed at the
# start, and the cleanup SQL is printed at the end. It also spends real LLM
# tokens — RUNS x 8 calls for a full run.
set -uo pipefail

PROJECT_URL="https://yczcebfaqerlwfalrbjn.supabase.co"
# Public anon key — same value published in src/integrations/supabase/client.ts.
# Identifies the API, grants nothing: chat-with-data and the tables both require
# a real admin/staff JWT.
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljemNlYmZhcWVybHdmYWxyYmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0ODE1MTcsImV4cCI6MjA2MTA1NzUxN30.fcVru8vxui_Jsuv1O8J7vh-Yn4dCcvPQ9UaOFZNjjQI"
FUNCTION_URL="$PROJECT_URL/functions/v1/chat-with-data"
DEFAULT_EMAIL="ahmed.mokhtar@2seasonshotels.com"
RUNS="${RUNS:-3}"
ONLY_CASE="${1:-}"
SESSION_ID="sera-battery-$(date -u +%Y%m%dT%H%M%SZ)"

# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

fallback_and_die() {
  cat >&2 <<EOF

Could not obtain an access token via password login.
If this account signs in via Azure AD (no Supabase password), take a JWT from
the browser:

  1. Log into the dashboard as an admin.
  2. DevTools -> Console:

     JSON.parse(localStorage.getItem('sb-yczcebfaqerlwfalrbjn-auth-token')).access_token

  3. In this shell (NOT as a 'VAR=value cmd' prefix — that lands in
     ~/.bash_history):

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

# THE BUG THIS GUARD EXISTS FOR, and it is the exact class this whole script was
# built to catch. `set -uo pipefail` has no `-e`, and fallback_and_die's `exit 1`
# runs inside the command-substitution SUBSHELL of `JWT=$(obtain_jwt)`. It
# killed the subshell and nothing else: the script sailed on with JWT='', made
# RUNS x 8 calls that every one 401'd, and printed
# "RESULT: 8 case(s) did not pass every run" — a wall of red caused by having no
# token at all, formatted identically to a real model regression. Failure wearing
# the costume of a result. (The two send-training-report scripts use
# `set -euo pipefail`, where the same construct does exit; only this one was
# exposed.) So the status is now checked in the PARENT shell, three ways.
if ! JWT=$(obtain_jwt); then
  echo "FATAL: no access token — aborting before any call. Nothing was run." >&2
  exit 1
fi
if [ -z "$JWT" ]; then
  echo "FATAL: obtain_jwt returned an empty token — aborting. Nothing was run." >&2
  exit 1
fi
# Shape check: three non-empty dot-separated segments. Catches a truncated or
# quote-wrapped paste before it turns into 24 identical 401s.
if ! printf '%s' "$JWT" | grep -Eq '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'; then
  echo "FATAL: SERA_BATTERY_JWT is not a well-formed JWT (expected three dot-separated" >&2
  echo "       base64url segments, got ${#JWT} chars). Did the paste include quotes or" >&2
  echo "       get truncated? Aborting — nothing was run." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# GROUND TRUTH, derived at run time
# ---------------------------------------------------------------------------
# All PostgREST work happens in one python3 pass rather than in bash: it needs
# URL encoding (the +04:00 offsets MUST be percent-encoded or the + becomes a
# space), Content-Range parsing, paging around api.max_rows = 1000, and month
# arithmetic. Counts come from `Prefer: count=exact` + `Range: 0-0`, which
# reports the true total in Content-Range and is therefore immune to the very
# 1000-row clamp that produced the bug truncation_total regression-tests.
#
# Modes: `derive` prints KEY=value lines for the case table; `wa-count` prints
# one number, used to bracket the WhatsApp total around each individual call.

WA_FROM='2025-08-01T00:00:00+04:00'
WA_TO='2026-08-01T00:00:00+04:00'

ground_truth() { # $1 = derive | wa-count
  MODE="$1" PROJECT_URL="$PROJECT_URL" JWT="$JWT" ANON_KEY="$ANON_KEY" \
  WA_FROM="$WA_FROM" WA_TO="$WA_TO" python3 - <<'PY'
import json, os, sys, urllib.parse, urllib.request
from collections import Counter
from datetime import date

BASE = os.environ['PROJECT_URL'].rstrip('/') + '/rest/v1/'
HDRS = {'apikey': os.environ['ANON_KEY'], 'Authorization': 'Bearer ' + os.environ['JWT']}
MODE = os.environ['MODE']

def die(msg):
    print('GROUND TRUTH DERIVATION FAILED: ' + msg, file=sys.stderr)
    sys.exit(1)

def get(table, params, extra=None):
    url = BASE + urllib.parse.quote(table) + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url)
    for k, v in {**HDRS, **(extra or {})}.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b'[]'), r.headers.get('Content-Range')
    except urllib.error.HTTPError as e:
        die('HTTP %s on %s — %s' % (e.code, table, (e.read() or b'')[:200].decode('utf8', 'replace')))
    except Exception as e:
        die('%s on %s' % (e, table))

def exact_count(table, params, col):
    _, cr = get(table, {**params, 'select': col},
                {'Prefer': 'count=exact', 'Range': '0-0'})
    if not cr or '/' not in cr:
        die('no Content-Range header for %s (cannot establish an exact count)' % table)
    total = cr.rsplit('/', 1)[1]
    if total in ('*', ''):
        die('unbounded count for %s — refusing to guess' % table)
    return int(total)

def page_all(table, params, select, order='id', cap=20000):
    """Page past api.max_rows. Fails closed rather than returning a short read.

    Ordered by a UNIQUE column (id on both tables used here), not by the
    selected data column: ordering by a non-unique Date would let rows shift
    between pages and silently duplicate or drop some — the same class of
    quiet-wrong-total the paged-fetch work fixed on the edge side.
    """
    out, start = [], 0
    while True:
        rows, _ = get(table, {**params, 'select': select, 'order': order + '.asc'},
                      {'Range': '%d-%d' % (start, start + 999)})
        out.extend(rows)
        if len(rows) < 1000:
            return out
        start += 1000
        if start > cap:
            die('%s exceeded the %d-row derivation cap' % (table, cap))

wa_params = {'created_at': ['gte.' + os.environ['WA_FROM'], 'lt.' + os.environ['WA_TO']]}
# urlencode with a list value needs doseq; build the query manually instead so
# the two created_at filters both survive.
def wa_count():
    q = 'select=created_at&created_at=gte.%s&created_at=lt.%s' % (
        urllib.parse.quote(os.environ['WA_FROM'], safe=''),
        urllib.parse.quote(os.environ['WA_TO'], safe=''))
    url = BASE + urllib.parse.quote('Chat History') + '?' + q
    req = urllib.request.Request(url)
    for k, v in {**HDRS, 'Prefer': 'count=exact', 'Range': '0-0'}.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            cr = r.headers.get('Content-Range')
    except urllib.error.HTTPError as e:
        die('HTTP %s counting Chat History — %s' % (e.code, (e.read() or b'')[:200].decode('utf8', 'replace')))
    except Exception as e:
        die('%s counting Chat History' % e)
    if not cr or '/' not in cr:
        die('no Content-Range counting Chat History')
    total = cr.rsplit('/', 1)[1]
    if total in ('*', ''):
        die('unbounded count for Chat History')
    n = int(total)
    if n == 0:
        die('Chat History count came back 0 for a year-long window — this is an '
            'access failure (RLS/JWT), not a quiet year. Refusing to assert against 0.')
    return n

if MODE == 'wa-count':
    print(wa_count())
    sys.exit(0)

out = {}
out['WA_YEAR_TOTAL'] = wa_count()

MONTHS = ['January','February','March','April','May','June','July',
          'August','September','October','November','December']
def label(ym):
    y, m = ym.split('-')
    return '%s %s' % (MONTHS[int(m) - 1], y)

def month_grid(back):
    """The `back` complete months before the current one, newest first."""
    today = date.today()
    y, m = today.year, today.month
    grid = []
    for _ in range(back):
        m -= 1
        if m == 0:
            m, y = 12, y - 1
        grid.append('%04d-%02d' % (y, m))
    return grid

# --- reviews: find one empty month and one small non-empty month -----------
rev = page_all('Two Seasons and Reviews', {'Date': 'gte.' + month_grid(24)[-1] + '-01'}, 'id,Date,Score')
rev_by_month = Counter()
scores_by_month = {}
for row in rev:
    d = (row.get('Date') or '')[:7]
    if not d:
        continue
    rev_by_month[d] += 1
    if row.get('Score') is not None:
        scores_by_month.setdefault(d, []).append(float(row['Score']))

grid = month_grid(24)
empty_rev = next((ym for ym in grid if rev_by_month[ym] == 0), None)
if empty_rev:
    out['EMPTY_REVIEWS_MONTH'] = empty_rev
    out['EMPTY_REVIEWS_LABEL'] = label(empty_rev)
else:
    out['SKIP_EMPTY_REVIEWS'] = 'every one of the last 24 complete months has reviews'

exact_rev = next((ym for ym in grid if 1 <= rev_by_month[ym] <= 500), None)
if exact_rev and scores_by_month.get(exact_rev):
    scores = scores_by_month[exact_rev]
    avg = round(sum(scores) / len(scores) + 1e-12, 2)
    out['EXACT_REVIEWS_MONTH'] = exact_rev
    out['EXACT_REVIEWS_LABEL'] = label(exact_rev)
    out['EXACT_REVIEWS_COUNT'] = rev_by_month[exact_rev]
    out['EXACT_REVIEWS_AVG'] = '%.2f' % avg
    out['EXACT_REVIEWS_AVG1'] = '%.1f' % avg
    out['EXACT_REVIEWS_SCORED'] = len(scores)
else:
    out['SKIP_EXACT_REVIEWS'] = 'no complete month in the last 24 has between 1 and 500 scored reviews'

# --- training: find one empty month ---------------------------------------
tr = page_all('training_sessions', {'training_date': 'gte.' + grid[-1] + '-01'}, 'id,training_date')
tr_by_month = Counter((r.get('training_date') or '')[:7] for r in tr)
empty_tr = next((ym for ym in grid if tr_by_month[ym] == 0), None)
if empty_tr:
    out['EMPTY_TRAINING_MONTH'] = empty_tr
    out['EMPTY_TRAINING_LABEL'] = label(empty_tr)
else:
    out['SKIP_EMPTY_TRAINING'] = 'every one of the last 24 complete months has training sessions'

for k, v in out.items():
    print('%s=%s' % (k, v))
PY
}

echo ""
echo "Sera battery — session id: $SESSION_ID"
echo "Runs per case: $RUNS   Endpoint: $FUNCTION_URL"
echo ""
echo "Deriving ground truth from the live database (no hardcoded figures)..."

GT="$(ground_truth derive)" || {
  echo "FATAL: could not derive ground truth (see the error above). Aborting before" >&2
  echo "       any Sera call — a battery with no expectations is not a battery." >&2
  exit 1
}

# Read KEY=value lines into shell variables. Values here are integers, YYYY-MM
# strings, month labels and skip reasons, all produced by the python block above
# — not free-form remote data — so a plain read loop is appropriate.
declare -A G=()
while IFS='=' read -r k v; do
  [ -n "$k" ] && G["$k"]="$v"
done <<< "$GT"

printf '  WhatsApp %s..%s: %s messages\n' "${WA_FROM:0:10}" "${WA_TO:0:10}" "${G[WA_YEAR_TOTAL]}"
[ -n "${G[EXACT_REVIEWS_MONTH]:-}" ] && printf '  Reviews %s: %s reviews, average %s (over %s scored rows)\n' \
  "${G[EXACT_REVIEWS_LABEL]}" "${G[EXACT_REVIEWS_COUNT]}" "${G[EXACT_REVIEWS_AVG]}" "${G[EXACT_REVIEWS_SCORED]}"
[ -n "${G[EMPTY_REVIEWS_MONTH]:-}" ] && printf '  Reviews %s: 0 reviews (the empty-result case)\n' "${G[EMPTY_REVIEWS_LABEL]}"
[ -n "${G[EMPTY_TRAINING_MONTH]:-}" ] && printf '  Training %s: 0 sessions (the empty-result case)\n' "${G[EMPTY_TRAINING_LABEL]}"
echo ""

# ---------------------------------------------------------------------------
# Cases
# ---------------------------------------------------------------------------
# Keyed arrays rather than delimiter-separated strings ON PURPOSE: the
# assertions are extended regexes full of `|` alternations, and any
# single-character field separator would have been eaten by one of them. The
# first draft used `|` for both and would have mis-parsed every multi-
# alternative pattern into the wrong field.
#
# MUSTNOT of "-" means "no forbidden pattern". Matching is case-insensitive.
# CHECK[id] names a shell function that replaces MUST/MUSTNOT for that case,
# for expectations that cannot be a fixed pattern.
# SKIP[id] set means the ground truth for that case does not exist right now.
declare -A PROMPT MUST MUSTNOT NOTE CHECK SKIP

# An empty-result answer does NOT put the number next to the noun. Sera said
# "No staff training sessions were logged ... for January 2026" and the old
# pattern — (no|zero|0) then whitespace then the noun — scored it a failure for
# the word "staff". Correct, honest, marked wrong. So the number and the noun
# may now be separated by up to three words, still within one clause.
NEAR='([a-z]+[[:space:]]+){0,3}'
NONE="(\\bno\\b|\\bzero\\b|\\b0\\b)[[:space:]]+${NEAR}"

WA_YEAR_Q="How many WhatsApp messages did we receive between 1 August 2025 and 31 July 2026, and how many unique guests were there?"

ORDER=(truncation_total truncation_caveat empty_reviews empty_training exact_reviews exact_reviews_avg handling_caveat invalid_phone)

# The tool's row cap is 4000 (whatsapp-query-service.ts ROW_CAP), so the
# 33k-message window is truncated by design and its caveat is mandatory.
PROMPT[truncation_total]="$WA_YEAR_Q"
MUST[truncation_total]='(unused — see CHECK)'
MUSTNOT[truncation_total]='-'
CHECK[truncation_total]=check_wa_total
NOTE[truncation_total]='total_messages must be EXACT even though the row window is truncated (it comes from an exact count, not len(rows)). Expectation is re-read from the database around every single call — see check_wa_total.'

PROMPT[truncation_caveat]="$WA_YEAR_Q"
MUST[truncation_caveat]='most recent|only the|narrow|subset|partial|4,?000'
MUSTNOT[truncation_caveat]='-'
NOTE[truncation_caveat]='The MANDATED truncation caveat: unique_guests covers only the newest 4000 rows. No literal figures, so this case cannot go stale.'

if [ -n "${G[EMPTY_REVIEWS_MONTH]:-}" ]; then
  PROMPT[empty_reviews]="How many guest reviews did we receive in ${G[EMPTY_REVIEWS_LABEL]}?"
  MUST[empty_reviews]="${NONE}reviews|\\bnone\\b|\\bno reviews\\b"
  MUSTNOT[empty_reviews]="[1-9][0-9]*[[:space:]]+${NEAR}reviews[[:space:]]+(in|during|for)[[:space:]]+${G[EMPTY_REVIEWS_LABEL]%% *}"
  NOTE[empty_reviews]="${G[EMPTY_REVIEWS_LABEL]} has zero review rows (checked this run, not assumed — the month is chosen at run time, so the 2026-08 backfill filling June cannot turn this into a false failure). The failure mode is inventing a plausible number. Patterns are \\b-bounded deliberately: an earlier draft matched the \"No\" inside \"Note\" and the 0 inside \"4,000\", passing on an answer to a different question."
else
  SKIP[empty_reviews]="${G[SKIP_EMPTY_REVIEWS]}"
fi

if [ -n "${G[EMPTY_TRAINING_MONTH]:-}" ]; then
  PROMPT[empty_training]="How many training sessions were held in ${G[EMPTY_TRAINING_LABEL]}?"
  MUST[empty_training]="${NONE}training|\\bnone\\b"
  MUSTNOT[empty_training]="[1-9][0-9]*[[:space:]]+${NEAR}training[[:space:]]+sessions[[:space:]]+(in|during|for)[[:space:]]+${G[EMPTY_TRAINING_LABEL]%% *}"
  NOTE[empty_training]="No training_sessions rows in ${G[EMPTY_TRAINING_LABEL]} (checked this run). The forbidden pattern is scoped to that month on purpose: an unscoped \"N training\" would fail a correct answer that also cites another month for comparison."
else
  SKIP[empty_training]="${G[SKIP_EMPTY_TRAINING]}"
fi

if [ -n "${G[EXACT_REVIEWS_MONTH]:-}" ]; then
  MONTH_REVIEWS_Q="Exactly how many guest reviews did we get in ${G[EXACT_REVIEWS_LABEL]}, and what was the average score?"
  PROMPT[exact_reviews]="$MONTH_REVIEWS_Q"
  MUST[exact_reviews]="(^|[^0-9])${G[EXACT_REVIEWS_COUNT]}([^0-9]|\$)"
  MUSTNOT[exact_reviews]='-'
  NOTE[exact_reviews]="Must use the tool rather than estimate: ${G[EXACT_REVIEWS_COUNT]} reviews in ${G[EXACT_REVIEWS_LABEL]}, counted this run."

  PROMPT[exact_reviews_avg]="$MONTH_REVIEWS_Q"
  MUST[exact_reviews_avg]="${G[EXACT_REVIEWS_AVG]//./\\.}|${G[EXACT_REVIEWS_AVG1]//./\\.}"
  MUSTNOT[exact_reviews_avg]='-'
  NOTE[exact_reviews_avg]="Average ${G[EXACT_REVIEWS_AVG]} over ${G[EXACT_REVIEWS_SCORED]} scored rows, computed this run the way Postgres avg() does (NULL scores excluded). Accepts ${G[EXACT_REVIEWS_AVG]} or ${G[EXACT_REVIEWS_AVG1]}."
else
  SKIP[exact_reviews]="${G[SKIP_EXACT_REVIEWS]}"
  SKIP[exact_reviews_avg]="${G[SKIP_EXACT_REVIEWS]}"
fi

PROMPT[handling_caveat]='In July 2026, how many WhatsApp chats were handled by a human rather than by the AI?'
MUST[handling_caveat]='approximate|overstate|flag|takeover|not exact|caveat'
MUSTNOT[handling_caveat]='-'
NOTE[handling_caveat]='The two July signals diverge (the is_human_controlled flag says 1, human_reply text says 11), so the tool is required to hand the model a caveat and the model is required to relay it. No literals, so it cannot go stale.'

PROMPT[invalid_phone]='How many WhatsApp messages did we get from Ahmed?'
MUST[invalid_phone]='phone|number'
MUSTNOT[invalid_phone]='[0-9]+[[:space:]]+messages[[:space:]]+from'
NOTE[invalid_phone]='Names cannot filter chats; the tool returns invalid_phone_number and the model must ask for a number instead of answering one.'

# ---------------------------------------------------------------------------
# Calling
# ---------------------------------------------------------------------------

# Set by ask() so the runner can tell a transport/auth failure apart from a
# model failure. A 401/403 is never a Sera result and aborts the whole run.
LAST_STATUS=""

ask() { # $1 = prompt -> prints the assistant's answer text, or ERROR:...
  local prompt="$1" payload resp status body
  payload=$(PROMPT="$prompt" SID="$SESSION_ID" python3 -c 'import json, os
print(json.dumps({"message": os.environ["PROMPT"], "sessionId": os.environ["SID"],
                  "messageId": os.environ["SID"] + "-" + str(abs(hash(os.environ["PROMPT"])) % 10**8)}))')
  resp=$(printf '%s' "$payload" | curl -sS -m 180 -w '\n%{http_code}' \
    --config <(printf 'header = "Authorization: Bearer %s"\nheader = "apikey: %s"\n' "$JWT" "$ANON_KEY") \
    -X POST "$FUNCTION_URL" -H "Content-Type: application/json" --data-binary @-)
  status="${resp##*$'\n'}"; body="${resp%$'\n'*}"
  LAST_STATUS="$status"
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

CHECK_REASON=""

# Brackets the expectation around the call instead of pinning one literal:
# reads the count before, asks, reads it again after, and accepts any figure in
# [before, after]. When nothing landed during the call — the normal case —
# before == after and this is an exact assertion. When a message did land, the
# window is precisely the legitimate ambiguity and nothing wider. This is what
# replaces the 33,526 literal that failed against a correct 33,528.
check_wa_total() { # $1 = answer ; $2 = count read before the call
  local answer="$1" before="$2" after n
  after=$(ground_truth wa-count) || { CHECK_REASON="could not re-read the count after the call"; return 1; }
  for n in $(printf '%s' "$answer" | grep -oE '[0-9][0-9,]*' | tr -d ','); do
    # Skip digit runs too long for shell arithmetic (a 25-digit id would make
    # `[ -ge ]` error out rather than compare). Real counts are nowhere near it.
    [ "${#n}" -le 18 ] || continue
    if [ "$n" -ge "$before" ] && [ "$n" -le "$after" ]; then
      CHECK_REASON=""
      return 0
    fi
  done
  if [ "$before" = "$after" ]; then
    CHECK_REASON="answer contains no figure equal to $before"
  else
    CHECK_REASON="answer contains no figure in [$before, $after] (rows landed during the call)"
  fi
  return 1
}

pre_wa_total() { ground_truth wa-count; }
declare -A PRE=()
PRE[truncation_total]=pre_wa_total

# PREFLIGHT. One real call before any case, purely to separate "the endpoint
# rejects us" from "the model got it wrong". Without this, an expired but
# well-formed token still produces RUNS x 8 red lines in result format — the
# same costume the missing-JWT bug wore, just with a different cause.
echo "Preflight: one call to confirm the endpoint accepts this token..."
PREFLIGHT="$(ask 'Reply with the single word ready.')"
if [ "$LAST_STATUS" = "401" ] || [ "$LAST_STATUS" = "403" ]; then
  echo "" >&2
  echo "FATAL: chat-with-data rejected this token (HTTP $LAST_STATUS)." >&2
  echo "       $(printf '%s' "$PREFLIGHT" | head -c 200)" >&2
  echo "" >&2
  echo "This is an AUTHORISATION failure, not a Sera result. Nothing was tested." >&2
  echo "A 401 usually means the JWT expired (they are short-lived — re-copy it);" >&2
  echo "a 403 means the account is not admin/staff." >&2
  exit 1
fi
if [[ "$PREFLIGHT" == ERROR:* ]]; then
  echo "" >&2
  echo "FATAL: preflight call failed — $PREFLIGHT" >&2
  echo "This is a transport failure, not a Sera result. Nothing was tested." >&2
  exit 1
fi
echo "  ok."
echo ""

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

TOTAL_FAIL=0
TOTAL_ERROR=0
declare -a SUMMARY=()

MATCHED_CASE=0
for id in "${ORDER[@]}"; do
  if [ -n "$ONLY_CASE" ] && [ "$ONLY_CASE" != "$id" ]; then continue; fi
  MATCHED_CASE=1

  if [ -n "${SKIP[$id]:-}" ]; then
    echo "── $id"
    echo "   SKIPPED: ${SKIP[$id]}"
    echo "   Not a pass and not a failure — the data this case needs does not exist right now."
    SUMMARY+=("$(printf '%-22s %s' "$id" "SKIPPED")")
    echo ""
    continue
  fi

  prompt="${PROMPT[$id]}"; note="${NOTE[$id]}"
  echo "── $id"
  echo "   $note"
  passes=0
  errors=0
  for run in $(seq 1 "$RUNS"); do
    pre=""
    if [ -n "${PRE[$id]:-}" ]; then
      pre="$(${PRE[$id]})" || { echo "   run $run: ERROR — ground-truth pre-read failed"; errors=$((errors+1)); continue; }
    fi

    answer="$(ask "$prompt")"

    # An auth failure part-way through (token expiry mid-run is entirely normal
    # for a 24-call battery) must stop everything. Counting it as a case failure
    # is how a wall of red gets mistaken for a regression.
    if [ "$LAST_STATUS" = "401" ] || [ "$LAST_STATUS" = "403" ]; then
      echo "" >&2
      echo "FATAL: the token stopped being accepted mid-run (HTTP $LAST_STATUS) at $id run $run." >&2
      echo "       Results so far are incomplete and are NOT printed as a summary," >&2
      echo "       because a partial run in result format is exactly the failure this" >&2
      echo "       script exists to catch. Re-copy the JWT and start again." >&2
      exit 1
    fi

    ok=1
    reason=""
    if [[ "$answer" == ERROR:* ]]; then
      ok=0; reason="call failed"; errors=$((errors+1))
    elif [ -n "${CHECK[$id]:-}" ]; then
      if ! "${CHECK[$id]}" "$answer" "$pre"; then ok=0; reason="$CHECK_REASON"; fi
    else
      must="${MUST[$id]}"; must_not="${MUSTNOT[$id]}"
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
  if [ "$errors" -gt 0 ]; then TOTAL_ERROR=$((TOTAL_ERROR + 1)); rate="$rate (${errors} call error(s))"; fi
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

if [ "$TOTAL_ERROR" -gt 0 ]; then
  echo "NOTE: $TOTAL_ERROR case(s) had at least one CALL ERROR (transport, not model)." >&2
  echo "      Those are infrastructure, not regressions — re-run before drawing conclusions." >&2
fi
if [ "$TOTAL_FAIL" -gt 0 ]; then
  echo "RESULT: $TOTAL_FAIL case(s) did not pass every run." >&2
  exit 1
fi
echo "RESULT: all cases passed every run."
