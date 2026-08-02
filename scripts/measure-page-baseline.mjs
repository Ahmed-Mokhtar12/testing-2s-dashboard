#!/usr/bin/env node
// Browser-side performance baseline for a dashboard page, measured against a
// real deployment with a real browser.
//
// WHY THIS EXISTS. The edge-function logs give server-side execution_time_ms,
// which is only part of the story: it excludes the CORS preflight, the gateway
// hop, the lazy-chunk download and the time the page spends rendering nothing.
// Without a browser-side number there is no way to prove a performance change
// helped, and a improvement nobody measured is indistinguishable from a
// improvement that did not happen.
//
// It is deliberately a COMMITTED script rather than an ad-hoc run, for the same
// reason the deploy scripts are: the before/after comparison is only meaningful
// if both sides were measured the same way. Re-run it after each phase.
//
// Usage:
//   node scripts/measure-page-baseline.mjs [url] [--warm] [--json out.json]
//
// AUTHENTICATED MEASUREMENT (the part that needs the operator, not the agent).
// /dashboard/* redirects to /auth without a session, so an anonymous run
// measures the shell and the bundle but never the three sp-read-* calls. To
// capture those, seed a real session from your own browser:
//
//   1. Sign in at https://testing-2s-dashboard.digitlab.ai
//   2. DevTools -> Application -> Local Storage -> copy the value of
//      sb-yczcebfaqerlwfalrbjn-auth-token
//   3. SB_SESSION_JSON='<that value>' node scripts/measure-page-baseline.mjs
//
// The token stays in your shell. Nothing here prints it, and nothing writes it
// to the JSON output.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const PROJECT_REF = 'yczcebfaqerlwfalrbjn';
const DEFAULT_URL = 'https://testing-2s-dashboard.digitlab.ai/dashboard/hotel-training';
const WATCHED_ENDPOINTS = ['sp-read-colleagues', 'sp-read-columns', 'sp-read-trainers'];

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) ?? DEFAULT_URL;
const warmPass = args.includes('--warm');
const jsonIndex = args.indexOf('--json');
const jsonOut = jsonIndex !== -1 ? args[jsonIndex + 1] : null;

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function measure(context, label) {
  const page = await context.newPage();
  const responses = [];
  const started = new Map();

  page.on('request', (request) => started.set(request, Date.now()));
  page.on('response', async (response) => {
    const request = response.request();
    let sizes = { responseBodySize: 0, responseHeadersSize: 0 };
    try {
      sizes = await request.sizes();
    } catch {
      // A response can complete after teardown; a missing size must not lose
      // the row, so it is recorded as 0 and the count still reflects reality.
    }
    const headers = response.headers();
    responses.push({
      url: response.url(),
      status: response.status(),
      type: request.resourceType(),
      method: request.method(),
      wire: (sizes.responseBodySize ?? 0) + (sizes.responseHeadersSize ?? 0),
      encoding: headers['content-encoding'] ?? '-',
      cacheControl: headers['cache-control'] ?? null,
      fromCache: (sizes.responseBodySize ?? 0) === 0 && response.status() === 200,
      ms: Date.now() - (started.get(request) ?? Date.now()),
    });
  });

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  const loadMs = Date.now() - t0;

  // Give lazy chunks and the data queries a chance to land. networkidle alone
  // can resolve before React Query's first fetch starts.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find((p) => p.name === 'first-contentful-paint');
    return {
      ttfb: nav ? Math.round(nav.responseStart) : null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null,
      firstContentfulPaint: fcp ? Math.round(fcp.startTime) : null,
      transferSizeFromBrowser: nav ? nav.transferSize : null,
    };
  });

  // Resource Timing is the AUTHORITY on what actually crossed the network, and
  // Playwright's request.sizes() is not: for a response the browser served from
  // its memory cache, sizes() can still report the full body while transferSize
  // is 0. Reading cache state from sizes() produced a confident, wrong finding
  // ("the logo is re-downloaded every load") that a conditional curl disproved.
  //   transferSize === 0            -> served from cache, no network at all
  //   0 < transferSize < ~500 bytes -> 304 Not Modified (headers only)
  //   transferSize > encodedBodySize-> full download plus headers
  const resourceTiming = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      duration: Math.round(entry.duration),
    })),
  );

  // Did we land on the page, or get bounced to /auth? This determines whether
  // the data-call numbers below mean anything at all.
  const landedOn = page.url();
  const authenticated = !/\/auth/.test(landedOn);

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200));
  await page.close();

  return { label, loadMs, timing, responses, resourceTiming, landedOn, authenticated, bodyText };
}

