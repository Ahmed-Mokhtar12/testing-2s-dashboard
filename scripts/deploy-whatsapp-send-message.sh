#!/usr/bin/env bash
# Deploy the whatsapp-send-message edge function from a git-archive-pinned
# scratch workdir.
#
# Usage:
#   SUPABASE_ACCESS_TOKEN=<token> bash scripts/deploy-whatsapp-send-message.sh
#   SUPABASE_ACCESS_TOKEN=<token> DEPLOY_REF=<ref> bash scripts/deploy-whatsapp-send-message.sh
#
# WHY ITS OWN SCRIPT AND NOT A deploy-sp-function.sh ENTRY: that script's
# allowlist is "identical to deploy" SharePoint functions sharing _shared/graph
# and _shared/mirror; this function shares none of that and carries its own
# post-deploy checks (below). Same self-verifying skeleton, different notes.
#
# verify_jwt = true matches the LIVE gateway setting (supabase/config.toml:54-55
# and the platform). The function ALSO re-verifies the JWT and — since the R2
# hardening — requires is_hotel_staff(auth.uid()) and a signed
# whatsapp-attachments URL for any attachment. Do not flip verify_jwt: the
# gateway 401 is what lets an invalid-JWT smoke test exercise URL/body/headers
# without any chance of a real send.
#
# Self-verifying: reads the function version before and after and exits
# non-zero unless it actually bumped. A printed "DEPLOY OK" is proof the
# platform accepted a new version — nothing less.
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN must be set}"
REPO=/home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai
PROJECT=yczcebfaqerlwfalrbjn
FUNCTION=whatsapp-send-message
REF="${DEPLOY_REF:-HEAD}"

cd "$REPO"
SHA=$(git rev-parse "$REF")
echo "Deploying $FUNCTION at ref: $SHA"

# git archive reads the COMMIT, so uncommitted edits would be invisibly excluded
# and the operator would believe they shipped them.
if ! git diff --quiet HEAD -- "supabase/functions/$FUNCTION" supabase/functions/_shared; then
  echo "FATAL: uncommitted changes exist under the directories this deploys." >&2
  echo "       git archive reads the commit, not the working tree, so those edits" >&2
  echo "       would NOT be deployed. Commit them first, or pass DEPLOY_REF." >&2
  git status --short -- "supabase/functions/$FUNCTION" supabase/functions/_shared >&2
  exit 1
fi

# Returns the deployed version number, or exits non-zero with NOTHING on stdout.
api() {
  local response status body
  response=$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/$PROJECT/functions/$1") || return 1
  status=$(printf '%s' "$response" | tail -n1)
  body=$(printf '%s' "$response" | sed '$d')

  if [ "$status" = "404" ]; then
    echo "0"
    return 0
  fi
  if [ "$status" != "200" ]; then
    return 1
  fi

  printf '%s' "$body" | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin)["version"])
except Exception:
    sys.exit(1)' || return 1
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Repo config.toml fails CLI parse; build a minimal one in a scratch workdir so
# working-tree edits can never leak into a deploy.
git archive "$SHA" \
  "supabase/functions/$FUNCTION" \
  supabase/functions/_shared | tar -x -C "$WORK"
mkdir -p "$WORK/supabase"
cat > "$WORK/supabase/config.toml" <<EOF
project_id = "$PROJECT"

[functions.$FUNCTION]
verify_jwt = true
EOF
find "$WORK/supabase/functions" -name '*-old.ts' -delete
find "$WORK/supabase/functions" -name '*.test.ts' -delete

# Resolve every relative import transitively from the entrypoint and fail if any
# target is missing FROM THE ARCHIVE (the artifact being uploaded, which is the
# one that can silently be wrong here).
python3 - "$WORK" "supabase/functions/$FUNCTION/index.ts" <<'PY'
import os, re, sys
work, entry = sys.argv[1], sys.argv[2]
pattern = re.compile(r"""(?:from|import)\s+['"](\.[^'"]+)['"]""")
seen, todo, missing = set(), [entry], []
while todo:
    rel = todo.pop()
    if rel in seen:
        continue
    seen.add(rel)
    path = os.path.join(work, rel)
    if not os.path.isfile(path):
        missing.append(rel)
        continue
    with open(path, encoding='utf-8') as handle:
        for spec in pattern.findall(handle.read()):
            todo.append(os.path.normpath(os.path.join(os.path.dirname(rel), spec)))
if missing:
    print("FATAL: missing from the archive — nothing was deployed:", file=sys.stderr)
    for rel in sorted(missing):
        print("  " + rel, file=sys.stderr)
    sys.exit(1)
print(f"archive resolves {len(seen)} module(s) from the entrypoint")
PY

BEFORE=$(api "$FUNCTION") || {
  echo "FATAL: could not read the current $FUNCTION version from the management API." >&2
  echo "       Almost always a bad or expired SUPABASE_ACCESS_TOKEN. Nothing was deployed." >&2
  exit 1
}
echo "Version before: $BEFORE"

( cd "$WORK" && npx supabase functions deploy "$FUNCTION" --project-ref "$PROJECT" --use-api )

AFTER=$(api "$FUNCTION") || { echo "FATAL: deploy ran but version re-query failed" >&2; exit 1; }
echo "Version after: $AFTER"
if [ "$AFTER" -le "$BEFORE" ]; then
  echo "DEPLOY FAILED: $FUNCTION version did not bump ($BEFORE -> $AFTER)" >&2
  exit 1
fi
echo "DEPLOY OK: $FUNCTION v$AFTER at $SHA"
echo ""
echo "WHAT TO CHECK NEXT, because a version bump proves only that the platform"
echo "accepted the code:"
echo "  1. Invalid-JWT smoke test (no send possible — the gateway 401s first):"
echo "       curl -s -o /dev/null -w '%{http_code}\n' \\"
echo "         -H 'Authorization: Bearer invalid' -H 'Content-Type: application/json' \\"
echo "         -d '{\"recipientNumber\":\"971000000000\",\"message\":\"x\"}' \\"
echo "         https://$PROJECT.supabase.co/functions/v1/$FUNCTION"
echo "     Expect 401."
echo "  2. From the operator's own STAFF session: a Human-mode text send to a"
echo "     designated test number still succeeds (role gate lets staff through)."
echo "  3. Attachment allowlist: a send whose attachment.url is NOT a signed"
echo "     whatsapp-attachments URL must return 400, and an upload made through"
echo "     the UI (signed URL) must still send."
