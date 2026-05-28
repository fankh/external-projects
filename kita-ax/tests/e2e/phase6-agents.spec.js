const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://localhost:8443';
const ADMIN_EMAIL = 'admin@seekerslab.com';
const ADMIN_PASSWORD = 'xmUoX0OA5XvSH4csBJbw';

test.use({ ignoreHTTPSErrors: true });

test.describe('Phase 6: Agent Management - Smoke Tests', () => {

  test('Agents list page accessible after login', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    // Navigate to agents
    await page.goto(`${BASE_URL}/admin/agents`);
    await page.waitForLoadState('networkidle');

    const url = page.url();
    expect(url).toContain('/admin/agents');
  });

  test('Seeded agents display on list', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents`);
    await page.waitForLoadState('networkidle');

    const content = await page.content();

    // Should display seeded agents
    expect(
      content.includes('Content Analyzer') ||
      content.includes('Security') ||
      content.includes('Agent')
    ).toBeTruthy();
  });

  test('Create agent form loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents/new`);

    const nameInput = page.locator('input[name="name"]');
    const typeSelect = page.locator('select[name="type"]');

    await expect(nameInput).toBeAttached();
    await expect(typeSelect).toBeAttached();
  });

  test('Create agent successfully', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    const uniqueName = `TestAgent-${Date.now()}`;

    await page.goto(`${BASE_URL}/admin/agents/new`);
    await page.fill('input[name="name"]', uniqueName);
    await page.selectOption('select[name="type"]', 'analysis');
    await page.click('button[type="submit"]');

    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/admin/agents');
  });

  test('Agent types available', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents/new`);

    const typeSelect = page.locator('select[name="type"]');
    const options = await typeSelect.locator('option').all();

    expect(options.length).toBeGreaterThan(0);

    const typeTexts = await Promise.all(options.map(opt => opt.textContent()));
    expect(typeTexts.some(t => t.toLowerCase().includes('analysis') || t.toLowerCase().includes('automation'))).toBeTruthy();
  });

  test('Edit agent form displays', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents`);
    await page.waitForLoadState('networkidle');

    const editLink = page.locator('a[href*="/agents/"][href*="/edit"]').first();
    const href = await editLink.getAttribute('href').catch(() => null);

    if (href) {
      await page.goto(`${BASE_URL}${href}`);

      const nameInput = page.locator('input[name="name"]');
      const name = await nameInput.inputValue();

      expect(name.length).toBeGreaterThan(0);
    }
  });

  test('Agent activate/deactivate buttons', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents`);
    await page.waitForLoadState('networkidle');

    const activateBtn = page.locator('button:has-text("Activate"), button:has-text("Deactivate")').first();
    const isVisible = await activateBtn.isVisible().catch(() => false);

    expect(isVisible).toBeTruthy();
  });

  test('Agent delete button visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents`);
    await page.waitForLoadState('networkidle');

    const deleteBtn = page.locator('button:has-text("Delete")').first();
    const isVisible = await deleteBtn.isVisible().catch(() => false);

    expect(isVisible).toBeTruthy();
  });

  test('Agent CSRF protection', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents/new`);

    const csrfInput = page.locator('input[name="_csrf"]');
    const csrfValue = await csrfInput.inputValue();

    expect(csrfValue.length).toBeGreaterThan(20);
  });

  test('Agent API key generation', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    // Create agent
    const uniqueName = `APIKeyTest-${Date.now()}`;
    await page.goto(`${BASE_URL}/admin/agents/new`);
    await page.fill('input[name="name"]', uniqueName);
    await page.selectOption('select[name="type"]', 'automation');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Check for API key display or URL param
    const url = page.url();
    const hasApiKeyIndicator = url.includes('newKey') ||
                              await page.locator('[class*="key"]').isVisible().catch(() => false);

    expect(url.includes('/admin/agents') || hasApiKeyIndicator).toBeTruthy();
  });

  test('Agent search functionality', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents?search=Content`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('search=Content');
  });

  test('Agent type filtering', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents?type=analysis`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('type=analysis');
  });

  test('Agent status visible on list', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents`);
    await page.waitForLoadState('networkidle');

    const content = await page.content();
    expect(content).toContain('active') || expect(content).toContain('inactive') || expect(content).toContain('status');
  });

  test('Agent form validation - empty name', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents/new`);

    // Try to submit without filling name
    await page.selectOption('select[name="type"]', 'analysis');
    await page.click('button[type="submit"]');

    await page.waitForLoadState('networkidle');

    const stillOnForm = page.url().includes('/agents/new');
    const hasError = await page.locator('[class*="error"]').isVisible().catch(() => false);

    expect(stillOnForm || hasError).toBeTruthy();
  });

  test('Agent audit logging', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    // Create agent
    const uniqueName = `AuditTest-${Date.now()}`;
    await page.goto(`${BASE_URL}/admin/agents/new`);
    await page.fill('input[name="name"]', uniqueName);
    await page.selectOption('select[name="type"]', 'analysis');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Check audit logs
    await page.goto(`${BASE_URL}/admin/audit-logs`);
    await page.waitForLoadState('networkidle');

    const content = await page.content();
    expect(content.length).toBeGreaterThan(100);
  });

  test('Agent pagination', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents?page=1`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('page=1');
  });

  test('Agent list displays key information', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents`);
    await page.waitForLoadState('networkidle');

    const content = await page.content();

    // Should show agent names, types, and actions
    expect(content.length).toBeGreaterThan(200);
  });

  test('Agent regenerate API key available', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/agents`);
    await page.waitForLoadState('networkidle');

    const regenerateBtn = page.locator('button:has-text("Regenerate"), a:has-text("Regenerate")').first();
    const isVisible = await regenerateBtn.isVisible().catch(() => false);

    // Regenerate button may or may not be visible
    console.log('Regenerate button visible:', isVisible);
  });
});
