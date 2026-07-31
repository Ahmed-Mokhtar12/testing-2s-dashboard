import { test, expect, type Page } from '@playwright/test';
import { setMockAuthSession, PROJECT_REF } from './helpers/hotel-training-mocks';

// Every insights page renders `value={data?.kpis.total ?? 0}`. When the query
// fails, `data` is undefined and that `?? 0` produces a confident "0" — a
// number that looks exactly like a real quiet day. Same for charts, which get
// `data?.trend || []` and render empty axes.
//
// These tests pin the distinction. The CONTROL test at the bottom is the
// important half: it proves a genuine empty result still shows 0 in the
// `ready` state, so the error assertions above are not passing simply because
// everything is always flagged as broken.

const REST_GLOB = `https://${PROJECT_REF}.supabase.co/rest/v1/**`;

async function openWith(page: Page, route: string, mode: 'fail' | 'empty') {
  await setMockAuthSession(page);
  await page.route(REST_GLOB, (r) =>
    mode === 'fail'
      ? r.fulfill({ status: 500, json: { message: 'simulated PostgREST failure' } })
      : r.fulfill({ json: [] }),
  );
  await page.goto(route);
  // Same Suspense-aware wait as full-viewport.spec.ts: the lazy route's
  // fallback renders no <main>.
  await page.locator('main').waitFor({ state: 'attached' });
  await page.locator('main h1, main h2, main h3').first().waitFor({ state: 'visible' });
}

/** The KPI value elements on the page, by state. */
const kpis = (page: Page, state: 'error' | 'loading' | 'ready') =>
  page.locator(`main [data-kpi-state="${state}"]`);

for (const route of ['/dashboard', '/dashboard/reviews', '/dashboard/social', '/dashboard/welcome', '/dashboard/info-email', '/dashboard/competitors']) {
  test(`a failed insights query never renders a number on ${route}`, async ({ page }) => {
    await openWith(page, route, 'fail');

    // react-query is configured retry: 1 (src/App.tsx), so the failure state
    // arrives after the second rejected attempt.
    await expect(kpis(page, 'error').first()).toBeVisible({ timeout: 15_000 });

    // No KPI anywhere on the page is still claiming a value.
    await expect(kpis(page, 'ready')).toHaveCount(0);
    await expect(kpis(page, 'loading')).toHaveCount(0);

    // The failure is stated in words, not just colour — colour alone is not
    // an accessible signal.
    await expect(page.getByText("Couldn't load this figure").first()).toBeVisible();

    // And no error-state KPI is displaying a digit.
    const errorTexts = await kpis(page, 'error').allInnerTexts();
    expect(errorTexts.length).toBeGreaterThan(0);
    for (const text of errorTexts) {
      expect(text.trim(), 'a failed KPI must not render a numeric value').not.toMatch(/\d/);
    }
  });
}

test('a failed insights query does not leave an empty chart looking like a quiet period', async ({ page }) => {
  await openWith(page, '/dashboard/reviews', 'fail');
  await expect(page.locator('main [data-chart-state="error"]').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('main [data-chart-state="ready"]')).toHaveCount(0);
  // The chart body is replaced, so no axis/svg is left behind to misread.
  await expect(page.locator('main .recharts-wrapper')).toHaveCount(0);
});

test('CONTROL: a genuinely empty result still shows 0 in the ready state', async ({ page }) => {
  // Without this, the tests above would also pass if every KPI were
  // hard-flagged as broken.
  await openWith(page, '/dashboard/reviews', 'empty');

  await expect(kpis(page, 'ready').first()).toBeVisible({ timeout: 15_000 });
  await expect(kpis(page, 'error')).toHaveCount(0);
  await expect(page.getByText("Couldn't load this figure")).toHaveCount(0);

  // "Total reviews" of a genuinely empty range is 0, and it says so.
  const readyTexts = await kpis(page, 'ready').allInnerTexts();
  expect(readyTexts.some((t) => t.trim() === '0'), `expected a real 0, got ${JSON.stringify(readyTexts)}`).toBe(true);

  // Charts render normally.
  await expect(page.locator('main [data-chart-state="error"]')).toHaveCount(0);
});
