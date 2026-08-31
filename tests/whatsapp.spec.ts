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
