# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/phase6-roles-policies.spec.js >> Phase 6: Roles and Policies Management - Smoke Tests >> Policy activate/deactivate buttons
- Location: tests/e2e/phase6-roles-policies.spec.js:227:3

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
  132 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
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
> 232 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
      |                ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
  233 | 
  234 |     await page.goto(`${BASE_URL}/admin/access-policies?tab=policies`);
  235 |     await page.waitForLoadState('networkidle');
  236 | 
  237 |     const toggleBtn = page.locator('button:has-text("Activate"), button:has-text("Deactivate")').first();
  238 |     const isVisible = await toggleBtn.isVisible().catch(() => false);
  239 | 
  240 |     expect(isVisible).toBeTruthy();
  241 |   });
  242 | 
  243 |   test('Delete policy shows confirmation', async ({ page }) => {
  244 |     await page.goto(`${BASE_URL}/login`);
  245 |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  246 |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  247 |     await page.click('button[type="submit"]');
  248 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  249 | 
  250 |     await page.goto(`${BASE_URL}/admin/access-policies?tab=policies`);
  251 |     await page.waitForLoadState('networkidle');
  252 | 
  253 |     const deleteBtn = page.locator('button:has-text("Delete")').first();
  254 |     const isVisible = await deleteBtn.isVisible().catch(() => false);
  255 | 
  256 |     expect(isVisible).toBeTruthy();
  257 |   });
  258 | 
  259 |   test('Role CSRF protection', async ({ page }) => {
  260 |     await page.goto(`${BASE_URL}/login`);
  261 |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  262 |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  263 |     await page.click('button[type="submit"]');
  264 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  265 | 
  266 |     await page.goto(`${BASE_URL}/admin/access-policies/roles/new`);
  267 | 
  268 |     const csrfInput = page.locator('input[name="_csrf"]');
  269 |     const csrfValue = await csrfInput.inputValue();
  270 | 
  271 |     expect(csrfValue.length).toBeGreaterThan(20);
  272 |   });
  273 | 
  274 |   test('Policy CSRF protection', async ({ page }) => {
  275 |     await page.goto(`${BASE_URL}/login`);
  276 |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  277 |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  278 |     await page.click('button[type="submit"]');
  279 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  280 | 
  281 |     await page.goto(`${BASE_URL}/admin/access-policies/policies/new`);
  282 | 
  283 |     const csrfInput = page.locator('input[name="_csrf"]');
  284 |     const csrfValue = await csrfInput.inputValue();
  285 | 
  286 |     expect(csrfValue.length).toBeGreaterThan(20);
  287 |   });
  288 | 
  289 |   test('Role permissions field editable', async ({ page }) => {
  290 |     await page.goto(`${BASE_URL}/login`);
  291 |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  292 |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  293 |     await page.click('button[type="submit"]');
  294 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  295 | 
  296 |     await page.goto(`${BASE_URL}/admin/access-policies/roles/new`);
  297 | 
  298 |     const permissionsField = page.locator('input[name="permissions"], textarea[name="permissions"]').first();
  299 |     await expect(permissionsField).toBeVisible();
  300 | 
  301 |     const isEditable = await permissionsField.isEditable();
  302 |     expect(isEditable).toBeTruthy();
  303 |   });
  304 | 
  305 |   test('Policy target field configurable', async ({ page }) => {
  306 |     await page.goto(`${BASE_URL}/login`);
  307 |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  308 |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  309 |     await page.click('button[type="submit"]');
  310 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  311 | 
  312 |     await page.goto(`${BASE_URL}/admin/access-policies/policies/new`);
  313 | 
  314 |     const targetField = page.locator('input[name="target"]');
  315 |     await expect(targetField).toBeVisible();
  316 | 
  317 |     const isEditable = await targetField.isEditable();
  318 |     expect(isEditable).toBeTruthy();
  319 |   });
  320 | 
  321 |   test('Role form validation - empty name', async ({ page }) => {
  322 |     await page.goto(`${BASE_URL}/login`);
  323 |     await page.fill('input[type="email"]', ADMIN_EMAIL);
  324 |     await page.fill('input[type="password"]', ADMIN_PASSWORD);
  325 |     await page.click('button[type="submit"]');
  326 |     await page.waitForURL(/\/admin/, { timeout: 15000 });
  327 | 
  328 |     await page.goto(`${BASE_URL}/admin/access-policies/roles/new`);
  329 | 
  330 |     // Try to submit without name
  331 |     const descInput = page.locator('input[name="description"], textarea[name="description"]').first();
  332 |     await descInput.fill('Description without name');
```