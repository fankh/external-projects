# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/phase11-direct.spec.js >> Phase 11: 2FA Direct HTML Testing >> 03 - 2FA verify page HTML structure
- Location: tests/e2e/phase11-direct.spec.js:33:3

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [ref=e2]: "{\"success\":false,\"error\":\"Not Found\",\"path\":\"/auth/2fa/verify\",\"method\":\"GET\"}"
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test.describe('Phase 11: 2FA Direct HTML Testing', () => {
  4   |   test('01 - Login page has correct form structure', async ({ page }) => {
  5   |     await page.goto('https://localhost:8443/login', { waitUntil: 'domcontentloaded' });
  6   | 
  7   |     // Check for email input
  8   |     const emailInput = page.locator('input[type="email"], input[id="email"]').first();
  9   |     expect(await emailInput.count()).toBeGreaterThan(0);
  10  |     expect(await emailInput.getAttribute('id')).toBe('email');
  11  | 
  12  |     // Check for password input
  13  |     const passwordInput = page.locator('input[type="password"], input[id="password"]').first();
  14  |     expect(await passwordInput.count()).toBeGreaterThan(0);
  15  |     expect(await passwordInput.getAttribute('id')).toBe('password');
  16  | 
  17  |     // Check for submit button
  18  |     const submitBtn = page.locator('button[type="submit"]').first();
  19  |     expect(await submitBtn.count()).toBeGreaterThan(0);
  20  |     const btnText = await submitBtn.textContent();
  21  |     expect(btnText).toContain('Sign In');
  22  |   });
  23  | 
  24  |   test('02 - 2FA setup page HTML structure', async ({ page }) => {
  25  |     await page.goto('https://localhost:8443/auth/2fa/setup', { waitUntil: 'domcontentloaded' });
  26  | 
  27  |     // Since we're not authenticated, we should get redirected or see error page
  28  |     // But we can at least verify the page loads
  29  |     expect(page.url()).toBeTruthy();
  30  |     console.log('2FA setup page URL:', page.url());
  31  |   });
  32  | 
  33  |   test('03 - 2FA verify page HTML structure', async ({ page }) => {
  34  |     await page.goto('https://localhost:8443/auth/2fa/verify', { waitUntil: 'domcontentloaded' });
  35  | 
  36  |     // Check page structure
  37  |     const pageContent = await page.content();
  38  |     expect(pageContent).toBeTruthy();
  39  | 
  40  |     // If we're on the verify page (authenticated), look for elements
  41  |     if (page.url().includes('2fa/verify')) {
  42  |       const codeInput = page.locator('input[name="token"], input[id="token"]').first();
> 43  |       expect(await codeInput.count()).toBeGreaterThan(0);
      |                                       ^ Error: expect(received).toBeGreaterThan(expected)
  44  |     }
  45  |   });
  46  | 
  47  |   test('04 - Health endpoint returns JSON', async ({ page }) => {
  48  |     const response = await page.goto('https://localhost:8443/health', { waitUntil: 'domcontentloaded' });
  49  |     expect(response.status()).toBe(200);
  50  | 
  51  |     const json = await page.evaluate(() => {
  52  |       try {
  53  |         return JSON.parse(document.body.innerText);
  54  |       } catch {
  55  |         return null;
  56  |       }
  57  |     });
  58  | 
  59  |     expect(json).not.toBeNull();
  60  |     expect(json.success).toBe(true);
  61  |     expect(json.status).toBe('healthy');
  62  |   });
  63  | 
  64  |   test('05 - Login form can be filled', async ({ page }) => {
  65  |     await page.goto('https://localhost:8443/login', { waitUntil: 'domcontentloaded' });
  66  | 
  67  |     const emailInput = page.locator('input[id="email"]').first();
  68  |     const passwordInput = page.locator('input[id="password"]').first();
  69  | 
  70  |     // Fill form
  71  |     await emailInput.fill('admin@seekerslab.com');
  72  |     await passwordInput.fill('xmUoX0OA5XvSH4csBJbw');
  73  | 
  74  |     // Verify values
  75  |     expect(await emailInput.inputValue()).toBe('admin@seekerslab.com');
  76  |     expect(await passwordInput.inputValue()).toBe('xmUoX0OA5XvSH4csBJbw');
  77  |   });
  78  | 
  79  |   test('06 - Login form submission', async ({ page }) => {
  80  |     await page.goto('https://localhost:8443/login', { waitUntil: 'domcontentloaded' });
  81  | 
  82  |     const emailInput = page.locator('input[id="email"]').first();
  83  |     const passwordInput = page.locator('input[id="password"]').first();
  84  |     const submitBtn = page.locator('button[type="submit"]').first();
  85  | 
  86  |     // Fill and submit
  87  |     await emailInput.fill('admin@seekerslab.com');
  88  |     await passwordInput.fill('xmUoX0OA5XvSH4csBJbw');
  89  |     await submitBtn.click();
  90  | 
  91  |     // Wait for navigation
  92  |     await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  93  |     await page.waitForTimeout(1000);
  94  | 
  95  |     // Check where we ended up
  96  |     const url = page.url();
  97  |     console.log('After login, URL:', url);
  98  | 
  99  |     // Should either go to dashboard or 2FA verify (if 2FA is enabled)
  100 |     const isAdmin = url.includes('/admin/');
  101 |     const is2FA = url.includes('/auth/2fa/');
  102 |     expect(isAdmin || is2FA).toBeTruthy();
  103 |   });
  104 | 
  105 |   test('07 - 2FA Routes exist', async ({ page }) => {
  106 |     const routes = [
  107 |       '/auth/2fa/verify',
  108 |       '/auth/2fa/setup',
  109 |     ];
  110 | 
  111 |     for (const route of routes) {
  112 |       const response = await page.request.get(`https://localhost:8443${route}`).catch(() => null);
  113 |       // Routes might return 302 (redirect) or 200 depending on auth state, both are valid
  114 |       expect(response).not.toBeNull();
  115 |       console.log(`${route}: ${response.status()}`);
  116 |     }
  117 |   });
  118 | 
  119 |   test('08 - API endpoints protected', async ({ page }) => {
  120 |     // Try to access admin API without auth
  121 |     const response = await page.request.get('https://localhost:8443/api/v1/users');
  122 | 
  123 |     // Should return 401 (unauthorized)
  124 |     expect(response.status()).toBeGreaterThanOrEqual(400);
  125 |     console.log(`/api/v1/users without auth: ${response.status()}`);
  126 |   });
  127 | 
  128 |   test('09 - 2FA views exist (EJS templates)', async ({ page }) => {
  129 |     // Check that the 2FA verify view responds
  130 |     const verifyResponse = await page.request.get('https://localhost:8443/auth/2fa/verify');
  131 | 
  132 |     // May be 302 (redirect to login) or 200 if authenticated
  133 |     expect([200, 302]).toContain(verifyResponse.status());
  134 | 
  135 |     // Check that the 2FA setup view responds
  136 |     const setupResponse = await page.request.get('https://localhost:8443/auth/2fa/setup');
  137 |     expect([200, 302]).toContain(setupResponse.status());
  138 |   });
  139 | 
  140 |   test('10 - Login page includes demo credentials', async ({ page }) => {
  141 |     await page.goto('https://localhost:8443/login', { waitUntil: 'domcontentloaded' });
  142 | 
  143 |     const pageContent = await page.content();
```