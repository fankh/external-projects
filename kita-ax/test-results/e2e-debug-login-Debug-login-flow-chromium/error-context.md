# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/debug-login.spec.js >> Debug login flow
- Location: tests/e2e/debug-login.spec.js:7:1

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "/admin"
Received string:    "https://localhost:8443/login?redirect=%2Fadmin%2Fdashboard"
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
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | const BASE_URL = 'https://localhost:8443';
  4  | 
  5  | test.use({ ignoreHTTPSErrors: true });
  6  | 
  7  | test('Debug login flow', async ({ page }) => {
  8  |   console.log('\n=== Starting login debug test ===');
  9  |   
  10 |   // Navigate to login
  11 |   await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  12 |   console.log('✓ Navigated to login page');
  13 |   
  14 |   // Check page content
  15 |   const content = await page.content();
  16 |   console.log('✓ Page loaded, content length:', content.length);
  17 | 
  18 |   // Extract CSRF token from hidden field
  19 |   const csrfValue = await page.inputValue('input[name="_csrf"]');
  20 |   console.log('✓ CSRF token:', csrfValue ? csrfValue.substring(0, 20) + '...' : 'NOT FOUND');
  21 | 
  22 |   // Fill form
  23 |   await page.fill('input[type="email"]', 'admin@seekerslab.com');
  24 |   console.log('✓ Filled email');
  25 | 
  26 |   await page.fill('input[type="password"]', 'xmUoX0OA5XvSH4csBJbw');
  27 |   console.log('✓ Filled password');
  28 | 
  29 |   // Verify CSRF is still there
  30 |   const csrfCheck = await page.inputValue('input[name="_csrf"]');
  31 |   console.log('✓ CSRF before submit:', csrfCheck ? 'present' : 'MISSING');
  32 |   
  33 |   // Click submit
  34 |   console.log('✓ Clicking submit...');
  35 |   const [response] = await Promise.all([
  36 |     page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }),
  37 |     page.click('button[type="submit"]')
  38 |   ]);
  39 |   
  40 |   console.log('✓ Response status:', response.status());
  41 |   console.log('✓ Final URL:', page.url());
  42 |   
> 43 |   expect(page.url()).toContain('/admin');
     |                      ^ Error: expect(received).toContain(expected) // indexOf
  44 | });
  45 | 
```