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
# WHY IT OVERLAYS dist RATHER THAN REPLACING IT. The app is code-split:
# index.html loads assets/index-<hash>.js, which imports the rest lazily, by
# hashed filename, as the user navigates. Every build changes those names.
# Replacing dist therefore DELETED the chunks an already-loaded page still refers
# to, so anyone with the site open when a deploy landed got "Failed to fetch
# dynamically imported module" the next time they opened a route they had not
# visited yet — a dead panel, with nothing on screen to suggest reloading. The
# new tree is (previous tree) ∪ (new build): new files win, and files this build
# no longer produces are RETAINED so those pages keep resolving. Retaining them is
# safe by construction — /assets names are content hashes, so a retained name
# always means the identical bytes it always meant.
#
# Self-verifying: after the restart it asks the PUBLIC URL for the freshly built
# entry asset, for /, for a deep link, and for one asset RETAINED from the
# previous build, and exits non-zero unless each answers as public/serve.json
# declares. "DEPLOY OK" means a browser really got them.
set -euo pipefail

REPO=/home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai
PM2_APP=testing-2s-dashboard
PUBLIC_URL=https://testing-2s-dashboard.digitlab.ai
REF="${DEPLOY_REF:-HEAD}"

# An /assets file no deploy has produced for this long is dropped. Long enough to
# cover any plausible open tab, short enough that dist cannot grow without bound.
# RETAIN_DAYS=0 drops every stale asset, which is the old replace-the-tree
# behaviour if it is ever wanted — and says so out loud when it does it.
RETAIN_DAYS="${RETAIN_DAYS:-7}"
# How many dist.bak-* trees to keep. Each is now a superset of the build before
# it, so unbounded backups grow faster than they used to.
KEEP_BACKUPS="${KEEP_BACKUPS:-3}"

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
HAVE_BAK=0

fail() {
  echo "FATAL: $1" >&2
  if [ "$HAVE_BAK" = 1 ]; then
    echo "       The previous build is at dist.bak-$TS. To roll back:" >&2
    echo "         mv dist dist.failed-$TS && mv dist.bak-$TS dist && pm2 restart $PM2_APP" >&2
  fi
  exit 1
}

echo "--- stage: previous tree, then this build on top ---"
# Staged on the same filesystem as dist so going live is two renames, not a copy:
# the window in which nothing is served is a few milliseconds.
rm -rf "$REPO/dist-staging"
if [ -d "$REPO/dist" ]; then
  # -a, NOT -r. -r resets every mtime to now, which would make every carried-over
  # asset look freshly built and the age-based prune below would never remove
  # anything. With -a, an asset's mtime means "the last deploy that produced it".
  cp -a "$REPO/dist" "$REPO/dist-staging"
else
  echo "note: no live dist/ to carry over — this is a first deploy."
  mkdir -p "$REPO/dist-staging"
fi
cp -r "$WORK/dist/." "$REPO/dist-staging/"

# Prove the union was actually formed, BEFORE anything is deliberately dropped.
# Without this, losing the carry-over above would leave PRUNED and RETAINED both
# at zero, the probe below empty, and the deploy would report OK while doing
# exactly the thing this script was rewritten to stop doing.
if [ -d "$REPO/dist" ]; then
  NOT_CARRIED=$( cd "$REPO/dist" && find . -type f -print0 | while IFS= read -r -d '' rel; do
                   if [ ! -e "$REPO/dist-staging/${rel#./}" ]; then echo "  $rel"; fi
                 done )
  if [ -n "$NOT_CARRIED" ]; then
    echo "$NOT_CARRIED" >&2
    fail "staging is not a superset of the live tree (listed above) — the carry-over did not happen, so this would be a replace, not an overlay."
  fi
fi

# Only assets/ is pruned. Every top-level file (index.html, serve.json, the
# favicons, robots.txt) has a STABLE name, so the overlay above already replaced
# it and it cannot accumulate. assets/ is content-hashed and would grow forever.
PRUNED=0
RETAINED=0
if [ -d "$REPO/dist-staging/assets" ]; then
  while IFS= read -r -d '' f; do
    rel="${f#"$REPO/dist-staging/"}"
    # In this build: keep it, whatever its timestamp claims. The age test on its
    # own would be one clock skew away from deleting a live asset.
    if [ -e "$WORK/dist/$rel" ]; then continue; fi
    if [ -n "$(find "$f" -mmin "+$((RETAIN_DAYS * 1440))" -print)" ]; then
      rm -f "$f"
      echo "  pruned $rel"
      PRUNED=$((PRUNED + 1))
    else
      RETAINED=$((RETAINED + 1))
    fi
  done < <(find "$REPO/dist-staging/assets" -type f -print0)
fi
echo "carried over $RETAINED asset(s) from earlier builds, pruned $PRUNED older than ${RETAIN_DAYS}d"

# One retained-but-stale asset, picked AFTER pruning so it is a file that really is
# still there. Curled after the restart, this is the only check that proves a
# mid-session page's lazy chunks survived the deploy.
OVERLAY_PROBE=""
if [ "$RETAINED" -gt 0 ]; then
  while IFS= read -r -d '' f; do
    rel="${f#"$REPO/dist-staging/"}"
    if [ ! -e "$WORK/dist/$rel" ]; then OVERLAY_PROBE="$rel"; break; fi
  done < <(find "$REPO/dist-staging/assets" -type f -name '*.js' -print0)
