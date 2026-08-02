#!/usr/bin/env bash
# Launcher for chrome-devtools-mcp, referenced by .mcp.json.
#
# WHY A WRAPPER instead of putting the flags straight in .mcp.json: there is no
# system Chrome on this host, only the Chromium that Playwright downloads, and
# its path contains a build number (chromium-1217) that changes every time
# Playwright is upgraded. Hard-coding that path into .mcp.json means the MCP
# server silently stops launching after an unrelated `npm update`, with no
# obvious link back to the cause. This resolves the newest available build at
# launch time and fails with a readable message if there is none.
set -euo pipefail

CHROME=$(ls -d /root/.cache/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -1)

if [ -z "${CHROME:-}" ] || [ ! -x "$CHROME" ]; then
  echo "FATAL: no Playwright Chromium found under /root/.cache/ms-playwright/." >&2
  echo "       Install one with:  npx playwright install chromium" >&2
  exit 1
fi

# --headless: no display on this server.
# --isolated: throwaway profile per run, so a crashed run cannot poison the next.
export CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1
exec npx -y chrome-devtools-mcp@1.6.0 \
  --headless \
  --isolated \
  --viewport 1366x768 \
  --executablePath "$CHROME" \
  "$@"
