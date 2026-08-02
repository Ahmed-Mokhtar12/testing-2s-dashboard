import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// PW_BUILD=1 runs the whole suite against a PRODUCTION BUILD served the way
// production serves it, instead of against `vite dev`.
//
// WHY IT EXISTS. Until this was added, nothing anywhere ran the built app. The
// suite talked to the dev server, which does not bundle, does not apply
// build.rollupOptions.manualChunks, and does not read public/serve.json. So an
// entire class of failure was invisible: a cross-chunk circular import surfaces as
// "Cannot access '<X>' before initialization" in the built app ONLY, and a broken
// serve.json stops `serve` booting at all. Both would have reported green.
//
//   PW_BUILD=1 npx playwright test
//
// It builds to dist-test/, NOT dist/ — dist/ is the live directory PM2 serves, and
// a test run must never redeploy the site as a side effect. `serve -s` matches the
// PM2 command line, so the SPA rewrite and the cache headers are exercised too.
//
// reuseExistingServer is false in this mode regardless of CI: reusing a dev server
// left on this port would silently test the thing this mode exists to avoid.
const AGAINST_BUILD = process.env.PW_BUILD === '1';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: AGAINST_BUILD
    ? {
        command: `npm run build -- --outDir dist-test --emptyOutDir && serve dist-test -l ${PORT} -s`,
        url: BASE_URL,
        reuseExistingServer: false,
        // A cold build plus typecheck is well over the dev server's 2 minutes.
        timeout: 300_000,
      }
    : {
        command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
