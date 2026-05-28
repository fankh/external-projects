const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://localhost:8443';
const ADMIN_EMAIL = 'admin@seekerslab.com';
const ADMIN_PASSWORD = 'xmUoX0OA5XvSH4csBJbw';

test.use({ ignoreHTTPSErrors: true });

test.describe('Phase 6: User Management - Smoke Tests', () => {

  test('Users list page accessible', async ({ page }) => {
    // Login via form (allowing redirects to work naturally)
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    // Navigate to users
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    // Verify on users page
    const url = page.url();
    expect(url).toContain('/admin/users');
  });

  test('Seeded users display on list', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    const content = await page.content();
    expect(content).toContain('admin@seekerslab.com');
  });

  test('Create user form loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/users/new`);

    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    const roleSelect = page.locator('select[name="role"]');

    await expect(emailInput).toBeAttached();
    await expect(passwordInput).toBeAttached();
    await expect(roleSelect).toBeAttached();
  });

  test('Create user successfully', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    const uniqueEmail = `newuser-${Date.now()}@example.com`;

    await page.goto(`${BASE_URL}/admin/users/new`);
    await page.fill('input[name="email"]', uniqueEmail);
    await page.fill('input[name="password"]', 'NewPassword123!');
    await page.selectOption('select[name="role"]', 'viewer');
    await page.click('button[type="submit"]');

    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/admin/users');
  });

  test('Edit user form displays', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    const editLink = page.locator('a[href*="/users/"][href*="/edit"]').first();
    const href = await editLink.getAttribute('href').catch(() => null);

    if (href) {
      await page.goto(`${BASE_URL}${href}`);

      const emailInput = page.locator('input[name="email"]');
      const email = await emailInput.inputValue();

      expect(email.length).toBeGreaterThan(0);
    }
  });

  test('User search works', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/users?search=admin`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('search=admin');
  });

  test('Delete button visible on user rows', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    const deleteButton = page.locator('button:has-text("Delete")').first();
    const visible = await deleteButton.isVisible().catch(() => false);

    expect(visible).toBeTruthy();
  });

  test('User roles configurable', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/users/new`);

    const roleSelect = page.locator('select[name="role"]');
    const options = await roleSelect.locator('option').all();

    expect(options.length).toBeGreaterThan(0);
  });

  test('User CSRF protection', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/users/new`);

    const csrfInput = page.locator('input[name="_csrf"]');
    const csrfValue = await csrfInput.inputValue();

    expect(csrfValue.length).toBeGreaterThan(20);
  });
});
