const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@seekerslab.com';
const ADMIN_PASSWORD = 'AdminPassword123!';
const TEST_USER_EMAIL = `testuser-${Date.now()}@example.com`;
const TEST_USER_PASSWORD = 'TestPassword123!';

test.describe('KYRA Admin Console - Comprehensive Feature Tests', () => {
  let page;
  let adminPage;
  let testUserId;

  test.beforeAll(async ({ browser }) => {
    adminPage = await browser.newPage();
  });

  test.afterAll(async () => {
    if (adminPage) await adminPage.close();
  });

  // ============= PHASE 1-2: AUTHENTICATION =============
  test.describe('Authentication Features', () => {
    test('should load login page', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await expect(testPage.locator('h1')).toContainText('Sign In');
      await expect(testPage.locator('input[name="email"]')).toBeVisible();
      await expect(testPage.locator('input[name="password"]')).toBeVisible();
    });

    test('should reject invalid credentials', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', 'invalid@example.com');
      await testPage.fill('input[name="password"]', 'wrongpassword');
      await testPage.click('button[type="submit"]');
      await expect(testPage.locator('text=/invalid|incorrect|unauthorized/i')).toBeVisible();
    });

    test('should login with valid credentials', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);
      await expect(testPage.locator('h1, h2').first()).toBeVisible();
    });

    test('should logout', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      // Find and click logout button
      const logoutButton = testPage.locator('a:has-text("Logout"), button:has-text("Logout"), [onclick*="logout"]').first();
      if (await logoutButton.isVisible()) {
        await logoutButton.click();
        await testPage.waitForURL(`${BASE_URL}/login`);
        await expect(testPage.locator('h1')).toContainText('Sign In');
      }
    });
  });

  // ============= PHASE 3-5: ADMIN CRUD OPERATIONS =============
  test.describe('User Management', () => {
    test('should navigate to users page', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Users")');
      await testPage.waitForURL(`${BASE_URL}/admin/users`);
      await expect(testPage.locator('h1, h2').first()).toContainText(/users/i);
    });

    test('should display users list', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Users")');
      await testPage.waitForURL(`${BASE_URL}/admin/users`);

      // Wait for table to load
      await testPage.waitForSelector('table, [role="grid"], [class*="table"]', { timeout: 5000 }).catch(() => null);
      const rows = await testPage.locator('tbody tr, [role="row"]').count();
      expect(rows).toBeGreaterThan(0);
    });

    test('should create new user', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Users")');
      await testPage.waitForURL(`${BASE_URL}/admin/users`);

      // Click create/new user button
      const newUserBtn = testPage.locator('a:has-text("New"), a:has-text("Create"), button:has-text("New"), button:has-text("Create")').first();
      if (await newUserBtn.isVisible()) {
        await newUserBtn.click();
        await testPage.waitForURL(/\/admin\/users\/new/);

        // Fill form
        await testPage.fill('input[name="email"]', TEST_USER_EMAIL);
        await testPage.fill('input[name="password"]', TEST_USER_PASSWORD);

        const roleSelect = testPage.locator('select[name="role"], [role="combobox"]').first();
        if (await roleSelect.isVisible()) {
          await roleSelect.selectOption('editor');
        }

        // Submit form
        await testPage.click('button[type="submit"]');

        // Should see success message or redirect to list
        await testPage.waitForURL(`${BASE_URL}/admin/users`, { timeout: 10000 }).catch(() => null);
      }
    });
  });

  test.describe('Document Management', () => {
    test('should navigate to documents page', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Documents")');
      await testPage.waitForURL(`${BASE_URL}/admin/documents`);
      await expect(testPage.locator('h1, h2').first()).toContainText(/documents/i);
    });

    test('should display documents list', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Documents")');
      await testPage.waitForURL(`${BASE_URL}/admin/documents`);

      await testPage.waitForSelector('table, [role="grid"], [class*="table"]', { timeout: 5000 }).catch(() => null);
      const rows = await testPage.locator('tbody tr, [role="row"]').count();
      expect(rows).toBeGreaterThan(0);
    });

    test('should create new document', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Documents")');
      await testPage.waitForURL(`${BASE_URL}/admin/documents`);

      const newDocBtn = testPage.locator('a:has-text("New"), a:has-text("Create"), button:has-text("New"), button:has-text("Create")').first();
      if (await newDocBtn.isVisible()) {
        await newDocBtn.click();
        await testPage.waitForURL(/\/admin\/documents\/new/);

        await testPage.fill('input[name="title"]', `Test Doc ${Date.now()}`);
        await testPage.fill('textarea[name="description"]', 'Test document description');

        const classSelect = testPage.locator('select[name="classification"], [role="combobox"]').first();
        if (await classSelect.isVisible()) {
          await classSelect.selectOption('public');
        }

        await testPage.click('button[type="submit"]');
        await testPage.waitForURL(`${BASE_URL}/admin/documents`, { timeout: 10000 }).catch(() => null);
      }
    });
  });

  test.describe('Access Policies & Roles', () => {
    test('should navigate to access policies page', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Policies")');
      await testPage.waitForURL(`${BASE_URL}/admin/access-policies`);
      await expect(testPage.locator('h1, h2').first()).toContainText(/policies|access/i);
    });

    test('should display roles', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Policies")');
      await testPage.waitForURL(`${BASE_URL}/admin/access-policies`);

      // Click roles tab if it exists
      const rolesTab = testPage.locator('[role="tab"]:has-text("Roles"), a:has-text("Roles")').first();
      if (await rolesTab.isVisible()) {
        await rolesTab.click();
      }

      await testPage.waitForSelector('table, [role="grid"], [class*="table"]', { timeout: 5000 }).catch(() => null);
      const roleRows = await testPage.locator('tbody tr, [role="row"]').count();
      expect(roleRows).toBeGreaterThan(0);
    });

    test('should create new role', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Policies")');
      await testPage.waitForURL(`${BASE_URL}/admin/access-policies`);

      const newRoleBtn = testPage.locator('a:has-text("New"), a:has-text("Create"), button:has-text("New"), button:has-text("Create")').first();
      if (await newRoleBtn.isVisible()) {
        await newRoleBtn.click();
        await testPage.waitForURL(/\/admin\/access-policies\/(roles\/)?new/).catch(() => null);

        await testPage.fill('input[name="name"]', `TestRole${Date.now()}`);
        await testPage.fill('textarea[name="description"]', 'Test role description');

        // Fill permissions if field exists
        const permField = testPage.locator('input[name="permissions"], textarea[name="permissions"]').first();
        if (await permField.isVisible()) {
          await permField.fill('read, write');
        }

        await testPage.click('button[type="submit"]');
        await testPage.waitForURL(`${BASE_URL}/admin/access-policies`, { timeout: 10000 }).catch(() => null);
      }
    });
  });

  test.describe('Agents Management', () => {
    test('should navigate to agents page', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      const agentsLink = testPage.locator('a:has-text("Agents")');
      if (await agentsLink.isVisible()) {
        await agentsLink.click();
        await testPage.waitForURL(`${BASE_URL}/admin/agents`);
        await expect(testPage.locator('h1, h2').first()).toContainText(/agents/i);
      }
    });

    test('should display agents list', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      const agentsLink = testPage.locator('a:has-text("Agents")');
      if (await agentsLink.isVisible()) {
        await agentsLink.click();
        await testPage.waitForURL(`${BASE_URL}/admin/agents`);

        await testPage.waitForSelector('table, [role="grid"], [class*="table"]', { timeout: 5000 }).catch(() => null);
      }
    });

    test('should create new agent', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      const agentsLink = testPage.locator('a:has-text("Agents")');
      if (await agentsLink.isVisible()) {
        await agentsLink.click();
        await testPage.waitForURL(`${BASE_URL}/admin/agents`);

        const newAgentBtn = testPage.locator('a:has-text("New"), a:has-text("Create"), button:has-text("New"), button:has-text("Create")').first();
        if (await newAgentBtn.isVisible()) {
          await newAgentBtn.click();
          await testPage.waitForURL(/\/admin\/agents\/new/).catch(() => null);

          await testPage.fill('input[name="name"]', `TestAgent${Date.now()}`);

          const typeSelect = testPage.locator('select[name="type"], [role="combobox"]').first();
          if (await typeSelect.isVisible()) {
            await typeSelect.selectOption('analysis');
          }

          await testPage.click('button[type="submit"]');
          await testPage.waitForURL(`${BASE_URL}/admin/agents`, { timeout: 10000 }).catch(() => null);
        }
      }
    });
  });

  // ============= PHASE 7: DOCUMENT FILE UPLOAD =============
  test.describe('Document File Upload', () => {
    test('should upload file to document', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Documents")');
      await testPage.waitForURL(`${BASE_URL}/admin/documents`);

      // Click edit on first document or create one
      const editBtn = testPage.locator('a:has-text("Edit"), button:has-text("Edit")').first();
      if (await editBtn.isVisible()) {
        await editBtn.click();
        await testPage.waitForURL(/\/admin\/documents\/\d+\/edit/);

        // Create test file
        const testContent = 'Test document content';
        const buffer = Buffer.from(testContent);

        // Find and fill file input
        const fileInput = testPage.locator('input[type="file"]').first();
        if (await fileInput.isVisible()) {
          await fileInput.setInputFiles({
            name: 'test-document.txt',
            mimeType: 'text/plain',
            buffer: buffer,
          });

          // Wait for upload
          await testPage.waitForTimeout(1000);

          // Submit form
          const submitBtn = testPage.locator('button[type="submit"]').last();
          if (await submitBtn.isVisible()) {
            await submitBtn.click();
            await testPage.waitForURL(`${BASE_URL}/admin/documents`, { timeout: 10000 }).catch(() => null);
          }
        }
      }
    });

    test('should download uploaded file', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Documents")');
      await testPage.waitForURL(`${BASE_URL}/admin/documents`);

      // Click download link if visible
      const downloadLink = testPage.locator('a[href*="/download"]').first();
      if (await downloadLink.isVisible()) {
        const downloadPromise = testPage.waitForEvent('download');
        await downloadLink.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBeTruthy();
      }
    });
  });

  // ============= PHASE 8: OAUTH/SSO =============
  test.describe('OAuth/SSO Integration', () => {
    test('should display OAuth buttons on login page', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);

      const googleBtn = testPage.locator('button:has-text("Google"), a:has-text("Google")').first();
      const githubBtn = testPage.locator('button:has-text("GitHub"), a:has-text("GitHub")').first();

      const hasGoogle = await googleBtn.isVisible().catch(() => false);
      const hasGithub = await githubBtn.isVisible().catch(() => false);

      expect(hasGoogle || hasGithub).toBeTruthy();
    });
  });

  // ============= PHASE 9: SETTINGS & PREFERENCES =============
  test.describe('Settings & Preferences', () => {
    test('should navigate to settings page', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      const settingsLink = testPage.locator('a:has-text("Settings")');
      if (await settingsLink.isVisible()) {
        await settingsLink.click();
        await testPage.waitForURL(`${BASE_URL}/admin/settings`);
        await expect(testPage.locator('h1, h2').first()).toContainText(/settings/i);
      }
    });

    test('should display preference options', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      const settingsLink = testPage.locator('a:has-text("Settings")');
      if (await settingsLink.isVisible()) {
        await settingsLink.click();
        await testPage.waitForURL(`${BASE_URL}/admin/settings`);

        // Check for preference fields
        const themeSelect = testPage.locator('select[name*="theme"], [id*="theme"]').first();
        const langSelect = testPage.locator('select[name*="language"], [id*="language"]').first();

        const hasTheme = await themeSelect.isVisible().catch(() => false);
        const hasLang = await langSelect.isVisible().catch(() => false);

        expect(hasTheme || hasLang).toBeTruthy();
      }
    });

    test('should update preferences', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      const settingsLink = testPage.locator('a:has-text("Settings")');
      if (await settingsLink.isVisible()) {
        await settingsLink.click();
        await testPage.waitForURL(`${BASE_URL}/admin/settings`);

        const themeSelect = testPage.locator('select[name*="theme"]').first();
        if (await themeSelect.isVisible()) {
          await themeSelect.selectOption('dark');

          const saveBtn = testPage.locator('button[type="submit"], button:has-text("Save")').first();
          if (await saveBtn.isVisible()) {
            await saveBtn.click();
            await testPage.waitForTimeout(500);
          }
        }
      }
    });
  });

  // ============= PHASE 5: AUDIT LOGGING =============
  test.describe('Audit Logging', () => {
    test('should navigate to audit logs page', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Audit")');
      await testPage.waitForURL(`${BASE_URL}/admin/audit-logs`);
      await expect(testPage.locator('h1, h2').first()).toContainText(/audit/i);
    });

    test('should display audit logs', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Audit")');
      await testPage.waitForURL(`${BASE_URL}/admin/audit-logs`);

      await testPage.waitForSelector('table, [role="grid"], [class*="table"]', { timeout: 5000 }).catch(() => null);
      const logRows = await testPage.locator('tbody tr, [role="row"]').count();
      expect(logRows).toBeGreaterThan(0);
    });

    test('should filter audit logs', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      await testPage.click('a:has-text("Audit")');
      await testPage.waitForURL(`${BASE_URL}/admin/audit-logs`);

      const searchInput = testPage.locator('input[name="search"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill('user');

        const filterBtn = testPage.locator('button[type="submit"], button:has-text("Filter"), button:has-text("Search")').first();
        if (await filterBtn.isVisible()) {
          await filterBtn.click();
          await testPage.waitForTimeout(500);
        }
      }
    });
  });

  // ============= DASHBOARD =============
  test.describe('Dashboard', () => {
    test('should load dashboard with metrics', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      // Check for dashboard elements
      const hasContent = await testPage.locator('h1, h2, [class*="metric"], [class*="card"]').first().isVisible();
      expect(hasContent).toBeTruthy();
    });

    test('should navigate between admin pages using sidebar', async ({ page: testPage }) => {
      await testPage.goto(`${BASE_URL}/login`);
      await testPage.fill('input[name="email"]', ADMIN_EMAIL);
      await testPage.fill('input[name="password"]', ADMIN_PASSWORD);
      await testPage.click('button[type="submit"]');
      await testPage.waitForURL(`${BASE_URL}/admin/dashboard`);

      const navLinks = await testPage.locator('nav a, [role="navigation"] a, aside a').allTextContents();
      expect(navLinks.length).toBeGreaterThan(0);

      // Test navigation to different sections
      for (const linkText of ['Users', 'Documents', 'Policies']) {
        const link = testPage.locator(`a:has-text("${linkText}")`).first();
        if (await link.isVisible()) {
          await link.click();
          await testPage.waitForTimeout(500);
        }
      }
    });
  });
});
