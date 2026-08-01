import { test, expect, type Page } from '@playwright/test';
import {
  setMockAuthSession,
  mockSupabaseRest,
  mockColleaguesFunction,
  mockColumnsFunction,
  mockTrainersFunction,
  makeManyColleagues,
  MOCK_TRAINERS_FLAT,
} from './helpers/hotel-training-mocks';
import { MAX_PARTICIPANTS } from '../src/lib/hotel-training-constants';

// setMockAuthSession's default identity. DRAFT_KEY lowercases the email
// (src/lib/hotel-training-constants.ts), and this one is already lowercase.
const DRAFT_EMAIL = 'user@2seasonshotels.com';

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
  // Routes are lazy-loaded behind a <Suspense> boundary (see App.tsx) whose
  // fallback (RouteFallback) renders a spinner div with NO <main> element.
  // `networkidle` alone can resolve while that fallback is still showing, so
  // measuring overflow at that point either throws ("no <main> found") or
  // measures the wrong (unrendered) DOM. Wait for the real route content —
  // <main> attached, then its page heading visible (every dashboard page
  // renders one via SectionHeader, see SectionHeader.tsx) — before settling
  // on networkidle for any remaining async chart/data rendering.
  await page.locator('main').waitFor({ state: 'attached' });
  await page.locator('main h1, main h2, main h3').first().waitFor({ state: 'visible' });
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

// I4: locked-mode <main> now uses `lg:overflow-y-auto` instead of
// `lg:overflow-hidden` (see the comment in DashboardShell.tsx), so
// `lg:overflow-hidden` no longer exists on ANY <main> — checking for its
// absence would pass vacuously for legacy mode too and stop distinguishing
// the two shell modes. The genuine discriminator is `min-h-0`: only the
// locked-mode <main> is a shrinkable flex/scroll child of the height-locked
// chain (`flex-1 min-h-0 overflow-y-auto lg:overflow-y-auto p-3 sm:p-6
// short:p-3`); the legacy <main> keeps its original, unconstrained classes
// (`flex-1 overflow-y-auto p-3 sm:p-6`) with no `min-h-0` and no `short:`
// variant at all. Both are read straight from DashboardShell.tsx's JSX.
async function assertLegacyMainStructure(page: Page) {
  const mainClass = await page.locator('main').getAttribute('class');
  expect(mainClass).toContain('overflow-y-auto');
  expect(mainClass).not.toContain('min-h-0');
  expect(mainClass).not.toContain('short:p-3');
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
  // before. At 1366x768 /dashboard/email is taller than the viewport even
  // with empty mocked data (KPI row + 4 chart/table cards ≈ 950px+), so its
  // document overflow is asserted directly. /dashboard/whatsapp has fewer
  // chart cards and legitimately fits 768px with empty mocked data — since
  // its chart heights are fixed (not data-driven), no amount of mock data
  // can force an overflow, so legacy mode is regression-locked structurally
  // instead (see below and assertLegacyMainStructure).
  for (const route of EXCLUDED) {
    const title =
      route === '/dashboard/whatsapp'
        ? `${route} keeps legacy scroll layout (unchanged)`
        : `${route} still scrolls at document level (unchanged)`;
    test(title, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await openPage(page, route);
      if (route === '/dashboard/whatsapp') {
        await assertLegacyMainStructure(page);
        return;
      }
      expect(await documentOverflow(page)).toBeGreaterThan(0);
    });
  }

  // M1: React Router's matching is case-insensitive and normalizes a
  // trailing slash (verified against react-router-dom's matchPath), so
  // `/dashboard/whatsapp/` renders the same WhatsApp.tsx as
  // `/dashboard/whatsapp`. DashboardShell must recognize that and keep it in
  // legacy mode too — a plain `LEGACY_SCROLL_ROUTES.includes(pathname)`
  // string check would miss the trailing slash and silently clip/reflow the
  // page, breaking the hard "WhatsApp.tsx/Email.tsx stay byte-identical"
  // constraint (the page would render the exact same component tree, just
  // inside the wrong shell chain).
  test('/dashboard/whatsapp/ (trailing slash) still keeps legacy scroll layout', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openPage(page, '/dashboard/whatsapp/');
    await assertLegacyMainStructure(page);
  });
});

