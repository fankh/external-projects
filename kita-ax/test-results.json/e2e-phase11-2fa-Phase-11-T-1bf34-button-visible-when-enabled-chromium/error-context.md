# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/phase11-2fa.spec.js >> Phase 11: Two-Factor Authentication (TOTP) >> 06 - 2FA disable button visible when enabled
- Location: tests/e2e/phase11-2fa.spec.js:163:3

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
  77  |     const submitButton = page.locator('button[type="submit"]:has-text("Verify"), button:has-text("Enable 2FA")').first();
  78  |     expect(await submitButton.isVisible()).toBeTruthy();
  79  |   });
  80  | 
  81  |   test('03 - 2FA setup: Invalid verification code shows error', async ({ page }) => {
  82  |     await loginToDashboard(page);
  83  |     await page.goto(`/admin/settings`, { waitUntil: 'domcontentloaded' });
  84  |     await page.waitForTimeout(1000);
  85  | 
  86  |     // Click Enable 2FA
  87  |     const enableButton = page.locator('a:has-text("Enable 2FA"), button:has-text("Enable 2FA")').first();
  88  |     await enableButton.click();
  89  | 
  90  |     await page.waitForURL(/\/auth\/2fa\/setup/, { timeout: 10000 }).catch(() => null);
  91  |     await page.waitForTimeout(1000);
  92  | 
  93  |     // Enter invalid 6-digit code
  94  |     const tokenInput = page.locator('input[id="token"], input[name="token"]').first();
  95  |     await tokenInput.fill('000000');
  96  | 
  97  |     // Submit
  98  |     const submitButton = page.locator('button[type="submit"]:has-text("Verify"), button:has-text("Enable 2FA")').first();
  99  |     await submitButton.click();
  100 | 
  101 |     await page.waitForTimeout(2000);
  102 | 
  103 |     // Check for error message
  104 |     const errorAlert = page.locator('.alert-error, [role="alert"]').first();
  105 |     const errorVisible = await errorAlert.isVisible().catch(() => false);
  106 | 
  107 |     // Either error shows or we stay on the page (both are acceptable)
  108 |     const stillOnSetupPage = page.url().includes('/auth/2fa/setup');
  109 |     expect(errorVisible || stillOnSetupPage).toBeTruthy();
  110 |   });
  111 | 
  112 |   test('04 - 2FA verify: Page accessible after login with enabled 2FA', async ({ page, context }) => {
  113 |     // This test would require pre-enabling 2FA on the test user
  114 |     // For now, we'll verify the 2FA verify page is accessible
  115 | 
  116 |     await page.goto(`/login`, { waitUntil: 'domcontentloaded' });
  117 |     await page.waitForTimeout(1000);
  118 | 
  119 |     // Try to navigate directly to 2FA verify (should redirect to login)
  120 |     await page.goto(`/auth/2fa/verify`);
  121 |     await page.waitForTimeout(500);
  122 | 
  123 |     // Should be redirected to login if not in pending state
  124 |     const onLoginOrVerify = page.url().includes('/login') || page.url().includes('/auth/2fa/verify');
  125 |     expect(onLoginOrVerify).toBeTruthy();
  126 |   });
  127 | 
  128 |   test('05 - 2FA verify page has correct form elements', async ({ page }) => {
  129 |     // Navigate to verify page (may not be in correct state, but test the template)
  130 |     await page.goto(`/login`, { waitUntil: 'domcontentloaded' });
  131 |     await page.waitForTimeout(1000);
  132 | 
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
> 177 |     expect(await twoFaSection.count()).toBeGreaterThan(0);
      |                                        ^ Error: expect(received).toBeGreaterThan(expected)
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
  233 |     expect(await prefSection.count()).toBeGreaterThan(0);
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
```