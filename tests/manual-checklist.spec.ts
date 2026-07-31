import { expect, test } from '@playwright/test';

const PUBLIC_VIEWPORTS = [
  { label: 'iphone-se', width: 375, height: 667 },
  { label: 'iphone-14', width: 390, height: 844 },
  { label: 'ipad-portrait', width: 768, height: 1024 },
  { label: 'ipad-landscape', width: 1024, height: 768 },
] as const;

test.describe('Phase 5 browser checks we can automate safely', () => {
  test('unauthenticated protected routes redirect to /auth', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole('heading', { name: 'Two Seasons Insights' })).toBeVisible();
  });

  test('reset password page shows fallback state without a recovery token', async ({ page }) => {
    await page.goto('/reset-password');
    // Copy is 'Reset link expired' (src/pages/ResetPassword.tsx:178). The
    // earlier 'Invalid or expired link' expectation was stale, not a product
    // bug — the page changed and this assertion did not.
    await expect(page.getByText('Reset link expired')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to sign in' })).toBeVisible();
  });

  for (const viewport of PUBLIC_VIEWPORTS) {
    test(`auth page has no horizontal overflow at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/auth');

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth - root.clientWidth;
      });

      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('auth page exposes keyboard-usable labeled controls', async ({ page }) => {
    await page.goto('/auth');

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByLabel('Remember me')).toBeVisible();
    // exact: true — the page has both 'Sign in' and 'Sign in with Microsoft',
    // and Playwright's accessible-name matching is substring-based, so the
    // loose name matched two elements and failed strict mode.
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('auth page ships with the expected CSP meta tag', async ({ page }) => {
    await page.goto('/auth');

    const csp = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(csp).toHaveCount(1);
    await expect(csp).toHaveAttribute('content', /default-src 'self';/);
    await expect(csp).toHaveAttribute('content', /frame-ancestors 'none';/);
    await expect(csp).toHaveAttribute('content', /connect-src 'self' https:\/\/\*\.supabase\.co/);
  });

  test('sign-in form locks after 5 failed attempts', async ({ page }) => {
    test.slow();
    await page.goto('/auth');

    const email = page.getByLabel('Email');
    const password = page.locator('#password');
    const submit = page.getByRole('button', { name: 'Sign in', exact: true }); // see above

    await email.fill('invalid-check@example.com');
    await password.fill('WrongPassword!123');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await submit.click();
      if (attempt < 4) {
        await expect(page.getByText(/sign-in failed|invalid login credentials/i).first()).toBeVisible();
      }
    }

    await expect(page.getByText(/Too many failed sign-in attempts/i).first()).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(email).toBeDisabled();
    await expect(password).toBeDisabled();
  });

  test('reset-password request flow locks after 3 requests in the local window', async ({ page }) => {
    test.slow();
    await page.goto('/auth');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.getByRole('button', { name: 'Forgot your password?' }).click();
      const resetEmail = page.getByLabel('Email');
      const sendResetLink = page.getByRole('button', { name: 'Send reset link' });

      await resetEmail.fill('invalid-check@example.com');
      await sendResetLink.click();
      await expect(page.getByText(/Check your inbox for the reset link/i).first()).toBeVisible();
    }

    await page.getByRole('button', { name: 'Forgot your password?' }).click();
    await expect(page.getByText(/Too many reset requests/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeDisabled();
  });

  test('auth page does not persist login email in localStorage during unauthenticated use', async ({ page }) => {
    await page.goto('/auth');

    await page.getByLabel('Email').fill('someone@example.com');
    await page.locator('#password').fill('WrongPassword!123');

    const storedKeys = await page.evaluate(() => ({
      rememberedEmail: localStorage.getItem('ts_last_email'),
      rememberMeFlag: localStorage.getItem('ts_remember_me'),
    }));

    expect(storedKeys.rememberedEmail).toBeNull();
    expect(storedKeys.rememberMeFlag === null || storedKeys.rememberMeFlag === '1' || storedKeys.rememberMeFlag === '0').toBeTruthy();
  });

  test('404 route renders safely and offers a path back', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByText('Page not found')).toBeVisible();
    await expect(page.getByRole('link', { name: /Return to Dashboard/i })).toBeVisible();
  });
});

test.describe('Manual checklist items that still require live app verification', () => {
  test.skip('auth redirect sanitization with a live successful login', async () => {
    // Requires a valid authenticated session to prove the redirect target
    // resolves to "/" after sign-in when history state is hostile.
  });

  test.skip('WhatsApp sender validation and chat flow', async () => {
    // Requires authenticated access plus working Supabase and WhatsApp data.
  });

  test.skip('password reset policy and cross-session invalidation', async () => {
    // Requires a valid recovery link and multiple signed-in sessions.
  });

  test.skip('dashboard responsiveness, realtime, and profiler checks', async () => {
    // Requires an authenticated dashboard session and manual DevTools inspection.
  });

  test.skip('axe, Lighthouse, and screen-reader verification', async () => {
    // Requires external tooling and human review beyond Playwright alone.
  });
});
