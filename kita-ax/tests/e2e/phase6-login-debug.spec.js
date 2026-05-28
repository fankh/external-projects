const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://localhost:8443';
const ADMIN_EMAIL = 'admin@seekerslab.com';
const ADMIN_PASSWORD = 'xmUoX0OA5XvSH4csBJbw';

test.use({ ignoreHTTPSErrors: true });

test('Debug: Login form submission and session', async ({ page, context }) => {
  // Go to login page
  await page.goto(`${BASE_URL}/login`);

  // Get initial cookies
  const initialCookies = await context.cookies();
  console.log('Initial cookies:', initialCookies);

  // Get CSRF token from HTML
  const csrfToken = await page.locator('input[name="_csrf"]').inputValue();
  console.log('CSRF Token:', csrfToken);

  // Fill form
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);

  // Intercept network requests to see what's being sent
  let loginResponse = null;
  await page.on('response', (response) => {
    if (response.url().includes('/login') && response.request().method() === 'POST') {
      loginResponse = response;
      console.log('Login response status:', response.status());
      console.log('Login response URL:', response.url());
    }
  });

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for navigation or timeout
  await page.waitForLoadState('networkidle');

  // Log final state
  console.log('Final URL:', page.url());
  console.log('Final cookies:', await context.cookies());
  console.log('Page content length:', (await page.content()).length);

  // Check if logged in
  const isOnDashboard = page.url().includes('/admin/dashboard');
  const isOnLogin = page.url().includes('/login');

  console.log('On dashboard:', isOnDashboard);
  console.log('On login:', isOnLogin);

  if (isOnLogin) {
    // Try to extract any error messages
    const errorMsg = await page.locator('.alert-error').textContent().catch(() => null);
    console.log('Error message:', errorMsg);
  }

  expect(isOnDashboard || isOnLogin).toBeTruthy();
});

test('Debug: Direct POST request for login', async ({ page, context }) => {
  // First get login page to extract CSRF
  await page.goto(`${BASE_URL}/login`);
  const csrfToken = await page.locator('input[name="_csrf"]').inputValue();
  console.log('CSRF from page:', csrfToken);

  // Get cookies
  const cookies = await context.cookies();
  console.log('Cookies before POST:', cookies);

  // Make direct POST request
  const response = await page.request.post(`${BASE_URL}/login`, {
    data: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      _csrf: csrfToken
    }
  });

  console.log('Direct POST response status:', response.status());
  console.log('Direct POST response body:', await response.text());

  // Check cookies after
  const cookiesAfter = await context.cookies();
  console.log('Cookies after POST:', cookiesAfter);
});
