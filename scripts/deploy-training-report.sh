#!/usr/bin/env bash
# Deploy training-report from a git-archive-pinned scratch workdir.
# Usage: SUPABASE_ACCESS_TOKEN=<token> [DEPLOY_REF=<ref>] bash scripts/deploy-training-report.sh
#
# Sibling of deploy-chat-with-data.sh, same contract and same reasons. Written
# because the MCP deploy_edge_function path requires every file's contents to be
# passed inline, which for this function means hand-reproducing ~82 KB across
# eight files — the wrong mechanism for code that emails three managers. This
# reads from git instead, so what deploys is exactly what was committed and
# tested.
#
# WHY IT NEEDS THE WHOLE TREE. training-report/index.ts imports across three
# directories:
#   ../_shared/http.ts, ../_shared/auth.ts, ../_shared/graph.ts
#   ../chat-with-data/paged-fetch.ts
# so the archive must contain _shared and chat-with-data as well, with their
# repo-relative paths intact. Only paged-fetch.ts is reachable from
# chat-with-data; the rest of that directory rides along unused and is not
# bundled.
#
# Self-verifying: queries the management API for the function version before and
# after, and exits non-zero unless the version actually bumped. A printed
# "DEPLOY OK" is proof the platform accepted a new version — nothing less. An
# exit 0 with no version change has happened on this project before (a stale
# copy of the deploy script), which is why the check exists.
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN must be set}"
REPO=/home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai
PROJECT=yczcebfaqerlwfalrbjn
FUNCTION=training-report
REF="${DEPLOY_REF:-HEAD}"

cd "$REPO"
SHA=$(git rev-parse "$REF")
echo "Deploying $FUNCTION at ref: $SHA"

# Refuse to deploy a dirty tree silently: git archive reads the COMMIT, so
# uncommitted edits would be invisibly excluded and the operator would believe
# they shipped them.
if ! git diff --quiet HEAD -- supabase/functions/training-report supabase/functions/_shared supabase/functions/chat-with-data; then
  echo "FATAL: uncommitted changes exist under the directories this deploys." >&2
  echo "       git archive reads the commit, not the working tree, so those edits" >&2
  echo "       would NOT be deployed. Commit them first, or pass DEPLOY_REF." >&2
  git status --short -- supabase/functions/training-report supabase/functions/_shared supabase/functions/chat-with-data >&2
  exit 1
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Repo config.toml fails CLI parse; build a minimal one in a scratch workdir so
# working-tree edits can never leak into a deploy.
git archive "$SHA" \
  supabase/functions/training-report \
  supabase/functions/_shared \
  supabase/functions/chat-with-data | tar -x -C "$WORK"
mkdir -p "$WORK/supabase"
cat > "$WORK/supabase/config.toml" <<EOF
project_id = "$PROJECT"

[functions.$FUNCTION]
verify_jwt = true
EOF
find "$WORK/supabase/functions" -name '*-old.ts' -delete
find "$WORK/supabase/functions" -name '*.test.ts' -delete

# Returns the deployed version number, or exits non-zero with NOTHING on stdout.
# The `|| return 1` and the guarded python are deliberate: the sibling
# deploy-chat-with-data.sh pipes a failed `curl -sf` straight into
# `json.load(sys.stdin)`, which prints a six-line Python traceback and buries the
# actual cause ("your token is wrong") below it. A confusing stack trace where a
# one-line diagnosis belongs is the same failure-wearing-a-costume pattern that
# cost a whole battery run this week, just smaller.
api() {
  local body
  body=$(curl -sf -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/$PROJECT/functions/$FUNCTION") || return 1
  printf '%s' "$body" | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin)["version"])
except Exception:
    sys.exit(1)' || return 1
}

BEFORE=$(api) || {
  echo "FATAL: could not read the current $FUNCTION version from the management API." >&2
  echo "       Almost always a bad or expired SUPABASE_ACCESS_TOKEN. Nothing was deployed." >&2
  exit 1
}
echo "Version before: $BEFORE"

cd "$WORK"
npx supabase functions deploy "$FUNCTION" --project-ref "$PROJECT" --use-api

AFTER=$(api) || { echo "FATAL: deploy ran but version re-query failed"; exit 1; }
echo "Version after: $AFTER"
if [ "$AFTER" -le "$BEFORE" ]; then
  echo "DEPLOY FAILED: version did not bump ($BEFORE -> $AFTER)"
  exit 1
fi
echo "DEPLOY OK: $FUNCTION v$AFTER at $SHA"
echo ""
echo "Next: confirm the occurrence-aware query works against the live schema."
echo "mode:'cron' accepts the public anon key, and with nothing due it exercises"
echo "countFailedReportRuns — the one query that filters on the new occurrence"
echo "column. outstandingFailures must come back 0, NOT null: null means that"
echo "query itself failed, which is what a bad occurrence filter would look like."
echo ""
echo "  curl -s -X POST https://$PROJECT.supabase.co/functions/v1/$FUNCTION \\"
echo "    -H \"apikey: \$ANON_KEY\" -H \"Authorization: Bearer \$ANON_KEY\" \\"
echo "    -H 'Content-Type: application/json' -d '{\"mode\":\"cron\"}'"
echo ""
echo "Then preview the new weekly email before the first real one on Friday:"
echo "  ./scripts/send-training-report-test.sh reminder 2026-08"
