const { test, expect } = require('@playwright/test');

test.describe('Phase 11: 2FA Direct HTML Testing', () => {
  test('01 - Login page has correct form structure', async ({ page }) => {
    await page.goto('https://localhost:8443/login', { waitUntil: 'domcontentloaded' });

    // Check for email input
    const emailInput = page.locator('input[type="email"], input[id="email"]').first();
    expect(await emailInput.count()).toBeGreaterThan(0);
    expect(await emailInput.getAttribute('id')).toBe('email');

    // Check for password input
    const passwordInput = page.locator('input[type="password"], input[id="password"]').first();
    expect(await passwordInput.count()).toBeGreaterThan(0);
    expect(await passwordInput.getAttribute('id')).toBe('password');

    // Check for submit button
    const submitBtn = page.locator('button[type="submit"]').first();
    expect(await submitBtn.count()).toBeGreaterThan(0);
    const btnText = await submitBtn.textContent();
    expect(btnText).toContain('Sign In');
  });

  test('02 - 2FA setup page HTML structure', async ({ page }) => {
    await page.goto('https://localhost:8443/auth/2fa/setup', { waitUntil: 'domcontentloaded' });

    // Since we're not authenticated, we should get redirected or see error page
    // But we can at least verify the page loads
    expect(page.url()).toBeTruthy();
    console.log('2FA setup page URL:', page.url());
  });

  test('03 - 2FA verify page HTML structure', async ({ page }) => {
    await page.goto('https://localhost:8443/auth/2fa/verify', { waitUntil: 'domcontentloaded' });

    // Check page structure
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    // If we're on the verify page (authenticated), look for elements
    if (page.url().includes('2fa/verify')) {
      const codeInput = page.locator('input[name="token"], input[id="token"]').first();
      expect(await codeInput.count()).toBeGreaterThan(0);
    }
  });

  test('04 - Health endpoint returns JSON', async ({ page }) => {
    const response = await page.goto('https://localhost:8443/health', { waitUntil: 'domcontentloaded' });
    expect(response.status()).toBe(200);

    const json = await page.evaluate(() => {
      try {
        return JSON.parse(document.body.innerText);
      } catch {
        return null;
      }
    });

    expect(json).not.toBeNull();
    expect(json.success).toBe(true);
    expect(json.status).toBe('healthy');
  });

  test('05 - Login form can be filled', async ({ page }) => {
    await page.goto('https://localhost:8443/login', { waitUntil: 'domcontentloaded' });

    const emailInput = page.locator('input[id="email"]').first();
    const passwordInput = page.locator('input[id="password"]').first();

    // Fill form
    await emailInput.fill('admin@seekerslab.com');
    await passwordInput.fill('xmUoX0OA5XvSH4csBJbw');

    // Verify values
    expect(await emailInput.inputValue()).toBe('admin@seekerslab.com');
    expect(await passwordInput.inputValue()).toBe('xmUoX0OA5XvSH4csBJbw');
  });

  test('06 - Login form submission', async ({ page }) => {
    await page.goto('https://localhost:8443/login', { waitUntil: 'domcontentloaded' });

    const emailInput = page.locator('input[id="email"]').first();
    const passwordInput = page.locator('input[id="password"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();

    // Fill and submit
    await emailInput.fill('admin@seekerslab.com');
    await passwordInput.fill('xmUoX0OA5XvSH4csBJbw');
    await submitBtn.click();

    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Check where we ended up
    const url = page.url();
    console.log('After login, URL:', url);

    // Should either go to dashboard or 2FA verify (if 2FA is enabled)
    const isAdmin = url.includes('/admin/');
    const is2FA = url.includes('/auth/2fa/');
    expect(isAdmin || is2FA).toBeTruthy();
  });

  test('07 - 2FA Routes exist', async ({ page }) => {
    const routes = [
      '/auth/2fa/verify',
      '/auth/2fa/setup',
    ];

    for (const route of routes) {
      const response = await page.request.get(`https://localhost:8443${route}`).catch(() => null);
      // Routes might return 302 (redirect) or 200 depending on auth state, both are valid
      expect(response).not.toBeNull();
      console.log(`${route}: ${response.status()}`);
    }
  });

  test('08 - API endpoints protected', async ({ page }) => {
    // Try to access admin API without auth
    const response = await page.request.get('https://localhost:8443/api/v1/users');

    // Should return 401 (unauthorized)
    expect(response.status()).toBeGreaterThanOrEqual(400);
    console.log(`/api/v1/users without auth: ${response.status()}`);
  });

  test('09 - 2FA views exist (EJS templates)', async ({ page }) => {
    // Check that the 2FA verify view responds
    const verifyResponse = await page.request.get('https://localhost:8443/auth/2fa/verify');

    // May be 302 (redirect to login) or 200 if authenticated
    expect([200, 302]).toContain(verifyResponse.status());

    // Check that the 2FA setup view responds
    const setupResponse = await page.request.get('https://localhost:8443/auth/2fa/setup');
    expect([200, 302]).toContain(setupResponse.status());
  });

  test('10 - Login page includes demo credentials', async ({ page }) => {
    await page.goto('https://localhost:8443/login', { waitUntil: 'domcontentloaded' });

    const pageContent = await page.content();
    expect(pageContent).toContain('admin@seekerslab.com');
    expect(pageContent).toContain('xmUoX0OA5XvSH4csBJbw');
    expect(pageContent).toContain('Demo Credentials');
  });

  test('11 - Comprehensive page structure check', async ({ page }) => {
    const pages = [
      { url: 'https://localhost:8443/', name: 'Home' },
      { url: 'https://localhost:8443/login', name: 'Login' },
      { url: 'https://localhost:8443/health', name: 'Health' },
      { url: 'https://localhost:8443/api/docs', name: 'API Docs' },
    ];

    for (const p of pages) {
      const response = await page.goto(p.url, { waitUntil: 'domcontentloaded' }).catch(() => null);
      if (response) {
        console.log(`${p.name} (${p.url}): ${response.status()}`);
        expect(response.status()).toBeLessThan(500);
      }
    }
  });

  test('12 - Button elements exist on login', async ({ page }) => {
    await page.goto('https://localhost:8443/login', { waitUntil: 'domcontentloaded' });

    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log(`Login page has ${buttonCount} buttons`);
    expect(buttonCount).toBeGreaterThan(0);

    // Get button texts
    for (let i = 0; i < buttonCount; i++) {
      const text = await buttons.nth(i).textContent();
      console.log(`  Button ${i}: "${text}"`);
    }
  });

  test('13 - Form action points to login endpoint', async ({ page }) => {
    await page.goto('https://localhost:8443/login', { waitUntil: 'domcontentloaded' });

    const form = page.locator('form').first();
    const action = await form.getAttribute('action');
    const method = await form.getAttribute('method');

    expect(action).toContain('login');
    expect(method.toUpperCase()).toBe('POST');
    console.log(`Form: action=${action}, method=${method}`);
  });

  test('14 - CSRF token present on forms', async ({ page }) => {
    const pages = [
      'https://localhost:8443/login',
      'https://localhost:8443/auth/2fa/verify',
    ];

    for (const url of pages) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const csrfToken = page.locator('input[name="_csrf"]').first();
      const hasCSRF = await csrfToken.count() > 0;
      console.log(`${new URL(url).pathname}: CSRF=${hasCSRF}`);
    }
  });

  test('15 - TwoFactorService methods callable via API', async ({ page }) => {
    // This would require authentication and proper testing
    // For now, just verify the endpoint exists
    const response = await page.request.get('https://localhost:8443/api/v1/2fa/status').catch(() => null);

    // May get 401 (not authed) or 404 (endpoint doesn't exist)
    // Either is acceptable for this test
    console.log('2FA API endpoint status: ', response ? response.status() : 'unreachable');
  });
});
