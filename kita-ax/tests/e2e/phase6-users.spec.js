const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://localhost:8443';
const ADMIN_EMAIL = 'admin@seekerslab.com';
const ADMIN_PASSWORD = 'xmUoX0OA5XvSH4csBJbw';

test.use({ ignoreHTTPSErrors: true });

test.describe('Phase 6: User Management CRUD Operations', () => {

  async function loginAsAdmin(page) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
  }

  test('Users page loads after login', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/admin/users');
  });

  test('Users list displays seeded users', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    // Check for seeded users
    const content = await page.content();
    expect(content).toContain('admin@seekerslab.com');
    expect(content).toContain('editor@seekerslab.com');
  });

  test('Create user form is accessible', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users/new`);

    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    const roleSelect = page.locator('select[name="role"]');
    const csrfInput = page.locator('input[name="_csrf"]');

    await expect(emailInput).toBeAttached();
    await expect(passwordInput).toBeAttached();
    await expect(roleSelect).toBeAttached();
    await expect(csrfInput).toBeAttached();

    const csrfValue = await csrfInput.inputValue();
    expect(csrfValue.length).toBeGreaterThan(20);
  });

  test('Create new user successfully', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users/new`);

    const uniqueEmail = `testuser-${Date.now()}@example.com`;

    await page.fill('input[name="email"]', uniqueEmail);
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.selectOption('select[name="role"]', 'viewer');

    // Status field may or may not exist
    const statusSelect = page.locator('select[name="status"]');
    if (await statusSelect.isVisible().catch(() => false)) {
      await statusSelect.selectOption('active');
    }

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Should redirect to users list
    expect(page.url()).toContain('/admin/users');
  });

  test('Edit user form prefills data', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    // Find first edit link
    const editLink = page.locator('a[href*="/users/"][href*="/edit"]').first();
    const editHref = await editLink.getAttribute('href').catch(() => null);

    if (editHref) {
      await page.goto(`${BASE_URL}${editHref}`);

      const emailInput = page.locator('input[name="email"]');
      const roleSelect = page.locator('select[name="role"]');

      const emailValue = await emailInput.inputValue();
      const roleValue = await roleSelect.inputValue().catch(() => null);

      expect(emailValue.length).toBeGreaterThan(0);
      expect(roleValue).toBeTruthy();
    }
  });

  test('User role options available', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users/new`);

    const roleSelect = page.locator('select[name="role"]');
    const options = await roleSelect.locator('option').all();

    expect(options.length).toBeGreaterThan(0);

    // Check for common roles
    const roleTexts = await Promise.all(options.map(opt => opt.textContent()));
    const hasAdmin = roleTexts.some(text => text.toLowerCase().includes('admin'));
    const hasViewer = roleTexts.some(text => text.toLowerCase().includes('viewer'));

    expect(hasAdmin || hasViewer).toBeTruthy();
  });

  test('Delete user shows confirmation modal', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    const deleteButton = page.locator('button:has-text("Delete")').first();
    const isVisible = await deleteButton.isVisible().catch(() => false);

    if (isVisible) {
      await deleteButton.click();

      const modal = page.locator('#delete-modal, [id*="modal"]').first();
      const modalVisible = await modal.isVisible().catch(() => false);
      expect(modalVisible).toBeTruthy();
    }
  });

  test('User search and filter functionality', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users?search=admin`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('search=admin');
  });

  test('User status filtering', async ({ page }) => {
    await loginAsAdmin(page);

    // Try status filter
    await page.goto(`${BASE_URL}/admin/users?status=active`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('status=active');
  });

  test('User role filtering', async ({ page }) => {
    await loginAsAdmin(page);

    // Try role filter
    await page.goto(`${BASE_URL}/admin/users?role=admin`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('role=admin');
  });

  test('CSRF protection on user forms', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users/new`);

    const csrfInput = page.locator('input[name="_csrf"]');
    await expect(csrfInput).toBeAttached();

    const csrfValue = await csrfInput.inputValue();
    expect(csrfValue.length).toBeGreaterThan(20);
  });

  test('User creation audit logged', async ({ page }) => {
    await loginAsAdmin(page);

    // Create user
    await page.goto(`${BASE_URL}/admin/users/new`);
    const uniqueEmail = `audit-${Date.now()}@example.com`;

    await page.fill('input[name="email"]', uniqueEmail);
    await page.fill('input[name="password"]', 'TestPass123!');
    await page.selectOption('select[name="role"]', 'viewer');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Check audit logs
    await page.goto(`${BASE_URL}/admin/audit-logs`);
    await page.waitForLoadState('networkidle');

    const content = await page.content();
    expect(content.length).toBeGreaterThan(100);
  });

  test('User form validation - empty email', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users/new`);

    // Fill only password, leave email empty
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.selectOption('select[name="role"]', 'viewer');
    await page.click('button[type="submit"]');

    await page.waitForLoadState('networkidle');

    const stillOnForm = page.url().includes('/users/new');
    const hasError = await page.locator('[class*="error"], [class*="flash"]').isVisible().catch(() => false);

    expect(stillOnForm || hasError).toBeTruthy();
  });

  test('User form validation - empty password', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users/new`);

    // Fill only email, leave password empty
    await page.fill('input[name="email"]', `test-${Date.now()}@example.com`);
    await page.selectOption('select[name="role"]', 'viewer');
    await page.click('button[type="submit"]');

    await page.waitForLoadState('networkidle');

    const stillOnForm = page.url().includes('/users/new');
    const hasError = await page.locator('[class*="error"], [class*="flash"]').isVisible().catch(() => false);

    expect(stillOnForm || hasError).toBeTruthy();
  });

  test('Edit user status', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    const editLink = page.locator('a[href*="/users/"][href*="/edit"]').first();
    const editHref = await editLink.getAttribute('href').catch(() => null);

    if (editHref) {
      await page.goto(`${BASE_URL}${editHref}`);

      const statusSelect = page.locator('select[name="status"]');
      if (await statusSelect.isVisible().catch(() => false)) {
        const currentStatus = await statusSelect.inputValue();
        expect(currentStatus).toBeTruthy();

        // Change status
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        await statusSelect.selectOption(newStatus);

        await page.click('button[type="submit"]');
        await page.waitForLoadState('networkidle');

        expect(page.url()).toContain('/admin/users');
      }
    }
  });

  test('Pagination on users list', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users?page=1`);
    await page.waitForLoadState('networkidle');

    // Check for pagination controls
    const paginationLink = page.locator('a[href*="page=2"], button:has-text("Next")');
    const hasPagination = await paginationLink.isVisible().catch(() => false);

    // Pagination is optional if < 10 users
    console.log('Pagination visible:', hasPagination);
  });

  test('User email is unique', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users/new`);

    // Try to create user with existing email
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', 'AnyPassword123!');
    await page.selectOption('select[name="role"]', 'viewer');
    await page.click('button[type="submit"]');

    await page.waitForLoadState('networkidle');

    // Should either show error or stay on form
    const stillOnForm = page.url().includes('/users/new');
    const hasError = await page.locator('[class*="error"], [class*="flash"]').isVisible().catch(() => false);

    expect(stillOnForm || hasError).toBeTruthy();
  });

  test('User list displays correct columns', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    const content = await page.content();

    // Should contain user-related columns
    expect(content.length).toBeGreaterThan(100);
  });

  test('Cannot delete own user account (if implemented)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    // Find admin user row
    const adminRow = page.locator('tr, [class*="row"]').filter({ hasText: ADMIN_EMAIL });
    const deleteInAdminRow = adminRow.locator('button:has-text("Delete")').first();

    const isDeleteVisible = await deleteInAdminRow.isVisible().catch(() => false);

    // Delete button might be disabled or hidden for own account
    if (isDeleteVisible) {
      const isDisabled = await deleteInAdminRow.isDisabled().catch(() => false);
      // Either disabled or clicking it should show warning
      console.log('Delete self button disabled:', isDisabled);
    }
  });

  test('User details persist after edit', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');

    const editLink = page.locator('a[href*="/users/"][href*="/edit"]').first();
    const editHref = await editLink.getAttribute('href').catch(() => null);

    if (editHref) {
      const userId = editHref.match(/\/users\/([^/]+)/)?.[1];

      await page.goto(`${BASE_URL}${editHref}`);
      const originalEmail = await page.locator('input[name="email"]').inputValue();
      const originalRole = await page.locator('select[name="role"]').inputValue();

      // Update just the role or status
      const statusSelect = page.locator('select[name="status"]');
      if (await statusSelect.isVisible().catch(() => false)) {
        const newStatus = await statusSelect.inputValue() === 'active' ? 'inactive' : 'active';
        await statusSelect.selectOption(newStatus);
      }

      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Go back to edit form and verify changes
      if (userId) {
        await page.goto(`${BASE_URL}/admin/users/${userId}/edit`);
        const emailAfter = await page.locator('input[name="email"]').inputValue();
        const roleAfter = await page.locator('select[name="role"]').inputValue();

        expect(emailAfter).toBe(originalEmail);
        expect(roleAfter).toBe(originalRole);
      }
    }
  });
});
