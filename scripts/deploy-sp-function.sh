#!/usr/bin/env bash
# Deploy one (or all) of the SharePoint read/manage edge functions from a
# git-archive-pinned scratch workdir.
#
# Usage:
#   SUPABASE_ACCESS_TOKEN=<token> bash scripts/deploy-sp-function.sh sp-read-trainers
#   SUPABASE_ACCESS_TOKEN=<token> bash scripts/deploy-sp-function.sh --all
#   SUPABASE_ACCESS_TOKEN=<token> DEPLOY_REF=<ref> bash scripts/deploy-sp-function.sh --all
#
# WHY ONE SCRIPT AND NOT FOUR. These four are identical to deploy: same project,
# same verify_jwt, same _shared dependency set, same version check. The existing
# per-function scripts (chat-with-data, training-report, sp-submit-training) each
# carry function-specific notes worth keeping separate; these do not. Four copies
# of the same 120 lines would drift, and the drift would be invisible until a
# deploy silently skipped a file.
#
# WHY THEY ALL NEED DEPLOYING TOGETHER RIGHT NOW: all four import
# _shared/graph.ts (the app-token cache) and _shared/mirror.ts (the Postgres
# mirror write-through). A partial deploy is not broken, but it is confusing —
# half the functions would populate the mirror and half would not, so the page
# would be fast for some datasets and slow for others with no pattern to it.
#
# verify_jwt = true matches the LIVE gateway setting for all four, confirmed
# against list_edge_functions before this script was written. Do not change it
# casually: each function calls getCallerEmail(req) and returns 401 without a
# caller, so flipping it to false would move the authentication boundary from the
# gateway into the function for no benefit.
#
# Self-verifying: reads each function's version before and after and exits
# non-zero unless it actually bumped. A printed "DEPLOY OK" is proof the platform
# accepted a new version — nothing less.
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN must be set}"
REPO=/home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai
PROJECT=yczcebfaqerlwfalrbjn
REF="${DEPLOY_REF:-HEAD}"

ALL_FUNCTIONS=(sp-read-colleagues sp-read-columns sp-read-trainers sp-manage-colleague sp-search-directory)

usage() {
  echo "Usage: SUPABASE_ACCESS_TOKEN=<token> bash scripts/deploy-sp-function.sh <function|--all>" >&2
  echo "  functions: ${ALL_FUNCTIONS[*]}" >&2
  exit 2
}

[ $# -eq 1 ] || usage

if [ "$1" = "--all" ]; then
  TARGETS=("${ALL_FUNCTIONS[@]}")
else
  TARGETS=("$1")
  # An unrecognised name would otherwise CREATE a new function on the platform.
  printf '%s\n' "${ALL_FUNCTIONS[@]}" | grep -qx -- "$1" || usage
fi

cd "$REPO"
SHA=$(git rev-parse "$REF")
echo "Deploying ${TARGETS[*]} at ref: $SHA"

# git archive reads the COMMIT, so uncommitted edits would be invisibly excluded
# and the operator would believe they shipped them.
DIRTY_PATHS=(supabase/functions/_shared)
for fn in "${TARGETS[@]}"; do DIRTY_PATHS+=("supabase/functions/$fn"); done
if ! git diff --quiet HEAD -- "${DIRTY_PATHS[@]}"; then
  echo "FATAL: uncommitted changes exist under the directories this deploys." >&2
  echo "       git archive reads the commit, not the working tree, so those edits" >&2
  echo "       would NOT be deployed. Commit them first, or pass DEPLOY_REF." >&2
  git status --short -- "${DIRTY_PATHS[@]}" >&2
  exit 1
fi

# Returns the deployed version number for $1, or exits non-zero with NOTHING on
# stdout. The guarded python is deliberate: piping a failed `curl -sf` straight
# into json.load prints a traceback and buries the actual cause ("your token is
# wrong") underneath it.
api() {
  # HTTP status is captured separately from the body, because 404 and 401 must be
  # told apart. A NEW function has no version yet — that is not an error, it is
  # version 0 — whereas a bad token must still be fatal. `curl -sf` collapses both
  # into "failed", which made this script unable to create a function at all: the
  # first sp-search-directory deploy died on its own pre-flight check.
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

deploy_one() {
  local FUNCTION="$1"
  echo ""
  echo "=== $FUNCTION ==="

  local WORK
  WORK=$(mktemp -d)
  # Not a global trap: --all creates one workdir per function.
  trap 'rm -rf "$WORK"' RETURN

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
  # target is missing FROM THE ARCHIVE. tests/unit/edge-imports-resolve.test.ts
  # proves the same thing about the working tree; this proves it about the bytes
  # being uploaded, which is a different artifact and the one that can be wrong
  # here — a git-archive path that misses a directory produces exactly this.
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

  local BEFORE AFTER
  BEFORE=$(api "$FUNCTION") || {
    echo "FATAL: could not read the current $FUNCTION version from the management API." >&2
    echo "       Almost always a bad or expired SUPABASE_ACCESS_TOKEN. Nothing was deployed." >&2
    return 1
  }
  echo "Version before: $BEFORE"

  ( cd "$WORK" && npx supabase functions deploy "$FUNCTION" --project-ref "$PROJECT" --use-api )

  AFTER=$(api "$FUNCTION") || { echo "FATAL: deploy ran but version re-query failed" >&2; return 1; }
  echo "Version after: $AFTER"
  if [ "$AFTER" -le "$BEFORE" ]; then
    echo "DEPLOY FAILED: $FUNCTION version did not bump ($BEFORE -> $AFTER)" >&2
    return 1
  fi
  echo "DEPLOY OK: $FUNCTION v$AFTER at $SHA"
}

for fn in "${TARGETS[@]}"; do
  deploy_one "$fn"
done

echo ""
echo "ALL DEPLOYS OK: ${TARGETS[*]} at $SHA"
echo ""
echo "WHAT TO CHECK NEXT, because a version bump proves only that the platform"
echo "accepted the code:"
echo "  1. Load /dashboard/hotel-training once. That populates the mirror."
echo "  2. Then:  select key, jsonb_array_length(payload), fetched_at"
echo "              from public.sharepoint_mirror;"
echo "     Three rows means the write-through works. Fewer means a mirror write"
echo "     failed, and _shared/mirror.ts swallows its own errors on purpose — the"
echo "     reason is in the function logs, not in the response."
echo "  3. Reload. The three sp-read-* calls should NOT appear in the logs at all;"
echo "     the page is reading Postgres instead."
echo "  4. Add a member in Manage Members, then re-run the query above. The"
echo "     'colleagues' row must be GONE — sp-manage-colleague invalidates it so"
echo "     the new member is not hidden behind a stale mirror."
echo "  5. Open the trainer picker, type three letters of someone NOT in the list,"
echo "     and click 'Search the full Microsoft directory'. Results prove"
echo "     sp-search-directory works and that Graph accepted the search with"
echo "     ConsistencyLevel: eventual. Anyone marked 'not on the site yet' is"
echo "     CORRECT and expected until the SharePoint consent lands — recording them"
echo "     needs sp-submit-training redeployed, which is deliberately not in this set."