fi

echo "--- go live ---"
if [ -d "$REPO/dist" ]; then
  mv "$REPO/dist" "$REPO/dist.bak-$TS"
  HAVE_BAK=1
  echo "previous build kept as dist.bak-$TS"
fi
mv "$REPO/dist-staging" "$REPO/dist"

# The prune is the only thing in this script that deletes from the tree being
# shipped, and the public-URL checks below only look at four files. So compare the
# whole built tree against what is live: if the prune ever removes something this
# build produced, the deploy fails here instead of on a user's screen.
MISSING=$( cd "$WORK/dist" && find . -type f -print0 | while IFS= read -r -d '' rel; do
             if [ ! -e "$REPO/dist/${rel#./}" ]; then echo "  $rel"; fi
           done )
if [ -n "$MISSING" ]; then
  echo "$MISSING" >&2
  fail "files this build produced are missing from the live dist (listed above)."
fi
echo "all $(find "$WORK/dist" -type f | wc -l) built file(s) are live, alongside $RETAINED retained"

echo "--- restart (serve re-reads serve.json here, and only here) ---"
pm2 restart "$PM2_APP" --update-env

echo "--- verify against the public URL ---"
# READINESS, not a check. `pm2 restart` returns as soon as it has respawned the
# process, before `serve` has bound 3007 — so nginx has nothing behind it for a
# moment and answers 502. That is expected, every single deploy.
#
# `curl -fs` here, NOT `-fsS`. With -S curl printed
#   curl: (22) The requested URL returned error: 502
# on the first attempt of a completely successful deploy, immediately above
# "DEPLOY OK". It was raised as a suspected failure more than once. A scary line in
# a green run is not free: it teaches whoever reads this output to skim it, which
# is the opposite of what a self-verifying script is for. Nothing is lost by
# silencing it — if the site never comes up, the four real assertions below fail
# with a message that says which one and why.
for attempt in $(seq 1 20); do
  if curl -fs -o /dev/null "$PUBLIC_URL/"; then break; fi
  sleep 0.5
done

# The freshly built asset must be the one being served, or the swap did not land.
ASSET_HEADERS=$(curl -fsSI "$PUBLIC_URL$NEW_ASSET") || fail "the new entry asset $NEW_ASSET is not being served"
grep -qi 'immutable' <<<"$ASSET_HEADERS" || fail "$NEW_ASSET has no immutable Cache-Control; serve did not pick up serve.json"
grep -qi 'max-age=31536000' <<<"$ASSET_HEADERS" || fail "$NEW_ASSET has the wrong max-age"

INDEX_HEADERS=$(curl -fsSI "$PUBLIC_URL/") || fail "/ did not respond"
grep -qi 'cache-control: *no-cache' <<<"$INDEX_HEADERS" || fail "/ is missing 'Cache-Control: no-cache'; a cached index.html keeps loading the previous deploy's assets"
grep -qi 'content-security-policy:.*frame-ancestors' <<<"$INDEX_HEADERS" \
  || fail "/ is missing the Content-Security-Policy header; browsers ignore frame-ancestors in <meta>, so without this header the app ships no effective clickjacking CSP"

# --single must still rewrite unknown paths to index.html. serve APPENDS its
# rewrite to the config rather than replacing it, but a future serve.json that
# defines `rewrites` could shadow that, and the symptom would be 404s on every
# deep link — not something to discover from a user report.
DEEP=$(curl -fsSI "$PUBLIC_URL/dashboard/hotel-training") || fail "a deep link 404s; --single is no longer rewriting to index.html"
grep -qi 'content-type: *text/html' <<<"$DEEP" || fail "a deep link is not returning HTML"

# The whole point of the overlay. Without this line the retention could silently
# stop working and the only symptom would be a user's dead panel.
OVERLAY_NOTE="no asset from the previous build was absent from this one, so nothing needed retaining"
if [ -n "$OVERLAY_PROBE" ]; then
  curl -fsS -o /dev/null "$PUBLIC_URL/$OVERLAY_PROBE" \
    || fail "$OVERLAY_PROBE was retained on disk but is not being served — anyone with the site open will hit a failed lazy import"
  OVERLAY_NOTE="previous build's $OVERLAY_PROBE still served"
elif [ "$PRUNED" -gt 0 ]; then
  # Distinct from "there was nothing to retain", and said loudly: this is the one
  # outcome where a mid-session page WILL break, and it is a configured choice.
  OVERLAY_NOTE="RETAIN_DAYS=$RETAIN_DAYS pruned every stale asset — pages loaded before this deploy WILL fail on a lazy import"
fi

echo "DEPLOY OK — $NEW_ASSET immutable, / no-cache + CSP header (frame-ancestors), deep links rewrite, $OVERLAY_NOTE."

# Housekeeping, last: only the dist.bak-* trees THIS script creates. dist.old-*,
# dist-test and anything else were made by hand or by PW_BUILD, and deleting a
# directory someone else made is not this script's business.
while IFS= read -r old; do
  [ -n "$old" ] || continue
  rm -rf "$old"
  echo "removed old backup $(basename "$old")"
done < <(ls -1d "$REPO"/dist.bak-* 2>/dev/null | sort -r | tail -n "+$((KEEP_BACKUPS + 1))")
