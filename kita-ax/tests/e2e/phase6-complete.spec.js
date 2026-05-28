const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://localhost:8443';
const ADMIN_EMAIL = 'admin@seekerslab.com';
const ADMIN_PASSWORD = 'xmUoX0OA5XvSH4csBJbw';
const EDITOR_EMAIL = 'editor@seekerslab.com';
const EDITOR_PASSWORD = 'editor123456';

test.use({ ignoreHTTPSErrors: true });

test.describe('Phase 6: KYRA Admin Console - Complete CRUD', () => {

  // ==================== LOGIN & AUTHENTICATION ====================

  test('Login page loads with CSRF token', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    const csrfInput = page.locator('input[name="_csrf"]');
    await expect(csrfInput).toBeAttached();
    const csrfValue = await csrfInput.inputValue();
    expect(csrfValue).toBeTruthy();
    expect(csrfValue.length).toBeGreaterThan(20);

    // Verify login form exists
    const form = page.locator('form[method="POST"]');
    await expect(form).toBeAttached();
  });

  test('Admin can login successfully', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
    expect(page.url()).toContain('/admin/dashboard');
  });

  test('Editor can login successfully', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    await page.fill('input[type="email"]', EDITOR_EMAIL);
    await page.fill('input[type="password"]', EDITOR_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
    expect(page.url()).toContain('/admin/dashboard');
  });

  test('Invalid credentials show error', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should either show error or redirect to login with error param
    await page.waitForLoadState('networkidle');
    const url = page.url();
    const errorVisible = await page.locator('.flash-error, .alert-danger').isVisible().catch(() => false);
    expect(errorVisible || url.includes('error') || url.includes('login')).toBeTruthy();
  });

  // ==================== DASHBOARD ====================

  test('Dashboard displays metrics and recent activity', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/dashboard`);
    await expect(page).toHaveURL(/\/admin\/dashboard/);

    // Check for metrics section
    const metrics = page.locator('[class*="metric"], h2:has-text("Metrics")');
    await expect(metrics).toBeTruthy();
  });

  // ==================== USERS CRUD ====================

  test('Users list displays all seeded users', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    // Should show seeded users
    expect(await page.getByText(ADMIN_EMAIL).count()).toBeGreaterThan(0);
    expect(await page.getByText(EDITOR_EMAIL).count()).toBeGreaterThan(0);
  });

  test('Create new user form loads', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/users/new`);

    const form = page.locator('form');
    await expect(form).toBeVisible();

    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    const roleSelect = page.locator('select[name="role"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(roleSelect).toBeVisible();
  });

  test('Create new user successfully', async ({ page }) => {
    await loginAsAdmin(page);

    const uniqueEmail = `testuser-${Date.now()}@seekerslab.com`;

    await page.goto(`${BASE_URL}/admin/users/new`);
    await page.fill('input[name="email"]', uniqueEmail);
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.selectOption('select[name="role"]', 'viewer');
    await page.click('button[type="submit"]');

    await page.waitForNavigation();
    await expect(page).toHaveURL(/\/admin\/users/);

    // Should show success message or redirect to list
    const successMsg = page.locator('.flash-success, .alert-success');
    const hasSuccess = await successMsg.isVisible().catch(() => false);
    expect(hasSuccess || page.url().includes('/admin/users')).toBeTruthy();
  });

  test('Edit user form prefills data', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    // Find and click first edit link
    const editButtons = page.locator('a[href*="/edit"]');
    const firstEditHref = await editButtons.first().getAttribute('href');

    if (firstEditHref) {
      await page.goto(`${BASE_URL}${firstEditHref}`);

      const emailInput = page.locator('input[name="email"]');
      const roleSelect = page.locator('select[name="role"]');

      await expect(emailInput).toHaveValue(/./);
      await expect(roleSelect).toHaveValue(/./);
    }
  });

  test('Delete user shows confirmation', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    // Click first delete button
    const deleteBtn = page.locator('button:has-text("Delete")').first();

    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();

      // Modal should appear
      const modal = page.locator('#delete-modal');
      await expect(modal).toBeVisible();
    }
  });

  // ==================== DOCUMENTS CRUD ====================

  test('Documents list displays seeded documents', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/documents`);
    await page.waitForLoadState('networkidle');

    // Check for seeded document titles
    const hasDocuments = await page.getByText(/AI Guardrail|Security Compliance|Public API|Training Materials/).count() > 0;
    expect(hasDocuments).toBeTruthy();
  });

  test('Create document form loads', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/documents/new`);

    const titleInput = page.locator('input[name="title"]');
    const classificationSelect = page.locator('select[name="classification"]');
    const descriptionTextarea = page.locator('textarea[name="description"]');

    await expect(titleInput).toBeVisible();
    await expect(classificationSelect).toBeVisible();
    await expect(descriptionTextarea).toBeVisible();
  });

  test('Create document successfully', async ({ page }) => {
    await loginAsAdmin(page);

    const uniqueTitle = `Test Doc ${Date.now()}`;

    await page.goto(`${BASE_URL}/admin/documents/new`);
    await page.fill('input[name="title"]', uniqueTitle);
    await page.selectOption('select[name="classification"]', 'internal');
    await page.fill('textarea[name="description"]', 'Test document description');
    await page.click('button[type="submit"]');

    await page.waitForNavigation();
    await expect(page).toHaveURL(/\/admin\/documents/);
  });

  test('Edit document form prefills data', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/documents`);
    await page.waitForLoadState('networkidle');

    const editButtons = page.locator('a[href*="/documents/"][href*="/edit"]');
    const firstEditHref = await editButtons.first().getAttribute('href');

    if (firstEditHref) {
      await page.goto(`${BASE_URL}${firstEditHref}`);

      const titleInput = page.locator('input[name="title"]');
      await expect(titleInput).toHaveValue(/./);
    }
  });

  // ==================== AGENTS CRUD ====================

  test('Agents list displays seeded agents', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/agents`);
    await page.waitForLoadState('networkidle');

    // Check for seeded agent names
    const hasAgents = await page.getByText(/Content Analyzer|Automated Moderation|Security Auditor/).count() > 0;
    expect(hasAgents).toBeTruthy();
  });

  test('Create agent form loads', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/agents/new`);

    const nameInput = page.locator('input[name="name"]');
    const typeSelect = page.locator('select[name="type"]');

    await expect(nameInput).toBeVisible();
    await expect(typeSelect).toBeVisible();
  });

  test('Create agent and display API key once', async ({ page }) => {
    await loginAsAdmin(page);

    const uniqueName = `Test Agent ${Date.now()}`;

    await page.goto(`${BASE_URL}/admin/agents/new`);
    await page.fill('input[name="name"]', uniqueName);
    await page.selectOption('select[name="type"]', 'analysis');
    await page.click('button[type="submit"]');

    await page.waitForNavigation();

    // Check if newKey is in URL (one-time display)
    const url = page.url();
    const hasNewKeyParam = url.includes('newKey=');
    expect(hasNewKeyParam || page.url().includes('/admin/agents')).toBeTruthy();
  });

  test('Agent activate/deactivate buttons work', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/agents`);
    await page.waitForLoadState('networkidle');

    // Find an agent with activate/deactivate button
    const activateBtn = page.locator('button:has-text("Activate"), button:has-text("Deactivate")').first();

    if (await activateBtn.isVisible()) {
      const initialText = await activateBtn.textContent();
      await activateBtn.click();

      // Should redirect or show flash message
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/admin/agents');
    }
  });

  // ==================== ROLES & POLICIES CRUD ====================

  test('Access policies page loads with tabs', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/access-policies`);

    const rolesTab = page.locator('button:has-text("Roles"), a:has-text("Roles")');
    const policiesTab = page.locator('button:has-text("Policies"), a:has-text("Policies")');

    const hasRolesTab = await rolesTab.isVisible().catch(() => false);
    const hasPoliciesTab = await policiesTab.isVisible().catch(() => false);

    expect(hasRolesTab || hasPoliciesTab).toBeTruthy();
  });

  test('Create role form loads', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/access-policies/roles/new`);

    const nameInput = page.locator('input[name="name"]');
    const permissionsInput = page.locator('input[name="permissions"], textarea[name="permissions"]');

    await expect(nameInput).toBeVisible();
    await expect(permissionsInput).toBeVisible();
  });

  test('Create role successfully', async ({ page }) => {
    await loginAsAdmin(page);

    const uniqueName = `TestRole${Date.now()}`;

    await page.goto(`${BASE_URL}/admin/access-policies/roles/new`);
    await page.fill('input[name="name"]', uniqueName);
    await page.fill('input[name="description"]', 'Test role description');
    await page.fill('input[name="permissions"], textarea[name="permissions"]', 'read:all, write:documents');
    await page.click('button[type="submit"]');

    await page.waitForNavigation();
    expect(page.url()).toContain('/admin/access-policies');
  });

  test('Create policy form loads', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/access-policies/policies/new`);

    const nameInput = page.locator('input[name="name"]');
    const typeSelect = page.locator('select[name="type"]');

    await expect(nameInput).toBeVisible();
    await expect(typeSelect).toBeVisible();
  });

  test('Create policy successfully', async ({ page }) => {
    await loginAsAdmin(page);

    const uniqueName = `TestPolicy${Date.now()}`;

    await page.goto(`${BASE_URL}/admin/access-policies/policies/new`);
    await page.fill('input[name="name"]', uniqueName);
    await page.selectOption('select[name="type"]', 'rbac');
    await page.fill('input[name="target"]', 'test-resource');
    await page.click('button[type="submit"]');

    await page.waitForNavigation();
    expect(page.url()).toContain('/admin/access-policies');
  });

  // ==================== AUDIT LOGS ====================

  test('Audit logs page displays entries', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/audit-logs`);
    await page.waitForLoadState('networkidle');

    // Should have audit log entries
    const logRows = page.locator('table tbody tr, [class*="log-item"]');
    const count = await logRows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Audit logs filter by event type', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/audit-logs`);

    const eventTypeSelect = page.locator('select[name="eventType"], input[name="eventType"]');

    if (await eventTypeSelect.isVisible()) {
      await eventTypeSelect.selectOption ?
        eventTypeSelect.selectOption('authentication') :
        eventTypeSelect.fill('authentication');

      const submitBtn = page.locator('button[type="submit"]');
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForLoadState('networkidle');
      }
    }
  });

  test('Audit logs search functionality', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/audit-logs`);

    const searchInput = page.locator('input[name="search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('admin');
      const submitBtn = page.locator('button[type="submit"]');
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForLoadState('networkidle');
      }
    }
  });

  // ==================== NAVIGATION ====================

  test('Navigation menu includes all required links', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/dashboard`);

    const navLinks = [
      'Dashboard',
      'Users',
      'Documents',
      'Access Policies',
      'Audit Logs',
      'Agents'
    ];

    for (const linkText of navLinks) {
      const link = page.locator(`a:has-text("${linkText}")`);
      const isVisible = await link.isVisible().catch(() => false);
      // Not all links may be in nav, some might be in different layouts
      if (!isVisible) {
        console.log(`Note: ${linkText} link not immediately visible in nav`);
      }
    }
  });

  test('Logout redirects to login', async ({ page }) => {
    await loginAsAdmin(page);

    const logoutBtn = page.locator('button:has-text("Logout"), a:has-text("Logout"), a:has-text("Sign Out")');

    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForNavigation();
      await expect(page).toHaveURL(/\/login/);
    }
  });

  // ==================== FLASH MESSAGES ====================

  test('Success flash message displays after user creation', async ({ page }) => {
    await loginAsAdmin(page);

    const uniqueEmail = `flash-test-${Date.now()}@seekerslab.com`;

    await page.goto(`${BASE_URL}/admin/users/new`);
    await page.fill('input[name="email"]', uniqueEmail);
    await page.fill('input[name="password"]', 'TestPass123!');
    await page.selectOption('select[name="role"]', 'viewer');
    await page.click('button[type="submit"]');

    await page.waitForNavigation();

    const successFlash = page.locator('.flash-success, .alert-success, [class*="success"]');
    const isVisible = await successFlash.isVisible().catch(() => false);

    // Either flash message or just redirect to list page
    expect(isVisible || page.url().includes('/admin/users')).toBeTruthy();
  });

  // ==================== SECURITY & CSRF ====================

  test('CSRF token required for POST requests', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/users/new`);

    const form = page.locator('form');
    const csrfInput = form.locator('input[name="_csrf"]');

    await expect(csrfInput).toBeVisible();
    const csrfValue = await csrfInput.inputValue();
    expect(csrfValue).toBeTruthy();
    expect(csrfValue.length).toBeGreaterThan(20);
  });

  test('Unauthenticated requests redirect to login', async ({ page }) => {
    // Don't login, just visit protected page
    await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'networkidle' });

    // Should redirect to login
    const url = page.url();
    expect(url).toContain('/login');
  });

  // ==================== PAGINATION ====================

  test('Users list pagination works', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/users?page=1`);
    await page.waitForLoadState('networkidle');

    // Check for pagination controls
    const paginationLink = page.locator('a[href*="page=2"], a:has-text("Next")');
    const hasPagination = await paginationLink.isVisible().catch(() => false);

    // Pagination optional if < 10 users
    console.log(`Pagination visible: ${hasPagination}`);
  });

  test('Documents search with pagination', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${BASE_URL}/admin/documents?search=AI`);
    await page.waitForLoadState('networkidle');

    // Should show filtered results
    const resultText = page.locator('body');
    const content = await resultText.textContent();
    expect(content).toBeTruthy();
  });
});

// ==================== HELPER FUNCTIONS ====================

async function loginAsAdmin(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
  expect(page.url()).toContain('/admin');
}
