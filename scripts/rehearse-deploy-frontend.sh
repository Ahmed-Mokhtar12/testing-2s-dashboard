#!/usr/bin/env bash
# Rehearse scripts/deploy-frontend.sh against a sandbox, and prove its own checks
# can fail. Run by tests/unit/deploy-frontend-overlay.test.ts, so `npm run
# test:unit` fails if the overlay stops working.
#
# WHY THIS EXISTS. deploy-frontend.sh cannot be exercised any other way: running it
# is a deploy. Its most consequential logic — carrying assets from the previous
# build forward so a mid-session page's lazy imports keep resolving — has no unit
# under it and no e2e coverage, and its failure mode is invisible from the server
# (the deploy succeeds; a user's panel dies the next time they change route).
#
# HOW. The real script is copied with ONLY its three constants substituted, and the
# rehearsal REFUSES TO RUN unless each substitution is verified present — a rename
# of `REPO=` must fail here, never silently rehearse against the live site. npm,
# pm2 and curl are shimmed on PATH. Every line of the staging, union-check, prune,
# probe and completeness logic runs verbatim.
#
# Usage: bash scripts/rehearse-deploy-frontend.sh [mutation]
#   none                     the deploy succeeds and does the right thing
#   no-overlay               drops the carry-over        -> union check must fail
#   prune-deletes-everything prune eats live files       -> completeness must fail
#   probe-file-unserved      retained asset 404s         -> probe must fail
#   prune-ignores-current    expected INERT — see below
#
# prune-ignores-current removes the "in this build, so keep it" guard from the
# prune. It is expected NOT to fail, and asserting that is the point: the overlay
# copies this build over the carried-over tree first, refreshing the mtime of every
# asset the build produced, so the age test alone already protects them. The guard
# is defence in depth against a future change to that copy, not a live check. If
# this mutation ever starts failing, the guard has become load-bearing and the
# comment on it is out of date.
set -uo pipefail

REAL_REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MUTATION="${1:-none}"
SANDBOX=$(mktemp -d)
REPO="$SANDBOX/repo"
BIN="$SANDBOX/bin"
mkdir -p "$REPO" "$BIN"

fail() { echo "REHEARSAL FAIL: $*" >&2; exit 1; }
ok()   { echo "  ok: $*"; }

# ---------------------------------------------------------------- fake repo
mkdir -p "$REPO/src" "$REPO/public" "$REPO/node_modules"
echo 'console.log(1)'          > "$REPO/src/main.js"
echo '{"headers":[]}'          > "$REPO/public/serve.json"
echo '<!doctype html>'         > "$REPO/index.html"
echo 'export default {}'       > "$REPO/vite.config.ts"
echo '{"name":"x"}'            > "$REPO/package.json"
echo '{"lockfileVersion":3}'   > "$REPO/package-lock.json"
git -C "$REPO" init -q
git -C "$REPO" config user.email r@e.h && git -C "$REPO" config user.name reh
git -C "$REPO" add -A && git -C "$REPO" commit -qm init

# ------------------------------------------------- the currently-live dist
# index-OLD   the old entry, superseded by this build            -> retained
# Recent-OLD  a lazy chunk this build no longer produces         -> retained
# Ancient-OLD the same, but no deploy has produced it for 30 days-> pruned
# shared-KEEP also produced by this build, backdated 30 days     -> KEPT anyway
mkdir -p "$REPO/dist/assets"
echo '<script src="/assets/index-OLD.js">' > "$REPO/dist/index.html"
echo '{"headers":[]}'                      > "$REPO/dist/serve.json"
echo 'favicon'                             > "$REPO/dist/favicon.ico"
for f in index-OLD Recent-OLD Ancient-OLD shared-KEEP; do
  echo "old $f" > "$REPO/dist/assets/$f.js"
done
touch -d '30 days ago' "$REPO/dist/assets/Ancient-OLD.js" "$REPO/dist/assets/shared-KEEP.js"

mkdir -p "$REPO/dist.bak-20250101-000000" "$REPO/dist.bak-20250202-000000" \
         "$REPO/dist.bak-20250303-000000" "$REPO/dist.bak-20250404-000000" \
         "$REPO/dist.old-19990101-000000"

