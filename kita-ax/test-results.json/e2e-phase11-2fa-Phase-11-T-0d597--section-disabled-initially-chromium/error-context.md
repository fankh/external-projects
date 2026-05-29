# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/phase11-2fa.spec.js >> Phase 11: Two-Factor Authentication (TOTP) >> 01 - Settings page shows 2FA section disabled initially
- Location: tests/e2e/phase11-2fa.spec.js:31:3

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
  1   | const { test, expect } = require('@playwright/test');
  2   | const speakeasy = require('speakeasy');
  3   | 
  4   | const BASE_URL = '';
  5   | const ADMIN_EMAIL = 'admin@seekerslab.com';
  6   | const ADMIN_PASSWORD = 'xmUoX0OA5XvSH4csBJbw';
  7   | 
  8   | test.describe('Phase 11: Two-Factor Authentication (TOTP)', () => {
  9   |   test.beforeEach(async ({ page }) => {
  10  |     test.setTimeout(60000);
  11  |   });
  12  | 
  13  |   // Helper: Login to dashboard
  14  |   async function loginToDashboard(page) {
  15  |     await page.goto('/login', { waitUntil: 'domcontentloaded' });
  16  |     await page.waitForTimeout(1000);
  17  | 
  18  |     const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  19  |     const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
  20  |     const submitButton = page.locator('button[type="submit"]').first();
  21  | 
  22  |     await emailInput.fill(ADMIN_EMAIL);
  23  |     await passwordInput.fill(ADMIN_PASSWORD);
  24  |     await submitButton.click();
  25  | 
  26  |     // If no 2FA, go to dashboard; if 2FA pending, stay at verify page
  27  |     await page.waitForURL(/\/admin\/dashboard|\/auth\/2fa\/verify/, { timeout: 15000 }).catch(() => null);
  28  |     await page.waitForTimeout(500);
  29  |   }
  30  | 
  31  |   test('01 - Settings page shows 2FA section disabled initially', async ({ page }) => {
  32  |     await loginToDashboard(page);
  33  |     await page.goto(`/admin/settings`, { waitUntil: 'domcontentloaded' });
  34  |     await page.waitForTimeout(1000);
  35  | 
  36  |     // Look for 2FA section heading
  37  |     const twoFaHeading = page.locator('h2:has-text("Two-Factor Authentication")');
> 38  |     expect(await twoFaHeading.count()).toBeGreaterThan(0);
      |                                        ^ Error: expect(received).toBeGreaterThan(expected)
  39  | 
  40  |     // Check for disabled status
  41  |     const disabledBadge = page.locator('span.badge-inactive:has-text("Disabled")');
  42  |     expect(await disabledBadge.count()).toBeGreaterThan(0);
  43  | 
  44  |     // Check for Enable button
  45  |     const enableButton = page.locator('a:has-text("Enable 2FA"), button:has-text("Enable 2FA")').first();
  46  |     expect(await enableButton.isVisible()).toBeTruthy();
  47  |   });
  48  | 
  49  |   test('02 - Enable 2FA: Setup page displays QR code and secret', async ({ page }) => {
  50  |     await loginToDashboard(page);
  51  |     await page.goto(`/admin/settings`, { waitUntil: 'domcontentloaded' });
  52  |     await page.waitForTimeout(1000);
  53  | 
  54  |     // Click Enable 2FA
  55  |     const enableButton = page.locator('a:has-text("Enable 2FA"), button:has-text("Enable 2FA")').first();
  56  |     await enableButton.click();
  57  | 
  58  |     await page.waitForURL(/\/auth\/2fa\/setup/, { timeout: 10000 }).catch(() => null);
  59  |     await page.waitForTimeout(1000);
  60  | 
  61  |     // Check for QR code
  62  |     const qrImage = page.locator('img[alt*="QR"], img[id="qrCode"]').first();
  63  |     expect(await qrImage.count()).toBeGreaterThan(0);
  64  | 
  65  |     // Check for manual secret display
  66  |     const secretCode = page.locator('code').first();
  67  |     expect(await secretCode.isVisible()).toBeTruthy();
  68  |     const secretText = await secretCode.textContent();
  69  |     expect(secretText).toBeTruthy();
  70  |     expect(secretText.length).toBeGreaterThan(10);
  71  | 
  72  |     // Check for verification input
  73  |     const verificationInput = page.locator('input[id="token"], input[name="token"]').first();
  74  |     expect(await verificationInput.isVisible()).toBeTruthy();
  75  | 
  76  |     // Check for submit button
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
```