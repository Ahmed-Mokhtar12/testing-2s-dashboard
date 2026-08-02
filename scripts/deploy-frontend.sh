#!/usr/bin/env bash
# Build the frontend from git and put it live behind nginx.
# Usage: [DEPLOY_REF=<ref>] bash scripts/deploy-frontend.sh
#
# WHAT SERVES THE SITE. nginx does not serve these files. It proxies
# testing-2s-dashboard.digitlab.ai to http://127.0.0.1:3007/, which is
# `serve dist -l 3007 -s` running under PM2 as the app `testing-2s-dashboard`.
# That is why the cache headers live in public/serve.json (copied by Vite into
# dist/) and not in the nginx vhost, and it is why this script restarts PM2:
#
#   *** `serve` READS serve.json ONCE AT STARTUP. ***
#
# Swapping dist alone changes the files served but NOT the headers. A deploy that
# skips the restart looks completely successful and silently keeps the old cache
# policy. That is the single trap this script exists to close.
#
# WHY IT BUILDS FROM GIT, like the edge-function deploy scripts: what goes live is
# then exactly what was committed and tested, and an uncommitted experiment cannot
# reach users because someone happened to run a build.
#
# Self-verifying: after the restart it asks the PUBLIC URL for the freshly built
# entry asset and for /, and exits non-zero unless the headers are the ones
# public/serve.json declares. "DEPLOY OK" means a browser really got them.
set -euo pipefail

REPO=/home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai
PM2_APP=testing-2s-dashboard
PUBLIC_URL=https://testing-2s-dashboard.digitlab.ai
REF="${DEPLOY_REF:-HEAD}"

cd "$REPO"
SHA=$(git rev-parse "$REF")
echo "Deploying frontend at ref: $SHA"

# git archive reads the COMMIT. Uncommitted edits would be invisibly excluded and
# the operator would believe they shipped them.
if ! git diff --quiet HEAD -- src public index.html vite.config.ts package.json; then
  echo "FATAL: uncommitted changes exist under the directories this builds from." >&2
  echo "       This builds the commit, not the working tree, so those edits would" >&2
  echo "       NOT go live. Commit them first, or pass DEPLOY_REF." >&2
  git status --short -- src public index.html vite.config.ts package.json >&2
  exit 1
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

git archive "$SHA" | tar -x -C "$WORK"
# node_modules is not in git and a fresh install per deploy is minutes of work for
# no benefit: the lockfile is part of the archive and is checked below.
ln -s "$REPO/node_modules" "$WORK/node_modules"

if ! diff -q "$REPO/package-lock.json" "$WORK/package-lock.json" >/dev/null 2>&1; then
  echo "FATAL: package-lock.json at $REF differs from the working tree's." >&2
  echo "       The linked node_modules would not match what this ref expects." >&2
  echo "       Run 'npm ci' in the repo first, then re-run this script." >&2
  exit 1
fi

echo "--- build (typecheck runs first) ---"
( cd "$WORK" && npm run build )

# The whole point of the restart. If Vite stopped copying public/ this would ship
# a dist with no cache policy and the verification below would be the only hint.
test -f "$WORK/dist/serve.json" || { echo "FATAL: dist/serve.json missing after build." >&2; exit 1; }

NEW_ASSET=$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' "$WORK/dist/index.html" | head -1)
test -n "$NEW_ASSET" || { echo "FATAL: could not find the entry asset in the built index.html." >&2; exit 1; }
echo "built entry asset: $NEW_ASSET"

TS=$(date +%Y%m%d-%H%M%S)
echo "--- swap ---"
# Stage on the same filesystem as dist so the swap is two renames, not a copy:
# the window in which nothing is served is a few milliseconds.
rm -rf "$REPO/dist-staging"
cp -r "$WORK/dist" "$REPO/dist-staging"
mv "$REPO/dist" "$REPO/dist.bak-$TS"
mv "$REPO/dist-staging" "$REPO/dist"
echo "previous build kept as dist.bak-$TS"

echo "--- restart (serve re-reads serve.json here, and only here) ---"
pm2 restart "$PM2_APP" --update-env

echo "--- verify against the public URL ---"
for attempt in $(seq 1 20); do
  if curl -fsS -o /dev/null "$PUBLIC_URL/"; then break; fi
  sleep 0.5
done

fail() {
  echo "FATAL: $1" >&2
  echo "       The previous build is at dist.bak-$TS. To roll back:" >&2
  echo "         mv dist dist.failed-$TS && mv dist.bak-$TS dist && pm2 restart $PM2_APP" >&2
  exit 1
}

# The freshly built asset must be the one being served, or the swap did not land.
ASSET_HEADERS=$(curl -fsSI "$PUBLIC_URL$NEW_ASSET") || fail "the new entry asset $NEW_ASSET is not being served"
grep -qi 'immutable' <<<"$ASSET_HEADERS" || fail "$NEW_ASSET has no immutable Cache-Control; serve did not pick up serve.json"
grep -qi 'max-age=31536000' <<<"$ASSET_HEADERS" || fail "$NEW_ASSET has the wrong max-age"

INDEX_HEADERS=$(curl -fsSI "$PUBLIC_URL/") || fail "/ did not respond"
grep -qi 'cache-control: *no-cache' <<<"$INDEX_HEADERS" || fail "/ is missing 'Cache-Control: no-cache'; a cached index.html keeps loading the previous deploy's assets"

# --single must still rewrite unknown paths to index.html. serve APPENDS its
# rewrite to the config rather than replacing it, but a future serve.json that
# defines `rewrites` could shadow that, and the symptom would be 404s on every
# deep link — not something to discover from a user report.
DEEP=$(curl -fsSI "$PUBLIC_URL/dashboard/hotel-training") || fail "a deep link 404s; --single is no longer rewriting to index.html"
grep -qi 'content-type: *text/html' <<<"$DEEP" || fail "a deep link is not returning HTML"

echo "DEPLOY OK — $NEW_ASSET immutable, / no-cache, deep links still rewrite."