# ------------------------------------------------------------------- shims
cat > "$BIN/npm" <<'EOF'
#!/usr/bin/env bash
[ "${1:-}" = run ] && [ "${2:-}" = build ] || { echo "npm $*"; exit 0; }
mkdir -p dist/assets
echo '<script src="/assets/index-NEW.js">' > dist/index.html
echo '{"headers":[]}'                      > dist/serve.json
echo 'favicon'                             > dist/favicon.ico
echo 'new entry'                           > dist/assets/index-NEW.js
echo 'new lazy'                            > dist/assets/Fresh-NEW.js
echo 'old shared-KEEP'                     > dist/assets/shared-KEEP.js
echo "[fake build] wrote dist/"
EOF

cat > "$BIN/pm2" <<'EOF'
#!/usr/bin/env bash
echo "[fake pm2] $*"
EOF

# Answers from the sandbox's live dist with the headers public/serve.json declares,
# including serve's --single rewrite, so the deploy's four public-URL checks are
# exercised rather than stubbed out.
cat > "$BIN/curl" <<EOF
#!/usr/bin/env bash
DIST="$REPO/dist"
UNSERVED="\${REHEARSE_UNSERVED:-}"
HEAD=0; URL=""
for a in "\$@"; do
  case "\$a" in
    http*) URL="\$a" ;;
    -*I*)  HEAD=1 ;;
  esac
done
P="\${URL#https://rehearse.invalid}"
[ "\$P" = "" ] && P=/
if [ -n "\$UNSERVED" ] && [ "\$P" = "/\$UNSERVED" ]; then exit 22; fi
if [ "\$P" = "/" ]; then
  F="\$DIST/index.html"; CC="no-cache"; CT="text/html"
elif [ -f "\$DIST\$P" ]; then
  F="\$DIST\$P"; CT="application/javascript"
  case "\$P" in /assets/*) CC="public, max-age=31536000, immutable" ;; *) CC="no-cache" ;; esac
else
  case "\${P##*/}" in
    *.*) exit 22 ;;                                                # a missing file
    *)   F="\$DIST/index.html"; CC="no-cache"; CT="text/html" ;;   # --single rewrite
  esac
fi
[ -f "\$F" ] || exit 22
if [ "\$HEAD" = 1 ]; then
  printf 'HTTP/1.1 200 OK\r\nContent-Type: %s\r\nCache-Control: %s\r\n\r\n' "\$CT" "\$CC"
