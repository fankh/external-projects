# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/phase6-roles-policies.spec.js >> Phase 6: Roles and Policies Management - Smoke Tests >> Roles tab displays seeded roles
- Location: tests/e2e/phase6-roles-policies.spec.js:25:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - heading "🔐 KYRA" [level=1] [ref=e4]
    - paragraph [ref=e5]: AI Guardrail Admin Console
  - generic [ref=e6]:
    - generic [ref=e7]:
      - generic [ref=e8]: Email Address
      - textbox "Email Address" [active] [ref=e9]:
        - /placeholder: admin@seekerslab.com
    - generic [ref=e10]:
      - generic [ref=e11]: Password
      - textbox "Password" [ref=e12]:
        - /placeholder: Enter your password
    - button "Sign In" [ref=e14] [cursor=pointer]
  - generic [ref=e15]:
    - strong [ref=e16]: "Demo Credentials:"
    - text: "Email: admin@seekerslab.com"
    - text: "Password: xmUoX0OA5XvSH4csBJbw"
  - paragraph [ref=e18]: © 2026 SeekersLab. All rights reserved.
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | const BASE_URL = 'https://localhost:8443';
  4   | const ADMIN_EMAIL = 'admin@seekerslab.com';
  5   | const ADMIN_PASSWORD = 'xmUoX0OA5XvSH4csBJbw';
  6   | 
  7   | test.use({ ignoreHTTPSErrors: true });
  8   | 
  9   | test.describe('Phase 6: Roles and Policies Management - Smoke Tests', () => {
  10  | 
  11  |   test('Access policies page loads', async ({ page }) => {
  12  |     await page.goto(`${BASE_URL}/login`);
  13  |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  14  |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  15  |     await page.click('button[type="submit"]');
  16  |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  17  | 
  18  |     await page.goto(`${BASE_URL}/admin/access-policies`);
  19  |     await page.waitForLoadState('networkidle');
  20  | 
  21  |     const url = page.url();
  22  |     expect(url).toContain('/admin/access-policies');
  23  |   });
  24  | 
  25  |   test('Roles tab displays seeded roles', async ({ page }) => {
  26  |     await page.goto(`${BASE_URL}/login`);
  27  |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  28  |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  29  |     await page.click('button[type="submit"]');
> 30  |     await page.waitForURL(/\/admin/, { timeout: 15000 });
      |                ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
  31  | 
  32  |     await page.goto(`${BASE_URL}/admin/access-policies?tab=roles`);
  33  |     await page.waitForLoadState('networkidle');
  34  | 
  35  |     const content = await page.content();
  36  | 
  37  |     // Should display seeded roles
  38  |     expect(
  39  |       content.includes('admin') ||
  40  |       content.includes('editor') ||
  41  |       content.includes('viewer') ||
  42  |       content.includes('role')
  43  |     ).toBeTruthy();
  44  |   });
  45  | 
  46  |   test('Policies tab displays seeded policies', async ({ page }) => {
  47  |     await page.goto(`${BASE_URL}/login`);
  48  |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  49  |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  50  |     await page.click('button[type="submit"]');
  51  |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  52  | 
  53  |     await page.goto(`${BASE_URL}/admin/access-policies?tab=policies`);
  54  |     await page.waitForLoadState('networkidle');
  55  | 
  56  |     const content = await page.content();
  57  | 
  58  |     // Should display seeded policies
  59  |     expect(content.length).toBeGreaterThan(100);
  60  |   });
  61  | 
  62  |   test('Create role form loads', async ({ page }) => {
  63  |     await page.goto(`${BASE_URL}/login`);
  64  |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  65  |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  66  |     await page.click('button[type="submit"]');
  67  |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  68  | 
  69  |     await page.goto(`${BASE_URL}/admin/access-policies/roles/new`);
  70  | 
  71  |     const nameInput = page.locator('input[name="name"]');
  72  |     const descriptionInput = page.locator('input[name="description"], textarea[name="description"]');
  73  |     const permissionsInput = page.locator('input[name="permissions"], textarea[name="permissions"]');
  74  | 
  75  |     await expect(nameInput).toBeAttached();
  76  |     await expect(descriptionInput).toBeAttached();
  77  |     await expect(permissionsInput).toBeAttached();
  78  |   });
  79  | 
  80  |   test('Create role successfully', async ({ page }) => {
  81  |     await page.goto(`${BASE_URL}/login`);
  82  |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  83  |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  84  |     await page.click('button[type="submit"]');
  85  |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  86  | 
  87  |     const uniqueName = `TestRole-${Date.now()}`;
  88  | 
  89  |     await page.goto(`${BASE_URL}/admin/access-policies/roles/new`);
  90  |     await page.fill('input[name="name"]', uniqueName);
  91  | 
  92  |     const descInput = page.locator('input[name="description"], textarea[name="description"]').first();
  93  |     await descInput.fill('Test role for Phase 6');
  94  | 
  95  |     const permInput = page.locator('input[name="permissions"], textarea[name="permissions"]').first();
  96  |     await permInput.fill('read:all, write:documents');
  97  | 
  98  |     await page.click('button[type="submit"]');
  99  |     await page.waitForLoadState('networkidle');
  100 | 
  101 |     expect(page.url()).toContain('/admin/access-policies');
  102 |   });
  103 | 
  104 |   test('Edit role form displays', async ({ page }) => {
  105 |     await page.goto(`${BASE_URL}/login`);
  106 |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  107 |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  108 |     await page.click('button[type="submit"]');
  109 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  110 | 
  111 |     await page.goto(`${BASE_URL}/admin/access-policies?tab=roles`);
  112 |     await page.waitForLoadState('networkidle');
  113 | 
  114 |     const editLink = page.locator('a[href*="/roles/"][href*="/edit"]').first();
  115 |     const href = await editLink.getAttribute('href').catch(() => null);
  116 | 
  117 |     if (href) {
  118 |       await page.goto(`${BASE_URL}${href}`);
  119 | 
  120 |       const nameInput = page.locator('input[name="name"]');
  121 |       const name = await nameInput.inputValue();
  122 | 
  123 |       expect(name.length).toBeGreaterThan(0);
  124 |     }
  125 |   });
  126 | 
  127 |   test('Delete role shows confirmation', async ({ page }) => {
  128 |     await page.goto(`${BASE_URL}/login`);
  129 |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  130 |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
```