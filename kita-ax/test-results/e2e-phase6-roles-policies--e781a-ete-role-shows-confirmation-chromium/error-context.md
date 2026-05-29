# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/phase6-roles-policies.spec.js >> Phase 6: Roles and Policies Management - Smoke Tests >> Delete role shows confirmation
- Location: tests/e2e/phase6-roles-policies.spec.js:127:3

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
  131 |     await page.click('button[type="submit"]');
> 132 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
      |                ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
  133 | 
  134 |     await page.goto(`${BASE_URL}/admin/access-policies?tab=roles`);
  135 |     await page.waitForLoadState('networkidle');
  136 | 
  137 |     const deleteBtn = page.locator('button:has-text("Delete")').first();
  138 |     const isVisible = await deleteBtn.isVisible().catch(() => false);
  139 | 
  140 |     expect(isVisible).toBeTruthy();
  141 |   });
  142 | 
  143 |   test('Create policy form loads', async ({ page }) => {
  144 |     await page.goto(`${BASE_URL}/login`);
  145 |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  146 |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  147 |     await page.click('button[type="submit"]');
  148 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  149 | 
  150 |     await page.goto(`${BASE_URL}/admin/access-policies/policies/new`);
  151 | 
  152 |     const nameInput = page.locator('input[name="name"]');
  153 |     const typeSelect = page.locator('select[name="type"]');
  154 |     const targetInput = page.locator('input[name="target"]');
  155 | 
  156 |     await expect(nameInput).toBeAttached();
  157 |     await expect(typeSelect).toBeAttached();
  158 |     await expect(targetInput).toBeAttached();
  159 |   });
  160 | 
  161 |   test('Create policy successfully', async ({ page }) => {
  162 |     await page.goto(`${BASE_URL}/login`);
  163 |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  164 |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  165 |     await page.click('button[type="submit"]');
  166 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  167 | 
  168 |     const uniqueName = `TestPolicy-${Date.now()}`;
  169 | 
  170 |     await page.goto(`${BASE_URL}/admin/access-policies/policies/new`);
  171 |     await page.fill('input[name="name"]', uniqueName);
  172 |     await page.selectOption('select[name="type"]', 'rbac');
  173 |     await page.fill('input[name="target"]', 'test-resource');
  174 | 
  175 |     const statusSelect = page.locator('select[name="status"]');
  176 |     if (await statusSelect.isVisible().catch(() => false)) {
  177 |       await statusSelect.selectOption('active');
  178 |     }
  179 | 
  180 |     await page.click('button[type="submit"]');
  181 |     await page.waitForLoadState('networkidle');
  182 | 
  183 |     expect(page.url()).toContain('/admin/access-policies');
  184 |   });
  185 | 
  186 |   test('Policy types available', async ({ page }) => {
  187 |     await page.goto(`${BASE_URL}/login`);
  188 |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  189 |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  190 |     await page.click('button[type="submit"]');
  191 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  192 | 
  193 |     await page.goto(`${BASE_URL}/admin/access-policies/policies/new`);
  194 | 
  195 |     const typeSelect = page.locator('select[name="type"]');
  196 |     const options = await typeSelect.locator('option').all();
  197 | 
  198 |     expect(options.length).toBeGreaterThan(0);
  199 | 
  200 |     const typeTexts = await Promise.all(options.map(opt => opt.textContent()));
  201 |     expect(typeTexts.some(t => t.toLowerCase().includes('rbac') || t.toLowerCase().includes('abac'))).toBeTruthy();
  202 |   });
  203 | 
  204 |   test('Edit policy form displays', async ({ page }) => {
  205 |     await page.goto(`${BASE_URL}/login`);
  206 |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  207 |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  208 |     await page.click('button[type="submit"]');
  209 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  210 | 
  211 |     await page.goto(`${BASE_URL}/admin/access-policies?tab=policies`);
  212 |     await page.waitForLoadState('networkidle');
  213 | 
  214 |     const editLink = page.locator('a[href*="/policies/"][href*="/edit"]').first();
  215 |     const href = await editLink.getAttribute('href').catch(() => null);
  216 | 
  217 |     if (href) {
  218 |       await page.goto(`${BASE_URL}${href}`);
  219 | 
  220 |       const nameInput = page.locator('input[name="name"]');
  221 |       const name = await nameInput.inputValue();
  222 | 
  223 |       expect(name.length).toBeGreaterThan(0);
  224 |     }
  225 |   });
  226 | 
  227 |   test('Policy activate/deactivate buttons', async ({ page }) => {
  228 |     await page.goto(`${BASE_URL}/login`);
  229 |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  230 |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  231 |     await page.click('button[type="submit"]');
  232 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
```