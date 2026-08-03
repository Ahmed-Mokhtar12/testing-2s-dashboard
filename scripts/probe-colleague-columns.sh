#!/usr/bin/env bash
# THROWAWAY DIAGNOSTIC — DELETE THIS SCRIPT AND sp-probe-columns ONCE ANSWERED.
#
# Answers one question before the Colleagues_Master trainer field is built: what
# is the INTERNAL name of the ColleagueAccount Person column? Graph reads a Person
# column as `<internalName>LookupId`, an internal name diverges from the display
# name whenever a column is renamed after creation, and `$select` on a name that
# does not exist ERRORS rather than returning null — so guessing wrong would take
# the colleague read down for every user.
#
# Usage:
#   SUPABASE_ACCESS_TOKEN=<token> bash scripts/probe-colleague-columns.sh
#   SUPABASE_ACCESS_TOKEN=<token> bash scripts/probe-colleague-columns.sh uil
#
# Deploys sp-probe-columns from git, then calls it with your dashboard session's
# JWT and prints the columns. Read-only end to end: one GET against a list's
# column definitions, no writes, no mirror.
#
# WHY IT DOES NOT USE scripts/deploy-sp-function.sh: that script's allow-list is
# the application's set of functions, and a throwaway should not be added to it
# only to be removed again. This deploys the same way — git archive into a scratch
# workdir — so a working-tree edit still cannot reach the platform.
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN must be set}"
REPO=/home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai
PROJECT=yczcebfaqerlwfalrbjn
FUNCTION=sp-probe-columns
LIST="${1:-colleagues}"
REF="${DEPLOY_REF:-HEAD}"
PROJECT_URL="https://$PROJECT.supabase.co"
# The published anon key. Not a secret: it is the same value the browser ships.
ANON_KEY=$(grep -oE 'eyJ[A-Za-z0-9_.-]{40,}' "$REPO/src/integrations/supabase/client.ts" | head -1)
[ -n "$ANON_KEY" ] || { echo "FATAL: could not read the anon key from src/integrations/supabase/client.ts" >&2; exit 1; }

cd "$REPO"
SHA=$(git rev-parse "$REF")

if ! git diff --quiet HEAD -- "supabase/functions/$FUNCTION" supabase/functions/_shared; then
  echo "FATAL: uncommitted changes under the directories this deploys." >&2
  echo "       git archive reads the commit, so those edits would NOT be deployed." >&2
  exit 1
fi

echo "=== deploying $FUNCTION at $SHA ==="
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
git archive "$SHA" "supabase/functions/$FUNCTION" supabase/functions/_shared | tar -x -C "$WORK"
mkdir -p "$WORK/supabase"
cat > "$WORK/supabase/config.toml" <<EOF
project_id = "$PROJECT"

[functions.$FUNCTION]
verify_jwt = true
EOF
find "$WORK/supabase/functions" -name '*.test.ts' -delete
( cd "$WORK" && npx supabase functions deploy "$FUNCTION" --project-ref "$PROJECT" --use-api )

# ---------------------------------------------------------------- the JWT
# verify_jwt=true plus getCallerEmail means this needs a real signed-in user. A
# service-role key has no user and fails the second check, so there is no way to
# run this without the operator's own session.
if [ -z "${PROBE_JWT:-}" ]; then
  cat >&2 <<'EOM'

Need your dashboard session's access token. To get it:

  1. Open https://testing-2s-dashboard.digitlab.ai and sign in.
  2. DevTools console, paste:
       JSON.parse(localStorage.getItem('sb-yczcebfaqerlwfalrbjn-auth-token')).access_token
  3. Copy the token (no quotes), then in THIS shell run these two lines —
     not as a `PROBE_JWT=<token> bash ...` prefix, which would put the token in
     this process's world-readable /proc/<pid>/cmdline:

       read -rs PROBE_JWT; export PROBE_JWT
       (paste, press Enter — it is not echoed and never written to disk)

  4. Re-run this script.

EOM
  exit 2
fi

echo "=== calling $FUNCTION?list=$LIST ==="
# Auth headers go via a curl --config file on a process substitution, NOT -H:
# an -H value lands in curl's argv, which is world-readable through
# /proc/<pid>/cmdline for the life of the request.
RESP=$(curl -sS -w '\n%{http_code}' \
  --config <(printf 'header = "Authorization: Bearer %s"\nheader = "apikey: %s"\n' "$PROBE_JWT" "$ANON_KEY") \
  "$PROJECT_URL/functions/v1/$FUNCTION?list=$LIST")
STATUS="${RESP##*$'\n'}"
BODY="${RESP%$'\n'*}"

echo "HTTP status: $STATUS"
if [ "$STATUS" != "200" ]; then
  printf '%s\n' "$BODY" >&2
  [ "$STATUS" = "401" ] && echo "401 means the JWT is expired or wrong — get a fresh one (step 2 above)." >&2
  exit 1
fi

# The renderer goes to a file via a QUOTED heredoc rather than `python3 -c '...'`.
# In -c form the python body sits inside shell single quotes, so its own string
# literals cannot use single quotes, and escaping the double quotes instead is a
# syntax error inside an f-string expression. A file has neither problem.
cat > "$WORK/render.py" <<'PY'
import json, sys

data = json.load(sys.stdin)
print(f"\nlist: {data['list']}  ({data['columnCount']} columns)\n")

person = data['personColumns']
print('PERSON / GROUP COLUMNS — the answer this probe exists for:')
if not person:
    print('  NONE. Either ColleagueAccount is not a Person column on this list, or it')
    print('  is not visible to the app registration. Do not build the trainer field on')
    print('  it until this says otherwise.')
else:
    for c in person:
        print(f"  internal name : {c['name']}")
        print(f"  display name  : {c['displayName']}")
        print(f"  WRITE/READ AS : {c['readsAs']}")
        print(f"  multi-select  : {c['allowMultipleSelection']}   chooseFromType: {c['chooseFromType']}")
        print(f"  hidden={c['hidden']} readOnly={c['readOnly']} required={c['required']}")
        print()

print('ALL COLUMNS (internal name / display name / type):')
for c in data['columns']:
    flags = ''.join(f for f, on in (('H', c['hidden']), ('R', c['readOnly']), ('*', c['required'])) if on)
    print(f"  {c['name']:<34} {str(c['displayName']):<34} {c['type']:<14} {flags}")
PY
printf '%s' "$BODY" | python3 "$WORK/render.py"

cat <<EOM

=== next ===
Use the INTERNAL name above in the implementation, not the display name.
Then delete this probe:
  git rm -r supabase/functions/$FUNCTION scripts/probe-colleague-columns.sh
and remove the deployed function from the platform (Supabase dashboard ->
Edge Functions -> $FUNCTION -> delete), because deleting the source does not
undeploy it.
EOM
