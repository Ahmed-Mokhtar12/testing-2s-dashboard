import { test, expect } from '@playwright/test';
import { PROJECT_REF, setMockAuthSession } from './helpers/hotel-training-mocks';

// Reproduced 2026-09-01 (audit A1): with no stored active session, the first send made
// useChat's two effects ping-pong the session id between child and parent — 42 renders in
// 300 ms, then React's update-depth guard. The reply never rendered.
test('first message of a brand-new Sera chat renders one reply and no page error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let calls = 0;
  await setMockAuthSession(page);
  // Every flip of the session id runs persistActiveSessionId (setItem/removeItem on the
  // sera_active_session key). A healthy first send touches it a handful of times; the
  // ping-pong touched it dozens of times in the first second.
  await page.addInitScript(() => {
    (window as unknown as { __seraActiveWrites: number }).__seraActiveWrites = 0;
    for (const method of ['setItem', 'removeItem'] as const) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (this: Storage, key: string, ...rest: unknown[]) {
        if (key.startsWith('sera_active_session_v1')) {
          (window as unknown as { __seraActiveWrites: number }).__seraActiveWrites += 1;
        }
        return (original as (this: Storage, ...a: unknown[]) => void).call(this, key, ...rest);
      };
    }
  });
  await page.route(`https://${PROJECT_REF}.supabase.co/rest/v1/**`, (r) => r.fulfill({ json: [] }));
  await page.route(`https://${PROJECT_REF}.supabase.co/functions/v1/chat-with-data`, (r) => {
    calls += 1;
    return r.fulfill({ json: { response: 'Mock reply from Sera' } });
  });
  await page.goto('/');
  await page.getByTestId('sera-toggle').click();
  await page.getByTestId('sera-input').fill('hello');
  await page.getByTestId('sera-send').click();
  await expect(page.getByTestId('sera-ai-message')).toContainText('Mock reply from Sera');
  await page.waitForTimeout(1000);
  expect(calls).toBe(1);
  expect(errors).toEqual([]);
  const activeWrites = await page.evaluate(() => (window as unknown as { __seraActiveWrites: number }).__seraActiveWrites);
  expect(activeWrites).toBeLessThanOrEqual(4);
});
