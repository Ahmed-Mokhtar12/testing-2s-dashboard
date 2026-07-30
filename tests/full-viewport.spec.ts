import { test, expect, type Page } from '@playwright/test';
import {
  setMockAuthSession,
  mockSupabaseRest,
  mockColleaguesFunction,
  mockColumnsFunction,
  mockTrainersFunction,
} from './helpers/hotel-training-mocks';

const IN_SCOPE = [
  '/dashboard',
  '/dashboard/reviews',
  '/dashboard/competitors',
  '/dashboard/info-email',
  '/dashboard/social',
  '/dashboard/welcome',
  '/dashboard/hotel-training',
];
const EXCLUDED = ['/dashboard/whatsapp', '/dashboard/email'];
const DESKTOP_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
];

async function openPage(page: Page, route: string) {
  await setMockAuthSession(page);
  await mockSupabaseRest(page);
  await mockColleaguesFunction(page);
  await mockColumnsFunction(page);
  await mockTrainersFunction(page);
  await page.goto(route);
  await page.waitForLoadState('networkidle');
}

async function documentOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
}

async function mainOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('no <main> found');
    return main.scrollHeight - main.clientHeight;
  });
}

test.describe('full-viewport layout (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only assertions');

  for (const size of DESKTOP_SIZES) {
    for (const route of IN_SCOPE) {
      test(`${route} fits ${size.width}x${size.height}`, async ({ page }) => {
        await page.setViewportSize(size);
        await openPage(page, route);
        expect(await documentOverflow(page)).toBeLessThanOrEqual(1);
        expect(await mainOverflow(page)).toBeLessThanOrEqual(1);
      });
    }
  }

  // Excluded pages: document-level scroll must KEEP working exactly as
  // before. At 1366x768 both pages are taller than the viewport even with
  // empty mocked data (KPI row + 3 chart cards ≈ 950px+).
  for (const route of EXCLUDED) {
    test(`${route} still scrolls at document level (unchanged)`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await openPage(page, route);
      expect(await documentOverflow(page)).toBeGreaterThan(0);
    });
  }
});

test.describe('full-viewport layout (mobile)', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile-only assertions');

  for (const route of [...IN_SCOPE, ...EXCLUDED]) {
    test(`${route} document does not scroll on mobile`, async ({ page }) => {
      await openPage(page, route);
      if (EXCLUDED.includes(route)) {
        // Excluded pages keep document flow on every viewport — only assert
        // the page still renders (no layout assertion).
        await expect(page.locator('main')).toBeVisible();
        return;
      }
      expect(await documentOverflow(page)).toBeLessThanOrEqual(1);
      // main MAY scroll internally on mobile — no mainOverflow assertion.
    });
  }
});