fi
exit 0
EOF
chmod +x "$BIN"/*

# ----------------------------------------------- the script, constants only
SCRIPT="$SANDBOX/deploy-frontend.sh"
sed -e "s#^REPO=.*#REPO=$REPO#" \
    -e "s#^PUBLIC_URL=.*#PUBLIC_URL=https://rehearse.invalid#" \
    -e "s#^PM2_APP=.*#PM2_APP=rehearsal-no-such-app#" \
    "$REAL_REPO/scripts/deploy-frontend.sh" > "$SCRIPT"
# Non-negotiable: an unsubstituted constant means this would touch the live site.
grep -q "^REPO=$REPO\$" "$SCRIPT" || fail "REPO substitution missed — refusing to run"
grep -q "^PUBLIC_URL=https://rehearse.invalid\$" "$SCRIPT" || fail "PUBLIC_URL substitution missed — refusing to run"
grep -q "^PM2_APP=rehearsal-no-such-app\$" "$SCRIPT" || fail "PM2_APP substitution missed — refusing to run"

case "$MUTATION" in
  none) ;;
  no-overlay)
    sed -i 's#^  cp -a "\$REPO/dist" "\$REPO/dist-staging"#  mkdir -p "$REPO/dist-staging"#' "$SCRIPT"
    grep -q 'cp -a "\$REPO/dist"' "$SCRIPT" && fail "mutation no-overlay did not apply" ;;
  prune-ignores-current)
    sed -i 's#^    if \[ -e "\$WORK/dist/\$rel" \]; then continue; fi##' "$SCRIPT"
    grep -q 'if \[ -e "\$WORK/dist/\$rel" \]; then continue; fi' "$SCRIPT" \
      && fail "mutation prune-ignores-current did not apply" ;;
  prune-deletes-everything)
    sed -i 's#^    if \[ -e "\$WORK/dist/\$rel" \]; then continue; fi##' "$SCRIPT"
    sed -i 's#^    if \[ -n "\$(find "\$f" -mmin "+\$((RETAIN_DAYS \* 1440))" -print)" \]; then#    if true; then#' "$SCRIPT"
    grep -q '^    if true; then' "$SCRIPT" || fail "mutation prune-deletes-everything did not apply" ;;
  probe-file-unserved) export REHEARSE_UNSERVED=assets/Recent-OLD.js ;;
  *) fail "unknown mutation $MUTATION" ;;
esac
bash -n "$SCRIPT" || fail "the script does not parse"

# ------------------------------------------------------------------- run it
echo "=== rehearsal: mutation=$MUTATION ==="
( cd "$REPO" && PATH="$BIN:$PATH" bash "$SCRIPT" ) > "$SANDBOX/out.txt" 2>&1
STATUS=$?
sed 's/^/    | /' "$SANDBOX/out.txt"
echo "=== exit status: $STATUS ==="

# ------------------------------------------------------------- assertions
if [ "$MUTATION" = prune-ignores-current ]; then
  [ "$STATUS" -eq 0 ] || fail "expected inert, but the script failed: see above"
  for keep in index-NEW.js Fresh-NEW.js shared-KEEP.js; do
    [ -f "$REPO/dist/assets/$keep" ] || fail "the inert mutation still lost $keep"
  done
  ok "inert AND lost nothing — the guard is redundant, as its comment claims"
  rm -rf "$SANDBOX"; echo "REHEARSAL PASS ($MUTATION, inert by design)"; exit 0
fi

if [ "$MUTATION" != none ]; then
  [ "$STATUS" -ne 0 ] || fail "mutation '$MUTATION' was NOT caught — the script reported success"
  grep -q 'FATAL' "$SANDBOX/out.txt" || fail "mutation '$MUTATION' failed without a FATAL explanation"
  ok "caught, exit $STATUS"
  rm -rf "$SANDBOX"; echo "REHEARSAL PASS ($MUTATION)"; exit 0
fi

[ "$STATUS" -eq 0 ] || fail "clean rehearsal exited $STATUS"
D="$REPO/dist"
grep -q 'index-NEW' "$D/index.html" || fail "index.html is not the new one"
ok "index.html replaced by this build"
for keep in index-NEW.js Fresh-NEW.js shared-KEEP.js; do
  [ -f "$D/assets/$keep" ] || fail "this build's $keep is missing"
done
ok "every asset this build produced is live"
for carried in index-OLD.js Recent-OLD.js; do
  [ -f "$D/assets/$carried" ] || fail "$carried was NOT carried over — a mid-session page would break"
done
ok "previous build's index-OLD.js and Recent-OLD.js carried over"
[ ! -f "$D/assets/Ancient-OLD.js" ] || fail "Ancient-OLD.js (30d) should have been pruned"
ok "Ancient-OLD.js pruned at 30 days"
grep pruned "$SANDBOX/out.txt" | grep -q 'shared-KEEP' \
  && fail "shared-KEEP.js was pruned despite being in this build"
grep -q 'old shared-KEEP' "$D/assets/shared-KEEP.js" \
  || fail "shared-KEEP.js was not overwritten by this build's copy"
ok "shared-KEEP.js kept and refreshed despite a 30-day mtime"
grep -q "previous build's assets/.*still served" "$SANDBOX/out.txt" \
  || fail "the deploy did not prove a retained asset is served"
ok "DEPLOY OK asserted a retained asset is actually served"
[ ! -d "$REPO/dist-staging" ] || fail "dist-staging left behind"
ok "no dist-staging left behind"
BAKS=$(ls -1d "$REPO"/dist.bak-* | wc -l)
[ "$BAKS" -eq 3 ] || fail "expected 3 dist.bak-* kept, found $BAKS"
ls -1d "$REPO"/dist.bak-* | grep -qv 'dist.bak-2025' || fail "this deploy's own backup was not kept"
ok "3 dist.bak-* kept, including this deploy's"
[ -d "$REPO/dist.old-19990101-000000" ] || fail "dist.old-* was deleted; not this script's business"
ok "dist.old-* left alone"

rm -rf "$SANDBOX"
echo "REHEARSAL PASS (clean)"
