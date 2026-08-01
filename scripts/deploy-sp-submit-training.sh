#!/usr/bin/env bash
# Deploy sp-submit-training from a git-archive-pinned scratch workdir.
# Usage: SUPABASE_ACCESS_TOKEN=<token> [DEPLOY_REF=<ref>] bash scripts/deploy-sp-submit-training.sh
#
# WHY THIS EXISTS NOW. sp-submit-training was a single file and could be deployed
# by hand or through the MCP deploy_edge_function tool without much pain. It is
# two files as of the $batch change (index.ts + participant-batch.ts), and MCP
# requires every file's contents inline, so the inline route now means
# hand-reproducing both files on every deploy. This reads from git instead, so
# what deploys is exactly what was committed and tested.
#
# WHY IT NEEDS _shared TOO. index.ts imports:
#   ../_shared/graph.ts  (getAppToken, getSiteId, graphFetch, GRAPH_BASE, LIST_IDS)
#   ../_shared/http.ts   (corsHeaders, json)
#   ../_shared/auth.ts   (getCallerEmail)
#   ./participant-batch.ts
# so the archive must contain _shared with its repo-relative path intact.
#
# verify_jwt = true matches the LIVE gateway setting (confirmed against
# list_edge_functions before this script was written). Do not change it casually:
# the function calls getCallerEmail(req) and returns 401 without a caller, so
# flipping it to false would move the authentication boundary from the gateway
# into the function for no benefit.
#
# Self-verifying: reads the function version before and after and exits non-zero
# unless it actually bumped. A printed "DEPLOY OK" is proof the platform accepted
# a new version — nothing less.
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN must be set}"
REPO=/home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai
PROJECT=yczcebfaqerlwfalrbjn
FUNCTION=sp-submit-training
REF="${DEPLOY_REF:-HEAD}"

cd "$REPO"
SHA=$(git rev-parse "$REF")
echo "Deploying $FUNCTION at ref: $SHA"

# Refuse to deploy a dirty tree silently: git archive reads the COMMIT, so
# uncommitted edits would be invisibly excluded and the operator would believe
# they shipped them.
if ! git diff --quiet HEAD -- supabase/functions/sp-submit-training supabase/functions/_shared; then
  echo "FATAL: uncommitted changes exist under the directories this deploys." >&2
  echo "       git archive reads the commit, not the working tree, so those edits" >&2
  echo "       would NOT be deployed. Commit them first, or pass DEPLOY_REF." >&2
  git status --short -- supabase/functions/sp-submit-training supabase/functions/_shared >&2
  exit 1
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Repo config.toml fails CLI parse; build a minimal one in a scratch workdir so
# working-tree edits can never leak into a deploy.
git archive "$SHA" \
  supabase/functions/sp-submit-training \
  supabase/functions/_shared | tar -x -C "$WORK"
mkdir -p "$WORK/supabase"
cat > "$WORK/supabase/config.toml" <<EOF
project_id = "$PROJECT"

[functions.$FUNCTION]
verify_jwt = true
EOF
find "$WORK/supabase/functions" -name '*-old.ts' -delete
find "$WORK/supabase/functions" -name '*.test.ts' -delete

# Sanity check the archive actually contains what index.ts imports. Cheap, and it
# turns a runtime "module not found" on the platform into a local failure.
for required in \
  supabase/functions/sp-submit-training/index.ts \
  supabase/functions/sp-submit-training/participant-batch.ts \
  supabase/functions/_shared/graph.ts \
  supabase/functions/_shared/http.ts \
  supabase/functions/_shared/auth.ts; do
  if [ ! -f "$WORK/$required" ]; then
    echo "FATAL: $required missing from the archive — nothing was deployed." >&2
    exit 1
  fi
done

# Returns the deployed version number, or exits non-zero with NOTHING on stdout.
# The guarded python is deliberate: piping a failed `curl -sf` straight into
# json.load prints a Python traceback and buries the actual cause ("your token is
# wrong") underneath it.
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
echo "FIRST SUBMISSION AFTER THIS DEPLOY IS THE ONLY PROOF OF THE \$batch FORMAT."
echo "The batch request shape and its relative sub-request URL come from"
echo "Microsoft's documented contract, not from a real call — there are no Azure"
echo "credentials in the dev environment and the e2e suite mocks this function at"
echo "the HTTP boundary. Submit one real training and check:"
echo ""
echo "  1. SharePoint participants list has every row."
echo "  2. select training_id, total_participants, sync_status from training_sessions"
echo "       order by created_at desc limit 1;    -- expect sync_status = 'synced'"
echo "  3. select count(*) from training_sync_queue;   -- expect 0 new rows"
echo ""
echo "If the batch URL were wrong, EVERY row would fail — which now reports as"
echo "failures and records the session as 'partial' with the rows queued, rather"
echo "than losing the session entirely. Degrades safely, but check anyway."
