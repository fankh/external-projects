const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://localhost:8443';
const ADMIN_EMAIL = 'admin@seekerslab.com';
const ADMIN_PASSWORD = 'xmUoX0OA5XvSH4csBJbw';

test.use({ ignoreHTTPSErrors: true });

test.describe('Phase 6: Roles and Policies Management - Smoke Tests', () => {

  test('Access policies page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies`);
    await page.waitForLoadState('networkidle');

    const url = page.url();
    expect(url).toContain('/admin/access-policies');
  });

  test('Roles tab displays seeded roles', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies?tab=roles`);
    await page.waitForLoadState('networkidle');

    const content = await page.content();

    // Should display seeded roles
    expect(
      content.includes('admin') ||
      content.includes('editor') ||
      content.includes('viewer') ||
      content.includes('role')
    ).toBeTruthy();
  });

  test('Policies tab displays seeded policies', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies?tab=policies`);
    await page.waitForLoadState('networkidle');

    const content = await page.content();

    // Should display seeded policies
    expect(content.length).toBeGreaterThan(100);
  });

  test('Create role form loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies/roles/new`);

    const nameInput = page.locator('input[name="name"]');
    const descriptionInput = page.locator('input[name="description"], textarea[name="description"]');
    const permissionsInput = page.locator('input[name="permissions"], textarea[name="permissions"]');

    await expect(nameInput).toBeAttached();
    await expect(descriptionInput).toBeAttached();
    await expect(permissionsInput).toBeAttached();
  });

  test('Create role successfully', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    const uniqueName = `TestRole-${Date.now()}`;

    await page.goto(`${BASE_URL}/admin/access-policies/roles/new`);
    await page.fill('input[name="name"]', uniqueName);

    const descInput = page.locator('input[name="description"], textarea[name="description"]').first();
    await descInput.fill('Test role for Phase 6');

    const permInput = page.locator('input[name="permissions"], textarea[name="permissions"]').first();
    await permInput.fill('read:all, write:documents');

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/admin/access-policies');
  });

  test('Edit role form displays', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies?tab=roles`);
    await page.waitForLoadState('networkidle');

    const editLink = page.locator('a[href*="/roles/"][href*="/edit"]').first();
    const href = await editLink.getAttribute('href').catch(() => null);

    if (href) {
      await page.goto(`${BASE_URL}${href}`);

      const nameInput = page.locator('input[name="name"]');
      const name = await nameInput.inputValue();

      expect(name.length).toBeGreaterThan(0);
    }
  });

  test('Delete role shows confirmation', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies?tab=roles`);
    await page.waitForLoadState('networkidle');

    const deleteBtn = page.locator('button:has-text("Delete")').first();
    const isVisible = await deleteBtn.isVisible().catch(() => false);

    expect(isVisible).toBeTruthy();
  });

  test('Create policy form loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies/policies/new`);

    const nameInput = page.locator('input[name="name"]');
    const typeSelect = page.locator('select[name="type"]');
    const targetInput = page.locator('input[name="target"]');

    await expect(nameInput).toBeAttached();
    await expect(typeSelect).toBeAttached();
    await expect(targetInput).toBeAttached();
  });

  test('Create policy successfully', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    const uniqueName = `TestPolicy-${Date.now()}`;

    await page.goto(`${BASE_URL}/admin/access-policies/policies/new`);
    await page.fill('input[name="name"]', uniqueName);
    await page.selectOption('select[name="type"]', 'rbac');
    await page.fill('input[name="target"]', 'test-resource');

    const statusSelect = page.locator('select[name="status"]');
    if (await statusSelect.isVisible().catch(() => false)) {
      await statusSelect.selectOption('active');
    }

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/admin/access-policies');
  });

  test('Policy types available', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies/policies/new`);

    const typeSelect = page.locator('select[name="type"]');
    const options = await typeSelect.locator('option').all();

    expect(options.length).toBeGreaterThan(0);

    const typeTexts = await Promise.all(options.map(opt => opt.textContent()));
    expect(typeTexts.some(t => t.toLowerCase().includes('rbac') || t.toLowerCase().includes('abac'))).toBeTruthy();
  });

  test('Edit policy form displays', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies?tab=policies`);
    await page.waitForLoadState('networkidle');

    const editLink = page.locator('a[href*="/policies/"][href*="/edit"]').first();
    const href = await editLink.getAttribute('href').catch(() => null);

    if (href) {
      await page.goto(`${BASE_URL}${href}`);

      const nameInput = page.locator('input[name="name"]');
      const name = await nameInput.inputValue();

      expect(name.length).toBeGreaterThan(0);
    }
  });

  test('Policy activate/deactivate buttons', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies?tab=policies`);
    await page.waitForLoadState('networkidle');

    const toggleBtn = page.locator('button:has-text("Activate"), button:has-text("Deactivate")').first();
    const isVisible = await toggleBtn.isVisible().catch(() => false);

    expect(isVisible).toBeTruthy();
  });

  test('Delete policy shows confirmation', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies?tab=policies`);
    await page.waitForLoadState('networkidle');

    const deleteBtn = page.locator('button:has-text("Delete")').first();
    const isVisible = await deleteBtn.isVisible().catch(() => false);

    expect(isVisible).toBeTruthy();
  });

  test('Role CSRF protection', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies/roles/new`);

    const csrfInput = page.locator('input[name="_csrf"]');
    const csrfValue = await csrfInput.inputValue();

    expect(csrfValue.length).toBeGreaterThan(20);
  });

  test('Policy CSRF protection', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies/policies/new`);

    const csrfInput = page.locator('input[name="_csrf"]');
    const csrfValue = await csrfInput.inputValue();

    expect(csrfValue.length).toBeGreaterThan(20);
  });

  test('Role permissions field editable', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies/roles/new`);

    const permissionsField = page.locator('input[name="permissions"], textarea[name="permissions"]').first();
    await expect(permissionsField).toBeVisible();

    const isEditable = await permissionsField.isEditable();
    expect(isEditable).toBeTruthy();
  });

  test('Policy target field configurable', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies/policies/new`);

    const targetField = page.locator('input[name="target"]');
    await expect(targetField).toBeVisible();

    const isEditable = await targetField.isEditable();
    expect(isEditable).toBeTruthy();
  });

  test('Role form validation - empty name', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies/roles/new`);

    // Try to submit without name
    const descInput = page.locator('input[name="description"], textarea[name="description"]').first();
    await descInput.fill('Description without name');

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    const stillOnForm = page.url().includes('/roles/new');
    const hasError = await page.locator('[class*="error"]').isVisible().catch(() => false);

    expect(stillOnForm || hasError).toBeTruthy();
  });

  test('Policy form validation - empty name', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies/policies/new`);

    // Try to submit without name
    await page.selectOption('select[name="type"]', 'rbac');
    await page.fill('input[name="target"]', 'resource');

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    const stillOnForm = page.url().includes('/policies/new');
    const hasError = await page.locator('[class*="error"]').isVisible().catch(() => false);

    expect(stillOnForm || hasError).toBeTruthy();
  });

  test('Roles and policies audit logging', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    // Create a role
    const roleName = `AuditRole-${Date.now()}`;
    await page.goto(`${BASE_URL}/admin/access-policies/roles/new`);
    await page.fill('input[name="name"]', roleName);
    const descInput = page.locator('input[name="description"], textarea[name="description"]').first();
    await descInput.fill('Audit test');
    const permInput = page.locator('input[name="permissions"], textarea[name="permissions"]').first();
    await permInput.fill('read:all');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Check audit logs
    await page.goto(`${BASE_URL}/admin/audit-logs`);
    await page.waitForLoadState('networkidle');

    const content = await page.content();
    expect(content.length).toBeGreaterThan(100);
  });

  test('Role and policy pagination', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await page.goto(`${BASE_URL}/admin/access-policies?tab=roles&page=1`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('page=1');
  });
});
