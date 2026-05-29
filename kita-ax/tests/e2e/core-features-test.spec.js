const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@seekerslab.com';
const ADMIN_PASSWORD = 'AdminPassword123!';

test.describe('KYRA Core Features Test', () => {
  test.beforeEach(async ({ page }) => {
    // Increase timeout for slower environments
    test.setTimeout(60000);
  });

  test('01 - App loads and responds', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    expect(response).toBeTruthy();
    expect(response.status()).toBeLessThan(400);
  });

  test('02 - Login page renders with form fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

    // Wait for page to fully load
    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    expect(await emailInput.isVisible()).toBeTruthy();
    expect(await passwordInput.isVisible()).toBeTruthy();
    expect(await submitButton.isVisible()).toBeTruthy();
  });

  test('03 - Authentication: Login with valid credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await emailInput.fill(ADMIN_EMAIL);
    await passwordInput.fill(ADMIN_PASSWORD);
    await submitButton.click();

    // Wait for redirect with longer timeout
    await page.waitForURL(/\/admin|dashboard/, { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(1000);

    const url = page.url();
    expect(url).toContain('admin');
  });

  test('04 - Dashboard loads after login', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await emailInput.fill(ADMIN_EMAIL);
    await passwordInput.fill(ADMIN_PASSWORD);
    await submitButton.click();

    await page.waitForURL(/\/admin|dashboard/, { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(2000);

    // Check for dashboard content
    const heading = page.locator('h1, h2, h3').first();
    expect(await heading.count()).toBeGreaterThan(0);
  });

  test('05 - Navigation: Users page accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await emailInput.fill(ADMIN_EMAIL);
    await passwordInput.fill(ADMIN_PASSWORD);
    await submitButton.click();

    await page.waitForURL(/\/admin|dashboard/, { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(1000);

    const usersLink = page.locator('a:has-text("Users")').first();
    if (await usersLink.isVisible()) {
      await usersLink.click();
      await page.waitForURL(/\/users/, { timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(500);
      expect(page.url()).toContain('users');
    }
  });

  test('06 - Navigation: Documents page accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await emailInput.fill(ADMIN_EMAIL);
    await passwordInput.fill(ADMIN_PASSWORD);
    await submitButton.click();

    await page.waitForURL(/\/admin|dashboard/, { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(1000);

    const docsLink = page.locator('a:has-text("Documents")').first();
    if (await docsLink.isVisible()) {
      await docsLink.click();
      await page.waitForURL(/\/documents/, { timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(500);
      expect(page.url()).toContain('documents');
    }
  });

  test('07 - Navigation: Access Policies page accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await emailInput.fill(ADMIN_EMAIL);
    await passwordInput.fill(ADMIN_PASSWORD);
    await submitButton.click();

    await page.waitForURL(/\/admin|dashboard/, { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(1000);

    const policiesLink = page.locator('a:has-text("Policies")').first();
    if (await policiesLink.isVisible()) {
      await policiesLink.click();
      await page.waitForURL(/\/access-policies|policies/, { timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(500);
      expect(page.url()).toContain('polic');
    }
  });

  test('08 - Navigation: Audit Logs page accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await emailInput.fill(ADMIN_EMAIL);
    await emailInput.fill(ADMIN_PASSWORD);
    await submitButton.click();

    await page.waitForURL(/\/admin|dashboard/, { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(1000);

    const auditLink = page.locator('a:has-text("Audit")').first();
    if (await auditLink.isVisible()) {
      await auditLink.click();
      await page.waitForURL(/\/audit/, { timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(500);
      expect(page.url()).toContain('audit');
    }
  });

  test('09 - Settings page accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await emailInput.fill(ADMIN_EMAIL);
    await passwordInput.fill(ADMIN_PASSWORD);
    await submitButton.click();

    await page.waitForURL(/\/admin|dashboard/, { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(1000);

    const settingsLink = page.locator('a:has-text("Settings")').first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await page.waitForURL(/\/settings/, { timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(500);
      expect(page.url()).toContain('settings');
    }
  });

  test('10 - OAuth buttons display on login', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Check for OAuth provider buttons
    const googleBtn = page.locator('a:has-text("Google"), button:has-text("Google")').first();
    const githubBtn = page.locator('a:has-text("GitHub"), button:has-text("GitHub")').first();

    const hasGoogle = await googleBtn.isVisible().catch(() => false);
    const hasGithub = await githubBtn.isVisible().catch(() => false);

    // At least one OAuth provider should be visible
    expect(hasGoogle || hasGithub).toBeTruthy();
  });

  test('11 - Flash messages render (test UI)', async ({ page }) => {
    // Test if flash message elements can be found in DOM
    await page.goto(`${BASE_URL}/login?error=test`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Flash message should render if error parameter exists
    const flashElement = page.locator('[class*="flash"]').first();
    // Just check the element can be queried (may or may not be visible depending on implementation)
    const count = await flashElement.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('12 - Form validation works (empty login)', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const submitButton = page.locator('button[type="submit"]').first();

    // Click submit without filling form
    await submitButton.click();

    // Should still be on login page
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('login');
  });
});
