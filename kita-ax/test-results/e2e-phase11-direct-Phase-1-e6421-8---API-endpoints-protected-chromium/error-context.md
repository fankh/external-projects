# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/phase11-direct.spec.js >> Phase 11: 2FA Direct HTML Testing >> 08 - API endpoints protected
- Location: tests/e2e/phase11-direct.spec.js:119:3

# Error details

```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 400
Received:    200
```

# Test source

```ts
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
  43  |       expect(await codeInput.count()).toBeGreaterThan(0);
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
> 124 |     expect(response.status()).toBeGreaterThanOrEqual(400);
      |                               ^ Error: expect(received).toBeGreaterThanOrEqual(expected)
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
  144 |     expect(pageContent).toContain('admin@seekerslab.com');
  145 |     expect(pageContent).toContain('xmUoX0OA5XvSH4csBJbw');
  146 |     expect(pageContent).toContain('Demo Credentials');
  147 |   });
  148 | 
  149 |   test('11 - Comprehensive page structure check', async ({ page }) => {
  150 |     const pages = [
  151 |       { url: 'https://localhost:8443/', name: 'Home' },
  152 |       { url: 'https://localhost:8443/login', name: 'Login' },
  153 |       { url: 'https://localhost:8443/health', name: 'Health' },
  154 |       { url: 'https://localhost:8443/api/docs', name: 'API Docs' },
  155 |     ];
  156 | 
  157 |     for (const p of pages) {
  158 |       const response = await page.goto(p.url, { waitUntil: 'domcontentloaded' }).catch(() => null);
  159 |       if (response) {
  160 |         console.log(`${p.name} (${p.url}): ${response.status()}`);
  161 |         expect(response.status()).toBeLessThan(500);
  162 |       }
  163 |     }
  164 |   });
  165 | 
  166 |   test('12 - Button elements exist on login', async ({ page }) => {
  167 |     await page.goto('https://localhost:8443/login', { waitUntil: 'domcontentloaded' });
  168 | 
  169 |     const buttons = page.locator('button');
  170 |     const buttonCount = await buttons.count();
  171 |     console.log(`Login page has ${buttonCount} buttons`);
  172 |     expect(buttonCount).toBeGreaterThan(0);
  173 | 
  174 |     // Get button texts
  175 |     for (let i = 0; i < buttonCount; i++) {
  176 |       const text = await buttons.nth(i).textContent();
  177 |       console.log(`  Button ${i}: "${text}"`);
  178 |     }
  179 |   });
  180 | 
  181 |   test('13 - Form action points to login endpoint', async ({ page }) => {
  182 |     await page.goto('https://localhost:8443/login', { waitUntil: 'domcontentloaded' });
  183 | 
  184 |     const form = page.locator('form').first();
  185 |     const action = await form.getAttribute('action');
  186 |     const method = await form.getAttribute('method');
  187 | 
  188 |     expect(action).toContain('login');
  189 |     expect(method.toUpperCase()).toBe('POST');
  190 |     console.log(`Form: action=${action}, method=${method}`);
  191 |   });
  192 | 
  193 |   test('14 - CSRF token present on forms', async ({ page }) => {
  194 |     const pages = [
  195 |       'https://localhost:8443/login',
  196 |       'https://localhost:8443/auth/2fa/verify',
  197 |     ];
  198 | 
  199 |     for (const url of pages) {
  200 |       await page.goto(url, { waitUntil: 'domcontentloaded' });
  201 |       const csrfToken = page.locator('input[name="_csrf"]').first();
  202 |       const hasCSRF = await csrfToken.count() > 0;
  203 |       console.log(`${new URL(url).pathname}: CSRF=${hasCSRF}`);
  204 |     }
  205 |   });
  206 | 
  207 |   test('15 - TwoFactorService methods callable via API', async ({ page }) => {
  208 |     // This would require authentication and proper testing
  209 |     // For now, just verify the endpoint exists
  210 |     const response = await page.request.get('https://localhost:8443/api/v1/2fa/status').catch(() => null);
  211 | 
  212 |     // May get 401 (not authed) or 404 (endpoint doesn't exist)
  213 |     // Either is acceptable for this test
  214 |     console.log('2FA API endpoint status: ', response ? response.status() : 'unreachable');
  215 |   });
  216 | });
  217 | 
```