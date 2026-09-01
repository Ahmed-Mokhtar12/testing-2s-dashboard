import { test, expect } from '@playwright/test';

// supabase-js defaults to the implicit flow, so GoTrue returns to /auth/callback#access_token=…
// or #error=…; the callback only looked at ?code= and bounced every result to /auth before the
// domain check or the error cards could run (audit A7/W1).
test('a provider error in the hash is shown, not swallowed', async ({ page }) => {
  await page.goto('/auth/callback#error=access_denied&error_description=User+cancelled+the+sign-in');
  await expect(page.getByText('Microsoft sign-in was cancelled.')).toBeVisible();
  await expect(page.getByTestId('auth-callback-error')).toHaveText('User cancelled the sign-in');
  await page.waitForTimeout(1500);
  expect(new URL(page.url()).pathname).toBe('/auth/callback');
});

test('a bare callback still returns to /auth', async ({ page }) => {
  await page.goto('/auth/callback');
  await page.waitForURL('**/auth');
});