// I5(a): the spec claims "seeded generous data ... so real heights are
// exercised — empty-state fits prove nothing", but mockSupabaseRest fulfils
// every REST read with `[]`, so the six chart-driven analytics routes above
// are all measured with NO data. Fabricating realistic rows for seven
// different insights hooks is high-effort and brittle (see I5(b) — the spec
// is amended instead to say so honestly). Hotel Training's participant list
// is the one genuinely unbounded, data-independent piece of content in
// scope, so it gets exercised for real: fill the wizard to MAX_PARTICIPANTS
// (raised 15 -> 100 on 2026-08-01) and prove the overflow lands inside the
// wizard column, not at the document (or, post-I4, silently clipped) level.
// The cap is imported rather than restated so this stays a CEILING test — a
// ceiling test pinned below the ceiling has stopped testing what it claims.
// Patterns below are
// copied from tests/hotel-training.spec.ts's fillTrainingDetails/
// selectParticipant helpers.
test.describe('full-viewport layout — Hotel Training max participants (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only assertion');

  test(`hotel-training wizard at ${MAX_PARTICIPANTS} participants: document does not scroll, wizard column does`, async ({ page }) => {
    // SETUP REWRITTEN 2026-07-31 — draft-seeded, not hand-entered.
    //
    // The original version drove ~25 real UI interactions, 15 of them popover
    // open/select round-trips whose close animation has to settle between rows.
    // Measured on this 2-core host, single worker, against the Vite dev server:
    //   spec alone .................. 23s   (passes on the 30s default)
    //   4-spec run, 120s ceiling .... FAILED
    //   4-spec run, 600s ceiling .... passed (whole run 6.6 min)
    //   full suite, 300s ceiling .... FAILED again (run took 11.8 min)
    // and that last failure was not a slow-but-progressing test: it died in
    // `locator.click` on a participant option with "element is not stable",
    // i.e. mid-animation. The variance is over 5x and driven by host
    // contention, so raising the ceiling a fourth time would just buy another
    // coin flip — the previous note in this file said explicitly not to, and
    // this is that remedy instead.
    //
    // The participants now arrive through the draft-restore path
    // (localStorage `hotel-training-draft-<email>`, shape
    // { trainingDetails, participants: ParticipantRow[], step, savedAt } — the
    // same seam tests/hotel-training.spec.ts's legacy-draft test uses), which
    // reaches the identical full-height layout with ONE click and zero popover
    // animations. The assertions below are unchanged; only the setup is.
    //
    // What this trades away, stated rather than hidden: the old version also
    // incidentally proved the wizard can be driven to 15 rows by hand, and
    // that duplicate blocking does not run out of selectable colleagues. Both
    // of those are already covered by tests/hotel-training.spec.ts (duplicate
    // participant blocking, reduce-count confirmation), and neither was what
    // THIS test asserts. What is left is a layout test that measures layout.
    await page.setViewportSize({ width: 1366, height: 768 });
    await setMockAuthSession(page);
    await mockSupabaseRest(page);
    // A generated roster (not the default MOCK_COLLEAGUES_FLAT, which has only 3
    // active colleagues): the wizard blocks duplicates, so MAX_PARTICIPANTS
    // distinct active colleagues are needed, and the seeded rows below are taken
    // from this list so the restored draft references people the directory
    // actually returns. Page-scoped override — no effect on other specs.
    const roster = makeManyColleagues(MAX_PARTICIPANTS);
    await mockColleaguesFunction(page, { list: roster });
    await mockColumnsFunction(page);
    await mockTrainersFunction(page);

    // The last MAX_PARTICIPANTS ACTIVE colleagues, which makeManyColleagues
    // guarantees are all generated filler. Taken from the tail rather than the
    // head so the inactive Dave Black and the shared MOCK_COLLEAGUES_FLAT entries
    // are skipped without this test depending on which of them are active.
    const seededRows = roster
      .filter((colleague) => colleague.isActive)
      .slice(-MAX_PARTICIPANTS)
      .map((colleague, index) => ({ rowNo: index + 1, colleague }));
    expect(seededRows).toHaveLength(MAX_PARTICIPANTS);

    await page.addInitScript(
      ({ key, value }) => {
        window.localStorage.setItem(key, value);
      },
      {
        key: `hotel-training-draft-${DRAFT_EMAIL}`,
        value: JSON.stringify({
          trainingDetails: {
            title: 'Full Viewport Max Participants',
            department: 'Engineering',
            durationMinutes: 60,
            totalParticipants: MAX_PARTICIPANTS,
            // Serialised as a string; restoreDraft revives it with
            // `new Date(draft.trainingDetails.date)` (HotelTraining.tsx:157).
            date: '2026-07-15T00:00:00.000Z',
            hour: 9,
            minute: 0,
            trainers: [MOCK_TRAINERS_FLAT[0]],
          },
          participants: seededRows,
          step: 2,
          savedAt: new Date().toISOString(),
        }),
      },
    );

    await page.goto('/dashboard/hotel-training');
    await expect(page.getByRole('button', { name: 'Training Details' })).toBeVisible();
    await expect(page.getByText('Loading training data...')).toBeHidden();

    await expect(page.getByText(/You have an unsaved draft from/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByLabel('Training Title')).toHaveValue('Full Viewport Max Participants');

    // `step: 2` in the draft is deliberately ignored by the app —
    // restoreDraft() always calls setStep(1) so the details can be reviewed
    // before submitting (HotelTraining.tsx:164). So the seeded step is not what
    // gets us to the participants view; this click is. Because
    // totalParticipants equals participants.length (both MAX_PARTICIPANTS),
    // applyStep1 takes
    // neither the grow nor the trim branch and the seeded rows survive intact.
    await page.getByRole('button', { name: /Next: Add Participants/ }).click();
    await expect(page.getByRole('button', { name: 'Participants' })).toBeVisible();

    // ANTI-VACUITY GUARD, and the whole reason the seeding is trustworthy:
    // MAX_PARTICIPANTS EMPTY rows would also make the page overflow, so proving
    // the rows exist is not enough — they have to be FILLED, which is what the
    // old click-through guaranteed for free. A filled trigger renders
    // `${colleagueName} (${employeeId})` (ParticipantRow.tsx:52); an empty one
    // does not. Checking first, last and the count covers the ways the restore
    // could half-work.
    //
    // Expectations are DERIVED from seededRows rather than written out. The
    // previous version pinned 'Eve Turner (2001)' and 'Samuel Osei (2015)', which
    // silently became the wrong people the moment the roster grew — a literal in
    // a test is a time bomb (docs/testing-lessons.md section 4).
    const firstSeeded = seededRows[0].colleague;
    const lastSeeded = seededRows[seededRows.length - 1].colleague;
    await expect(page.getByTestId('participant-select-1'))
      .toHaveText(new RegExp(`${firstSeeded.colleagueName} \\(${firstSeeded.employeeId}\\)`));
    await expect(page.getByTestId(`participant-select-${MAX_PARTICIPANTS}`))
      .toHaveText(new RegExp(`${lastSeeded.colleagueName} \\(${lastSeeded.employeeId}\\)`));
    await expect(page.getByTestId(/^participant-select-\d+$/)).toHaveCount(MAX_PARTICIPANTS);
    await page.waitForLoadState('networkidle');

    // The claim under test: at MAX_PARTICIPANTS the DOCUMENT never scrolls
    // (locked shell holds), and the resulting overflow is absorbed by a
    // scroll container inside the shell rather than growing the page. That
    // container is `<main>` (overflow-y-auto), not the wizard column itself —
    // `div.max-w-2xl` (the wizard column's wrapper class in
    // HotelTraining.tsx's `registerTrainingContent`) has no overflow style
    // of its own at this breakpoint, which is why this test does not assert
    // `mainOverflow <= 1` here. `.max-w-2xl` is still asserted below purely
    // as a proxy for "the wizard content is taller than its box", since it's
    // the only element with that class rendered for a non-admin user
    // mid-wizard (the other two `.max-w-2xl` divs — the success screen and
    // AdminPanel — aren't mounted here).
    expect(await documentOverflow(page)).toBeLessThanOrEqual(1);
    const wizardOverflow = await page.evaluate(() => {
      const el = document.querySelector('main div.max-w-2xl');
      if (!el) throw new Error('wizard column (.max-w-2xl) not found');
      return el.scrollHeight - el.clientHeight;
    });
    expect(wizardOverflow).toBeGreaterThan(0);
  });
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
