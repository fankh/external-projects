# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/phase11-2fa.spec.js >> Phase 11: Two-Factor Authentication (TOTP) >> 12 - Settings preferences form elements exist
- Location: tests/e2e/phase11-2fa.spec.js:226:3

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
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
  - generic [ref=e17]: OR
  - generic [ref=e19]:
    - strong [ref=e20]: "Demo Credentials:"
    - text: "Email: admin@seekerslab.com"
    - text: "Password: xmUoX0OA5XvSH4csBJbw"
  - paragraph [ref=e22]: © 2026 SeekersLab. All rights reserved.
```

# Test source

```ts
  133 |     // Test form elements that should exist
  134 |     const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  135 |     await emailInput.fill(ADMIN_EMAIL);
  136 |     const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
  137 |     await passwordInput.fill(ADMIN_PASSWORD);
  138 |     const submitButton = page.locator('button[type="submit"]').first();
  139 |     await submitButton.click();
  140 | 
  141 |     await page.waitForURL(/\/admin\/dashboard|\/auth\/2fa\/verify/, { timeout: 15000 }).catch(() => null);
  142 |     await page.waitForTimeout(1000);
  143 | 
  144 |     // If 2FA is enabled, check the verify page
  145 |     if (page.url().includes('/auth/2fa/verify')) {
  146 |       const codeInput = page.locator('input[id="token"], input[name="token"]').first();
  147 |       expect(await codeInput.isVisible()).toBeTruthy();
  148 | 
  149 |       // Check for backup code toggle
  150 |       const backupToggle = page.locator('button:has-text("backup code"), button:has-text("Use backup")').first();
  151 |       const toggleExists = await backupToggle.count() > 0;
  152 |       expect(toggleExists).toBeTruthy();
  153 | 
  154 |       // Check for back to login link
  155 |       const backLink = page.locator('a:has-text("Back"), button:has-text("Back")').first();
  156 |       expect(await backLink.count()).toBeGreaterThan(0);
  157 |     } else if (page.url().includes('/admin/dashboard')) {
  158 |       // User doesn't have 2FA enabled, so login succeeded without 2FA
  159 |       expect(page.url()).toContain('admin');
  160 |     }
  161 |   });
  162 | 
  163 |   test('06 - 2FA disable button visible when enabled', async ({ page }) => {
  164 |     // This test would require 2FA to be enabled first
  165 |     // Testing the UI presence on settings page
  166 | 
  167 |     await loginToDashboard(page);
  168 |     await page.goto(`/admin/settings`, { waitUntil: 'domcontentloaded' });
  169 |     await page.waitForTimeout(1000);
  170 | 
  171 |     // Check if settings page loads
  172 |     const settingsHeading = page.locator('h1, h2').first();
  173 |     expect(await settingsHeading.isVisible()).toBeTruthy();
  174 | 
  175 |     // Check for 2FA section
  176 |     const twoFaSection = page.locator('h2:has-text("Two-Factor Authentication")');
  177 |     expect(await twoFaSection.count()).toBeGreaterThan(0);
  178 |   });
  179 | 
  180 |   test('07 - Backup code toggle visible on 2FA verify page', async ({ page }) => {
  181 |     // Test the backup code toggle UI
  182 |     // This works by checking the template even without active 2FA
  183 | 
  184 |     await page.goto(`/login`, { waitUntil: 'domcontentloaded' });
  185 |     await page.waitForTimeout(1000);
  186 | 
  187 |     // Check login form
  188 |     const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  189 |     expect(await emailInput.isVisible()).toBeTruthy();
  190 |   });
  191 | 
  192 |   test('08 - Admin routes require authentication', async ({ page }) => {
  193 |     // Try to access admin dashboard without login
  194 |     await page.goto(`/admin/dashboard`, { waitUntil: 'domcontentloaded' });
  195 |     await page.waitForTimeout(500);
  196 | 
  197 |     // Should redirect to login
  198 |     const isOnLogin = page.url().includes('/login');
  199 |     expect(isOnLogin).toBeTruthy();
  200 |   });
  201 | 
  202 |   test('09 - API routes blocked without authentication', async ({ page }) => {
  203 |     // Make API request without session
  204 |     const response = await page.request.get(`/api/v1/users`);
  205 | 
  206 |     // Should be 401 or redirect
  207 |     expect(response.status()).toBeGreaterThanOrEqual(400);
  208 |   });
  209 | 
  210 |   test('10 - Health check accessible without auth', async ({ page }) => {
  211 |     const response = await page.goto(`/health`);
  212 |     expect(response.status()).toBeLessThan(400);
  213 |   });
  214 | 
  215 |   test('11 - Login page shows demo credentials', async ({ page }) => {
  216 |     await page.goto(`/login`, { waitUntil: 'domcontentloaded' });
  217 |     await page.waitForTimeout(500);
  218 | 
  219 |     // Check for test credentials display
  220 |     const credentialsSection = page.locator('text=admin@seekerslab.com, text=Demo, text=Credentials').first();
  221 |     const foundCreds = await credentialsSection.count() > 0 ||
  222 |                        (await page.textContent('body')).includes('admin@seekerslab.com');
  223 |     expect(foundCreds).toBeTruthy();
  224 |   });
  225 | 
  226 |   test('12 - Settings preferences form elements exist', async ({ page }) => {
  227 |     await loginToDashboard(page);
  228 |     await page.goto(`/admin/settings`, { waitUntil: 'domcontentloaded' });
  229 |     await page.waitForTimeout(1000);
  230 | 
  231 |     // Check for Display Preferences section
  232 |     const prefSection = page.locator('h2:has-text("Display Preferences"), h2:has-text("Preferences")').first();
> 233 |     expect(await prefSection.count()).toBeGreaterThan(0);
      |                                       ^ Error: expect(received).toBeGreaterThan(expected)
  234 | 
  235 |     // Check for theme select
  236 |     const themeSelect = page.locator('select[name="theme"]').first();
  237 |     const themeExists = await themeSelect.count() > 0;
  238 |     expect(themeExists).toBeTruthy();
  239 | 
  240 |     // Check for language select
  241 |     const langSelect = page.locator('select[name="language"]').first();
  242 |     const langExists = await langSelect.count() > 0;
  243 |     expect(langExists).toBeTruthy();
  244 |   });
  245 | 
  246 |   test('13 - Logout clears session', async ({ page }) => {
  247 |     await loginToDashboard(page);
  248 | 
  249 |     // Try to access admin page
  250 |     await page.goto(`/admin/dashboard`);
  251 |     await page.waitForTimeout(500);
  252 | 
  253 |     // Should be on admin dashboard
  254 |     expect(page.url()).toContain('admin');
  255 | 
  256 |     // Find logout button/link
  257 |     const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign out"), a:has-text("Logout")').first();
  258 |     const logoutExists = await logoutButton.count() > 0;
  259 | 
  260 |     if (logoutExists) {
  261 |       await logoutButton.click();
  262 |       await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => null);
  263 |       await page.waitForTimeout(500);
  264 | 
  265 |       // Should be back at login
  266 |       expect(page.url()).toContain('login');
  267 |     }
  268 |   });
  269 | 
  270 |   test('14 - Connected accounts section visible in settings', async ({ page }) => {
  271 |     await loginToDashboard(page);
  272 |     await page.goto(`/admin/settings`, { waitUntil: 'domcontentloaded' });
  273 |     await page.waitForTimeout(1000);
  274 | 
  275 |     // Look for Connected Accounts section
  276 |     const accountsSection = page.locator('h2:has-text("Connected Accounts")');
  277 |     expect(await accountsSection.count()).toBeGreaterThan(0);
  278 |   });
  279 | 
  280 |   test('15 - Notification preferences accessible', async ({ page }) => {
  281 |     await loginToDashboard(page);
  282 |     await page.goto(`/admin/settings`, { waitUntil: 'domcontentloaded' });
  283 |     await page.waitForTimeout(1000);
  284 | 
  285 |     // Look for Notification Preferences section
  286 |     const notifySection = page.locator('h2:has-text("Notification")');
  287 |     expect(await notifySection.count()).toBeGreaterThan(0);
  288 | 
  289 |     // Check for notification checkboxes
  290 |     const notifyCheckboxes = page.locator('input[type="checkbox"][name*="notify"]');
  291 |     expect(await notifyCheckboxes.count()).toBeGreaterThan(0);
  292 |   });
  293 | });
  294 | 
```