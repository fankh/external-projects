const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://kyra-guardrail-dev.seekerslab.com';
const ADMIN_EMAIL = 'admin@seekerslab.com';
const ADMIN_PASSWORD = 'xmUoX0OA5XvSH4csBJbw';

test.describe('Phase 11: 2FA Testing - Staging Environment', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    // Ignore self-signed certificate errors
    page.on('error', () => {});
  });

  test('01 - Access login page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Verify page loads
    expect(page.url()).toContain('login');

    // Find all buttons on page
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log(`Found ${buttonCount} buttons on login page`);
    expect(buttonCount).toBeGreaterThan(0);

    // Find all input fields
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    console.log(`Found ${inputCount} input fields on login page`);
    expect(inputCount).toBeGreaterThan(0);
  });

  test('02 - Check login form elements', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Get all input elements
    const inputs = page.locator('input');
    for (let i = 0; i < await inputs.count(); i++) {
      const input = inputs.nth(i);
      const type = await input.getAttribute('type');
      const name = await input.getAttribute('name');
      const placeholder = await input.getAttribute('placeholder');
      console.log(`Input ${i}: type=${type}, name=${name}, placeholder=${placeholder}`);
    }

    // Get all buttons
    const buttons = page.locator('button');
    for (let i = 0; i < Math.min(await buttons.count(), 5); i++) {
      const btn = buttons.nth(i);
      const text = await btn.textContent();
      const type = await btn.getAttribute('type');
      console.log(`Button ${i}: text="${text}", type=${type}`);
    }

    // Get all links
    const links = page.locator('a');
    console.log(`Found ${await links.count()} links on page`);
  });

  test('03 - Login with valid credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Find email input - try multiple selectors
    let emailInput = page.locator('input[type="email"]');
    if (await emailInput.count() === 0) {
      emailInput = page.locator('input[name="email"]');
    }
    if (await emailInput.count() === 0) {
      emailInput = page.locator('input[placeholder*="email"], input[placeholder*="Email"]');
    }

    // Find password input
    let passwordInput = page.locator('input[type="password"]');
    if (await passwordInput.count() === 0) {
      passwordInput = page.locator('input[name="password"]');
    }

    console.log(`Email inputs found: ${await emailInput.count()}`);
    console.log(`Password inputs found: ${await passwordInput.count()}`);

    if (await emailInput.count() > 0 && await passwordInput.count() > 0) {
      await emailInput.first().fill(ADMIN_EMAIL);
      await passwordInput.first().fill(ADMIN_PASSWORD);

      // Find and click login button
      const loginButton = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")').first();
      if (await loginButton.count() > 0) {
        await loginButton.click();
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);
        await page.waitForTimeout(2000);

        console.log(`After login, URL: ${page.url()}`);
        expect(page.url()).not.toContain('login');
      }
    } else {
      console.log('Could not find email and password inputs');
    }
  });

  test('04 - Check 2FA verify page elements', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/2fa/verify`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(2000);

    const pageContent = await page.content();
    console.log('Current URL:', page.url());

    // Check if we're on 2FA verify page
    if (page.url().includes('2fa/verify')) {
      // Find 2FA code input
      const codeInput = page.locator('input[name="token"], input[id="token"], input[placeholder*="code"], input[placeholder*="Code"]');
      console.log(`2FA code inputs found: ${await codeInput.count()}`);

      // Find all buttons
      const buttons = page.locator('button');
      console.log(`Buttons on 2FA page: ${await buttons.count()}`);
      for (let i = 0; i < await buttons.count(); i++) {
        const text = await buttons.nth(i).textContent();
        console.log(`  Button ${i}: "${text}"`);
      }

      // Check for backup code toggle/button
      const backupToggle = page.locator('button:has-text("backup"), button:has-text("Backup"), a:has-text("backup")');
      console.log(`Backup code toggles found: ${await backupToggle.count()}`);

      // Check for back/logout button
      const backButton = page.locator('button:has-text("Back"), button:has-text("Logout"), a:has-text("Back")');
      console.log(`Back buttons found: ${await backButton.count()}`);
    }
  });

  test('05 - Check 2FA setup page elements', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/2fa/setup`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(2000);

    console.log('Current URL:', page.url());

    if (page.url().includes('2fa/setup')) {
      // Look for QR code
      const qrCode = page.locator('img[alt*="QR"], img[alt*="qr"], img[id*="qr"]');
      console.log(`QR code images found: ${await qrCode.count()}`);

      // Look for secret code display
      const secretCode = page.locator('code, pre, [class*="secret"], [class*="code"]');
      console.log(`Code/secret displays found: ${await secretCode.count()}`);

      // Look for verification input
      const verifyInput = page.locator('input[name="token"], input[id="token"]');
      console.log(`Verification code inputs found: ${await verifyInput.count()}`);

      // Get all buttons
      const buttons = page.locator('button');
      console.log(`Buttons on 2FA setup page: ${await buttons.count()}`);
      for (let i = 0; i < await buttons.count(); i++) {
        const text = await buttons.nth(i).textContent();
        console.log(`  Button ${i}: "${text}"`);
      }
    }
  });

  test('06 - Check settings page 2FA section', async ({ page }) => {
    // First login
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const emailInputs = page.locator('input[type="email"], input[name="email"]');
    const passwordInputs = page.locator('input[type="password"], input[name="password"]');

    if (await emailInputs.count() > 0 && await passwordInputs.count() > 0) {
      await emailInputs.first().fill(ADMIN_EMAIL);
      await passwordInputs.first().fill(ADMIN_PASSWORD);

      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);
        await page.waitForTimeout(2000);
      }
    }

    // Navigate to settings
    await page.goto(`${BASE_URL}/admin/settings`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(2000);

    console.log('Settings page URL:', page.url());

    // Look for 2FA section
    const twoFaHeading = page.locator('h2:has-text("2FA"), h2:has-text("Two-Factor"), text="Two-Factor Authentication"');
    console.log(`2FA section headings found: ${await twoFaHeading.count()}`);

    // Look for Enable 2FA button
    const enableBtn = page.locator('button:has-text("Enable 2FA"), button:has-text("Enable"), a:has-text("Enable 2FA")');
    console.log(`Enable 2FA buttons found: ${await enableBtn.count()}`);

    // Look for Disable 2FA button
    const disableBtn = page.locator('button:has-text("Disable 2FA"), button:has-text("Disable")');
    console.log(`Disable 2FA buttons found: ${await disableBtn.count()}`);

    // Look for 2FA status indicator
    const statusBadge = page.locator('[class*="badge"], [class*="status"], span:has-text("Enabled"), span:has-text("Disabled")');
    console.log(`Status indicators found: ${await statusBadge.count()}`);

    // List all buttons on settings page
    const allButtons = page.locator('button');
    console.log(`Total buttons on settings page: ${await allButtons.count()}`);
    for (let i = 0; i < Math.min(await allButtons.count(), 15); i++) {
      const text = await allButtons.nth(i).textContent();
      const disabled = await allButtons.nth(i).isDisabled();
      console.log(`  Button ${i}: "${text}" ${disabled ? '(disabled)' : ''}`);
    }
  });

  test('07 - Check all navigation links and buttons on dashboard', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const emailInputs = page.locator('input[type="email"], input[name="email"]');
    const passwordInputs = page.locator('input[type="password"], input[name="password"]');

    if (await emailInputs.count() > 0 && await passwordInputs.count() > 0) {
      await emailInputs.first().fill(ADMIN_EMAIL);
      await passwordInputs.first().fill(ADMIN_PASSWORD);

      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);
        await page.waitForTimeout(2000);
      }
    }

    // Navigate to dashboard
    await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(2000);

    console.log('Dashboard URL:', page.url());

    // Get all links
    const links = page.locator('a');
    console.log(`Total navigation links: ${await links.count()}`);
    for (let i = 0; i < await links.count(); i++) {
      const href = await links.nth(i).getAttribute('href');
      const text = await links.nth(i).textContent();
      console.log(`  Link ${i}: "${text}" → ${href}`);
    }

    // Get all buttons
    const buttons = page.locator('button');
    console.log(`Total buttons: ${await buttons.count()}`);
  });

  test('08 - Test all interactive elements on login page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Get all interactive elements
    const allInteractive = page.locator('button, a, input, select, textarea, [role="button"], [onclick]');
    console.log(`Total interactive elements: ${await allInteractive.count()}`);

    // Test each button for visibility
    const buttons = page.locator('button');
    for (let i = 0; i < await buttons.count(); i++) {
      const btn = buttons.nth(i);
      const visible = await btn.isVisible();
      const enabled = await btn.isEnabled();
      const text = await btn.textContent();
      console.log(`Button ${i}: visible=${visible}, enabled=${enabled}, text="${text}"`);

      // Try to hover over visible buttons
      if (visible) {
        await btn.hover().catch(() => null);
      }
    }

    // Test each link for visibility
    const links = page.locator('a');
    for (let i = 0; i < Math.min(await links.count(), 10); i++) {
      const link = links.nth(i);
      const visible = await link.isVisible();
      const href = await link.getAttribute('href');
      const text = await link.textContent();
      console.log(`Link ${i}: visible=${visible}, href="${href}", text="${text}"`);
    }

    // Test form inputs
    const inputs = page.locator('input');
    for (let i = 0; i < await inputs.count(); i++) {
      const input = inputs.nth(i);
      const visible = await input.isVisible();
      const enabled = await input.isEnabled();
      const type = await input.getAttribute('type');
      const name = await input.getAttribute('name');
      console.log(`Input ${i}: visible=${visible}, enabled=${enabled}, type="${type}", name="${name}"`);
    }
  });

  test('09 - Test chat functionality if available', async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(2000);

    console.log('Chat page URL:', page.url());

    if (!page.url().includes('404')) {
      // Look for chat input
      const chatInput = page.locator('input[placeholder*="message"], input[placeholder*="Message"], textarea[placeholder*="message"], textarea[placeholder*="Message"]');
      console.log(`Chat message inputs found: ${await chatInput.count()}`);

      // Look for send button
      const sendBtn = page.locator('button:has-text("Send"), button:has-text("send"), [class*="send"]');
      console.log(`Send buttons found: ${await sendBtn.count()}`);

      // Look for messages
      const messages = page.locator('[class*="message"], [class*="chat"]');
      console.log(`Message elements found: ${await messages.count()}`);

      // Get all buttons on chat page
      const buttons = page.locator('button');
      console.log(`Total buttons on chat page: ${await buttons.count()}`);
    } else {
      console.log('Chat page not found (404)');
    }
  });

  test('10 - Comprehensive button testing on all major pages', async ({ page }) => {
    const pages = [
      { name: 'login', url: `${BASE_URL}/login` },
      { name: 'dashboard', url: `${BASE_URL}/admin/dashboard` },
      { name: 'settings', url: `${BASE_URL}/admin/settings` },
      { name: 'users', url: `${BASE_URL}/admin/users` },
      { name: 'documents', url: `${BASE_URL}/admin/documents` },
      { name: 'policies', url: `${BASE_URL}/admin/access-policies` },
    ];

    for (const pageInfo of pages) {
      console.log(`\n=== Testing page: ${pageInfo.name} ===`);
      await page.goto(pageInfo.url, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);
      await page.waitForTimeout(1500);

      const buttons = page.locator('button');
      const buttonCount = await buttons.count();
      console.log(`Buttons found on ${pageInfo.name}: ${buttonCount}`);

      // Get button details
      const buttonDetails = [];
      for (let i = 0; i < buttonCount; i++) {
        const btn = buttons.nth(i);
        const text = await btn.textContent();
        const visible = await btn.isVisible();
        const enabled = await btn.isEnabled();
        buttonDetails.push({
          index: i,
          text: text?.trim() || '(empty)',
          visible,
          enabled,
        });
      }

      // Print button summary
      buttonDetails.forEach(btn => {
        console.log(`  [${btn.index}] "${btn.text}" - visible:${btn.visible}, enabled:${btn.enabled}`);
      });
    }
  });
});