function report(run) {
  const { label, loadMs, timing, responses, resourceTiming, landedOn, authenticated, bodyText } = run;

  console.log(`\n${'='.repeat(72)}`);
  console.log(` ${label}`);
  console.log(`${'='.repeat(72)}`);
  console.log(`  landed on          : ${landedOn}`);
  console.log(`  authenticated      : ${authenticated ? 'YES' : 'NO — redirected to /auth'}`);
  console.log(`  TTFB               : ${timing.ttfb} ms`);
  console.log(`  FirstContentfulPaint: ${timing.firstContentfulPaint} ms`);
  console.log(`  DOMContentLoaded   : ${timing.domContentLoaded} ms`);
  console.log(`  load event         : ${timing.load} ms`);
  console.log(`  goto->load wall    : ${loadMs} ms`);

  // From Resource Timing, not from response sizes — see the note in measure().
  const total = resourceTiming.reduce((sum, e) => sum + e.transferSize, 0);
  const fromCache = resourceTiming.filter((e) => e.transferSize === 0);
  const revalidated = resourceTiming.filter((e) => e.transferSize > 0 && e.transferSize < 500);
  const downloaded = resourceTiming.filter((e) => e.transferSize >= 500);
  console.log(`\n  subresources       : ${resourceTiming.length}`);
  console.log(`  ACTUALLY over wire : ${kb(total)}   (Resource Timing transferSize)`);
  console.log(`    downloaded       : ${downloaded.length} resources, ${kb(downloaded.reduce((s, e) => s + e.transferSize, 0))}`);
  console.log(`    304 revalidated  : ${revalidated.length} resources (a round trip each, ~0 bytes)`);
  console.log(`    served from cache: ${fromCache.length} resources (no network)`);

  const noCacheControl = responses.filter(
    (r) => r.status === 200 && /\/assets\//.test(r.url) && !r.cacheControl,
  );
  console.log(`  /assets/* with NO Cache-Control: ${noCacheControl.length}`);

  const ccByUrl = new Map(responses.map((r) => [r.url, r.cacheControl]));
  console.log(`\n  Largest subresources (by bytes actually transferred):`);
  for (const e of [...resourceTiming].sort((a, b) => b.transferSize - a.transferSize).slice(0, 8)) {
    const state = e.transferSize === 0 ? 'CACHE' : e.transferSize < 500 ? '304  ' : 'NET  ';
    const name = e.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 48);
    console.log(
      `    ${state} ${kb(e.transferSize).padStart(10)} wire  ${kb(e.decodedBodySize).padStart(10)} decoded  ` +
      `${String(e.duration).padStart(5)} ms  cc=${(ccByUrl.get(e.name) ?? 'NONE').slice(0, 20).padEnd(20)} ${name}`,
    );
  }

  const dataCalls = responses.filter((r) => WATCHED_ENDPOINTS.some((e) => r.url.includes(e)));
  console.log(`\n  Hotel Training data calls (${dataCalls.length} seen):`);
  if (dataCalls.length === 0) {
    console.log('    NONE — expected without a session. See SB_SESSION_JSON in the header.');
  }
  for (const r of dataCalls) {
    const fn = WATCHED_ENDPOINTS.find((e) => r.url.includes(e));
    console.log(
      `    ${r.method.padEnd(7)} ${String(r.status).padEnd(4)} ${String(r.ms).padStart(6)} ms  ` +
      `${kb(r.wire).padStart(9)}  cc=${r.cacheControl ?? 'NONE'}  ${fn}`,
    );
  }

  console.log(`\n  first 200 chars rendered: ${JSON.stringify(bodyText)}`);
  return { total, requestCount: resourceTiming.length, dataCallCount: dataCalls.length };
}

const browser = await chromium.launch({ headless: true });
try {
  const contextOptions = { viewport: { width: 1366, height: 768 } };
  const context = await browser.newContext(contextOptions);

  if (process.env.SB_SESSION_JSON) {
    // Seeded before any navigation so the very first render already has a
    // session — otherwise the app bounces to /auth and the data calls never fire.
    await context.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: `sb-${PROJECT_REF}-auth-token`, value: process.env.SB_SESSION_JSON },
    );
    console.log('Session seeded from SB_SESSION_JSON (value not printed).');
  } else {
    console.log('No SB_SESSION_JSON — anonymous run. Shell and bundle only.');
  }

  const cold = await measure(context, 'COLD CACHE (first visit)');
  const coldSummary = report(cold);

  let warmSummary = null;
  if (warmPass) {
    // Same context, so the HTTP cache and localStorage persist — this is the
    // "user reloads the page" case, which is where Cache-Control shows up.
    const warm = await measure(context, 'WARM CACHE (reload, same context)');
    warmSummary = report(warm);
  }

  // ANTI-VACUITY: a broken selector, a DNS failure or a teardown race would all
  // produce a clean-looking run with nothing in it. Refuse to report success.
  if (coldSummary.requestCount === 0) {
    console.error('\nFATAL: captured zero responses — the run measured nothing.');
    process.exit(1);
  }
  if (coldSummary.total === 0) {
    console.error('\nFATAL: total transfer size is 0 — sizes were not captured.');
    process.exit(1);
  }

  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ url, cold, warm: warmSummary }, null, 2));
    console.log(`\nWrote ${jsonOut}`);
  }

  console.log('\nDone.');
} finally {
  await browser.close();
}
