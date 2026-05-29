const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://localhost:8443';

test.use({ ignoreHTTPSErrors: true });

test('Debug login flow', async ({ page }) => {
  console.log('\n=== Starting login debug test ===');
  
  // Navigate to login
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  console.log('✓ Navigated to login page');
  
  // Check page content
  const content = await page.content();
  console.log('✓ Page loaded, content length:', content.length);

  // Extract CSRF token from hidden field
  const csrfValue = await page.inputValue('input[name="_csrf"]');
  console.log('✓ CSRF token:', csrfValue ? csrfValue.substring(0, 20) + '...' : 'NOT FOUND');

  // Fill form
  await page.fill('input[type="email"]', 'admin@seekerslab.com');
  console.log('✓ Filled email');

  await page.fill('input[type="password"]', 'xmUoX0OA5XvSH4csBJbw');
  console.log('✓ Filled password');

  // Verify CSRF is still there
  const csrfCheck = await page.inputValue('input[name="_csrf"]');
  console.log('✓ CSRF before submit:', csrfCheck ? 'present' : 'MISSING');
  
  // Click submit
  console.log('✓ Clicking submit...');
  const [response] = await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }),
    page.click('button[type="submit"]')
  ]);
  
  console.log('✓ Response status:', response.status());
  console.log('✓ Final URL:', page.url());
  
  expect(page.url()).toContain('/admin');
});
