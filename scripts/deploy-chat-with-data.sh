#!/usr/bin/env bash
# Deploy chat-with-data from a git-archive-pinned scratch workdir.
# Usage: SUPABASE_ACCESS_TOKEN=<token> [DEPLOY_REF=<ref>] bash deploy.sh
#
# Self-verifying: queries the management API for the function version before
# and after, and exits non-zero unless the version actually bumped. A printed
# "DEPLOY OK" is proof the platform accepted a new version — nothing less.
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN must be set}"
REPO=/home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai
PROJECT=yczcebfaqerlwfalrbjn
REF="${DEPLOY_REF:-HEAD}"

cd "$REPO"
SHA=$(git rev-parse "$REF")
echo "Deploying ref: $SHA"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Repo config.toml fails CLI parse; build a minimal one in a scratch workdir
# so working-tree edits can never leak into a deploy.
git archive "$SHA" supabase/functions/chat-with-data supabase/functions/_shared | tar -x -C "$WORK"
mkdir -p "$WORK/supabase"
cat > "$WORK/supabase/config.toml" <<EOF
project_id = "$PROJECT"

[functions.chat-with-data]
verify_jwt = true
EOF
find "$WORK/supabase/functions" -name '*-old.ts' -delete
find "$WORK/supabase/functions" -name '*.test.ts' -delete

api() {
  curl -sf -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/$PROJECT/functions/chat-with-data" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])'
}

BEFORE=$(api) || { echo "FATAL: cannot query management API (bad token?)"; exit 1; }
echo "Version before: $BEFORE"

cd "$WORK"
npx supabase functions deploy chat-with-data --project-ref "$PROJECT" --use-api

AFTER=$(api) || { echo "FATAL: deploy ran but version re-query failed"; exit 1; }
echo "Version after: $AFTER"
if [ "$AFTER" -le "$BEFORE" ]; then
  echo "DEPLOY FAILED: version did not bump ($BEFORE -> $AFTER)"
  exit 1
fi
echo "DEPLOY OK: chat-with-data v$AFTER at $SHA"
