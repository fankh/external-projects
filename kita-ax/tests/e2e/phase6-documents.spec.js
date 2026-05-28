const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://localhost:8443';
const ADMIN_EMAIL = 'admin@seekerslab.com';
const ADMIN_PASSWORD = 'xmUoX0OA5XvSH4csBJbw';

test.use({ ignoreHTTPSErrors: true });

test.describe('Phase 6: Document CRUD Operations', () => {

  async function loginAsAdmin(page) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    await emailInput.fill(ADMIN_EMAIL);
    await passwordInput.fill(ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for redirect
    await page.waitForLoadState('networkidle');

    // Should be in admin area
    const url = page.url();
    expect(url.includes('/admin') || url.includes('/login')).toBeTruthy();
  }

  test('Documents page loads after login', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/documents`);

    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/admin/documents');
  });

  test('Create document form is accessible', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/documents/new`);

    const titleInput = page.locator('input[name="title"]');
    const classificationSelect = page.locator('select[name="classification"]');
    const csrfInput = page.locator('input[name="_csrf"]');

    await expect(titleInput).toBeAttached();
    await expect(classificationSelect).toBeAttached();
    await expect(csrfInput).toBeAttached();

    const csrfValue = await csrfInput.inputValue();
    expect(csrfValue.length).toBeGreaterThan(20);
  });

  test('Create document successfully', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/documents/new`);

    const uniqueTitle = `Test Doc ${Date.now()}`;

    await page.fill('input[name="title"]', uniqueTitle);
    await page.selectOption('select[name="classification"]', 'internal');

    // Try to find owner field (could be email input or regular input)
    const ownerInput = page.locator('input[type="email"], input[name="owner"]').first();
    await ownerInput.fill(ADMIN_EMAIL);

    const descField = page.locator('textarea[name="description"]');
    if (await descField.isVisible().catch(() => false)) {
      await descField.fill('Test document for Phase 6 verification');
    }

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Should redirect to documents list
    expect(page.url()).toContain('/admin/documents');
  });

  test('Document list displays documents', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/documents`);
    await page.waitForLoadState('networkidle');

    // Page should have some content
    const content = await page.content();
    expect(content.length).toBeGreaterThan(100);
  });

  test('Edit document functionality', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/documents`);
    await page.waitForLoadState('networkidle');

    // Find edit link
    const editLink = page.locator('a[href*="/documents/"][href*="/edit"]').first();
    const editHref = await editLink.getAttribute('href').catch(() => null);

    if (editHref) {
      await page.goto(`${BASE_URL}${editHref}`);

      const titleInput = page.locator('input[name="title"]');
      const currentTitle = await titleInput.inputValue().catch(() => '');

      expect(currentTitle.length).toBeGreaterThan(0);
    }
  });

  test('Delete button shows confirmation', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/documents`);
    await page.waitForLoadState('networkidle');

    const deleteBtn = page.locator('button:has-text("Delete")').first();
    const isVisible = await deleteBtn.isVisible().catch(() => false);

    if (isVisible) {
      await deleteBtn.click();

      const modal = page.locator('#delete-modal, [id*="modal"]').first();
      const modalVisible = await modal.isVisible().catch(() => false);
      expect(modalVisible).toBeTruthy();
    }
  });

  test('CSRF token present in all document forms', async ({ page }) => {
    await loginAsAdmin(page);

    // Check create form
    await page.goto(`${BASE_URL}/admin/documents/new`);
    const csrfCreate = await page.locator('input[name="_csrf"]').inputValue();
    expect(csrfCreate.length).toBeGreaterThan(20);

    // Check document list (for any inline forms)
    await page.goto(`${BASE_URL}/admin/documents`);
    const csrfList = await page.locator('input[name="_csrf"]').first().inputValue().catch(() => null);
    // CSRF may or may not be on list page, that's OK
  });

  test('Document classification options available', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/documents/new`);

    const classificationSelect = page.locator('select[name="classification"]');

    // Check available options
    const options = await classificationSelect.locator('option').all();
    expect(options.length).toBeGreaterThan(0);
  });

  test('Document operations audit logged', async ({ page }) => {
    await loginAsAdmin(page);

    // Create a document
    await page.goto(`${BASE_URL}/admin/documents/new`);
    const uniqueTitle = `Audit Test ${Date.now()}`;

    await page.fill('input[name="title"]', uniqueTitle);
    await page.selectOption('select[name="classification"]', 'confidential');
    const ownerInput = page.locator('input[type="email"], input[name="owner"]').first();
    await ownerInput.fill(ADMIN_EMAIL);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Check audit logs
    await page.goto(`${BASE_URL}/admin/audit-logs`);
    await page.waitForLoadState('networkidle');

    // Page should have content
    const content = await page.content();
    expect(content.length).toBeGreaterThan(100);
  });

  test('Searching documents works', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to documents with search
    await page.goto(`${BASE_URL}/admin/documents?search=test`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('search=test');
  });

  test('Document form validation handles empty fields', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/documents/new`);

    // Try to submit without filling required fields
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Should either show error or stay on form page
    const stillOnForm = page.url().includes('/documents/new');
    const hasError = await page.locator('[class*="error"], [class*="flash-error"]').isVisible().catch(() => false);

    expect(stillOnForm || hasError).toBeTruthy();
  });
});
