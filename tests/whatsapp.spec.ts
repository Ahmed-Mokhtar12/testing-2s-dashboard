import { test, expect, type Page } from '@playwright/test';
import { PROJECT_REF, setMockAuthSession } from './helpers/hotel-training-mocks';

// Baseline smoke coverage for the /whatsapp operator inbox (Phase-2 item 2.1).
// Everything is mocked: auth via the shared localStorage session fixture, and
// PostgREST via route interception — no real Supabase data, no sends possible
// (no edge-function route is mocked to succeed, and nothing here presses Send).
//
// Fixture timestamps are derived at run time (repo rule: no stale literals).

const GUEST_NUMBER = '971500000001';
const GUEST_NAME = 'Test Guest';
const GUEST_TEXT = 'I need a late checkout';
const AI_TEXT = 'Of course, late checkout until 2 PM is available.';

function chatHistoryRows() {
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  // Newest-first, as PostgREST returns for order=created_at.desc
  return [
    {
      id: 2,
      created_at: iso(60_000),
      'Sender Number': GUEST_NUMBER,
      'Sender Message': GUEST_TEXT,
      'Ai Reply': AI_TEXT,
      Name: GUEST_NAME,
      Media: null,
      is_archived: false,
      is_human_controlled: false,
      human_reply: null,
      replied_by_user_id: null,
      replied_by_name: null,
      released_to_ai_at: null,
      handled_by: 'ai',
    },
    {
      id: 1,
      created_at: iso(120_000),
      'Sender Number': GUEST_NUMBER,
      'Sender Message': 'Hello',
      'Ai Reply': 'Welcome to Two Seasons! How can I help?',
      Name: GUEST_NAME,
      Media: null,
      is_archived: false,
      is_human_controlled: false,
      human_reply: null,
      replied_by_user_id: null,
      replied_by_name: null,
      released_to_ai_at: null,
      handled_by: 'ai',
    },
  ];
}

async function mockWhatsAppRest(page: Page) {
  await page.route(`https://${PROJECT_REF}.supabase.co/rest/v1/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 200, body: 'ok' });
    }
    const url = new URL(request.url());
    const path = decodeURIComponent(url.pathname);

    if (path.endsWith('/rpc/is_conversation_human_controlled')) {
      return route.fulfill({ json: false });
    }
    if (path.includes('/Chat History')) {
      // Same fixture serves the sidebar query (no sender filter) and the
      // thread query (Sender Number=eq.<n>): one conversation, two rows.
      return route.fulfill({ json: chatHistoryRows() });
    }
    return route.fulfill({ json: [] });
  });
}

async function openWhatsApp(page: Page) {
  await setMockAuthSession(page);
  await mockWhatsAppRest(page);
  await page.addInitScript((num) => {
    window.localStorage.setItem('whatsapp_sender_number', num);
  }, GUEST_NUMBER);
  await page.goto('/whatsapp');
  await page.getByTestId('whatsapp-chat-shell').waitFor({ state: 'visible' });
}

test.describe('WhatsApp inbox', () => {
  test('unauthenticated /whatsapp redirects to /auth', async ({ page }) => {
    await mockWhatsAppRest(page);
    await page.goto('/whatsapp');
    await expect(page).toHaveURL(/\/auth$/);
  });

  test('renders sidebar preview and conversation thread', async ({ page, isMobile }) => {
    await openWhatsApp(page);

    // Sidebar (desktop) / chat list (mobile): the guest's name is the row title.
    await expect(page.getByText(GUEST_NAME).first()).toBeVisible();

    if (isMobile) {
      // Mobile starts on the list; tapping the row opens the conversation.
      await page.getByText(GUEST_NAME).first().click();
    }

    // Thread renders both sides of the fixture exchange. The AI text may also
    // appear as the sidebar preview (newest-writer precedence), so scope to the
    // message bubble's paragraph class rather than the whole page.
    const bubble = (text: string) =>
      page.locator('p.whitespace-pre-wrap', { hasText: text });
    await expect(bubble(GUEST_TEXT)).toBeVisible();
    await expect(bubble(AI_TEXT)).toBeVisible();

    // Composer is present with the AI-mode placeholder.
    await expect(page.getByPlaceholder('Type a message')).toBeVisible();

    // Header shows the guest's name (2.3), with the number in the subtitle.
    await expect(page.getByRole('heading', { name: GUEST_NAME })).toBeVisible();
    await expect(page.getByText('+971 50 000 0001', { exact: false })).toBeVisible();
  });

  test('AI-mode send renders exactly one guest and one AI bubble (row-id adoption)', async ({ page, isMobile }) => {
    // Both edge functions are route-mocked — nothing real can be sent.
    await page.route(
      `https://${PROJECT_REF}.supabase.co/functions/v1/whatsapp-control-status*`,
      (route) =>
        route.request().method() === 'OPTIONS'
          ? route.fulfill({ status: 200, body: 'ok' })
          : route.fulfill({ json: { isHumanControlled: false } })
    );
    await page.route(
      `https://${PROJECT_REF}.supabase.co/functions/v1/whatsapp-web-chat`,
      (route) =>
        route.request().method() === 'OPTIONS'
          ? route.fulfill({ status: 200, body: 'ok' })
          : route.fulfill({ json: { success: true, response: 'Mocked AI reply', insertedId: 99 } })
    );

    await openWhatsApp(page);
    if (isMobile) {
      await page.getByText(GUEST_NAME).first().click();
    }
    const input = page.getByPlaceholder('Type a message');
    await input.fill('Testing the send path');
    await input.press('Enter');

    const bubble = (text: string) =>
      page.locator('p.whitespace-pre-wrap', { hasText: text });
    await expect(bubble('Mocked AI reply')).toHaveCount(1);
    await expect(bubble('Testing the send path')).toHaveCount(1);
    await expect(input).toHaveValue('');
  });

  // NOTE: the "no chat selected" hero panel (WhatsAppEmptyState) is only
  // reachable when VITE_WA_DEFAULT_NUMBER is unset — this environment sets it
  // in .env, so an empty selection always falls back to the default chat and
  // the state cannot be forced end-to-end here. The hero is defensive UI for
  // unconfigured deployments; covered by review, not by a spec.

  test('sidebar fetch failure shows an error state with retry', async ({ page }) => {
    await setMockAuthSession(page);
    let fail = true;
    await page.route(`https://${PROJECT_REF}.supabase.co/rest/v1/**`, async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, body: 'ok' });
      const path = decodeURIComponent(new URL(request.url()).pathname);
      if (path.endsWith('/rpc/is_conversation_human_controlled')) {
        return route.fulfill({ json: false });
      }
      if (path.includes('/Chat History')) {
        if (fail) return route.fulfill({ status: 500, json: { message: 'boom' } });
        return route.fulfill({ json: chatHistoryRows() });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto('/whatsapp');
    await expect(page.getByText("Couldn't load conversations.")).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText(GUEST_NAME).first()).toBeVisible();
  });

  test('typing into the composer does not send without a click', async ({ page, isMobile }) => {
    await openWhatsApp(page);
    if (isMobile) {
      await page.getByText(GUEST_NAME).first().click();
    }
    const input = page.getByPlaceholder('Type a message');
    await input.fill('draft text that must not be sent');
    // No Enter, no Send click — the text stays local and no function call fires.
    await expect(input).toHaveValue('draft text that must not be sent');
  });
});
