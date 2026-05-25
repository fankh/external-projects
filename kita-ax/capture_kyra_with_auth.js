#!/usr/bin/env node

/**
 * Capture KYRA admin console pages with automatic authentication
 * Uses provided credentials to log in and capture real screenshots
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://kyra-guardrails-dev.seekerslab.com';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'kyra-real');

// Credentials
const CREDENTIALS = {
  email: 'admin@seekerslab.com',
  password: 'xmUoX0OA5XvSH4csBJbw'
};

// Pages to capture
const PAGES_TO_CAPTURE = [
  {
    name: 'login',
    url: `${BASE_URL}/login`,
    description: 'Login page',
    waitFor: 'input[type="email"], form',
    skipLogin: true
  },
  {
    name: 'dashboard',
    url: `${BASE_URL}/admin/dashboard`,
    description: 'Admin dashboard',
    waitFor: '[class*="dashboard"], h1, main'
  },
  {
    name: 'documents',
    url: `${BASE_URL}/admin/documents`,
    description: 'Documents page',
    waitFor: '[class*="document"], table, [role="grid"], main'
  },
  {
    name: 'access-policies',
    url: `${BASE_URL}/admin/documents/access-policies`,
    description: 'Access Policies tab',
    waitFor: 'table, [role="grid"], [class*="matrix"], [class*="policy"]'
  },
  {
    name: 'audit-logs',
    url: `${BASE_URL}/admin/audit-logs`,
    description: 'Audit logs',
    waitFor: 'table, [role="grid"], [class*="log"], main'
  },
  {
    name: 'users',
    url: `${BASE_URL}/admin/users`,
    description: 'Users management',
    waitFor: 'table, [role="grid"], [class*="user"], main'
  },
  {
    name: 'settings',
    url: `${BASE_URL}/admin/settings`,
    description: 'Admin settings',
    waitFor: '[class*="settings"], form, [class*="config"], main'
  },
  {
    name: 'agents',
    url: `${BASE_URL}/admin/agents`,
    description: 'Agents configuration',
    waitFor: '[class*="agent"], [class*="config"], main'
  },
];

async function captureWithAuth() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  KYRA Real Screenshot Capture — With Authentication           ║');
  console.log('║  Capturing from: ' + BASE_URL.padEnd(42) + ' ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Create screenshots directory
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  let successCount = 0;
  let failCount = 0;

  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 }
    });

    console.log(`🔐 Logging in with: ${CREDENTIALS.email}\n`);

    // Step 1: Go to login page
    try {
      await page.goto(`${BASE_URL}/login`, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      console.log('✅ Login page loaded');

      // Wait for email input
      await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });

      // Fill in credentials
      console.log('✍️  Entering credentials...');

      // Try different selectors for email field
      const emailInputs = await page.locator('input[type="email"], input[name="email"]').all();
      if (emailInputs.length > 0) {
        await emailInputs[0].fill(CREDENTIALS.email);
      }

      // Try different selectors for password field
      const passwordInputs = await page.locator('input[type="password"], input[name="password"]').all();
      if (passwordInputs.length > 0) {
        await passwordInputs[0].fill(CREDENTIALS.password);
      }

      // Click submit button
      const submitBtn = await page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login"), button:has-text("로그인")').first();
      if (submitBtn) {
        await submitBtn.click();
        console.log('✅ Submitted login form\n');
      }

      // Wait for navigation
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {
        console.log('⚠️  Navigation timeout (may still be logged in)');
      });

      // Wait a bit for dashboard to load
      await page.waitForTimeout(2000);

      // Check if logged in
      const isLoggedIn = await page.locator('[class*="profile"], [class*="user"], [class*="dashboard"]').first().isVisible({ timeout: 5000 }).catch(() => false);

      if (isLoggedIn) {
        console.log('✅ Successfully logged in!\n');
      } else {
        console.log('⚠️  Could not confirm login status, attempting to continue...\n');
      }

      // Now capture all pages
      for (let i = 0; i < PAGES_TO_CAPTURE.length; i++) {
        const pageConfig = PAGES_TO_CAPTURE[i];
        const pageNum = i + 1;

        try {
          console.log(`📸 Capturing (${pageNum}/${PAGES_TO_CAPTURE.length}): ${pageConfig.description}`);
          console.log(`   URL: ${pageConfig.url}`);

          // Navigate to page
          await page.goto(pageConfig.url, {
            waitUntil: 'networkidle',
            timeout: 30000
          });

          // Wait for content
          try {
            await page.waitForSelector(pageConfig.waitFor, { timeout: 10000 });
          } catch (e) {
            console.log(`   ⚠️  Content selector not found, waiting extra time...`);
            await page.waitForTimeout(2000);
          }

          // Extra wait for rendering
          await page.waitForTimeout(1500);

          // Take screenshot
          const filename = `kyra_${String(pageNum).padStart(2, '0')}_${pageConfig.name}.png`;
          const filepath = path.join(SCREENSHOTS_DIR, filename);

          await page.screenshot({
            path: filepath,
            fullPage: false,
            type: 'png'
          });

          const stats = fs.statSync(filepath);
          console.log(`   ✅ Saved: ${filename} (${(stats.size / 1024).toFixed(1)} KB)\n`);

          successCount++;

        } catch (error) {
          console.log(`   ❌ Error: ${error.message}\n`);
          failCount++;
        }
      }

      await page.close();

    } catch (error) {
      console.error(`\n❌ Login failed: ${error.message}`);
      console.error('\nTroubleshooting:');
      console.error('  - Check if credentials are correct');
      console.error('  - Verify KYRA server is online');
      console.error('  - Check network/VPN connection');
    }

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
  } finally {
    await browser.close();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n✨ Capture complete!`);
    console.log(`   ✅ Success: ${successCount}/${PAGES_TO_CAPTURE.length}`);
    console.log(`   ❌ Failed: ${failCount}/${PAGES_TO_CAPTURE.length}`);
    console.log(`   📁 Saved to: ${SCREENSHOTS_DIR}\n`);

    if (successCount > 0) {
      console.log('🎯 Next steps:');
      console.log(`   1. Check screenshots in ${SCREENSHOTS_DIR}`);
      console.log('   2. Verify kyra_04_access-policies.png looks good');
      console.log('   3. Copy to: cp screenshots/kyra-real/kyra_04_access-policies.png screenshots/access_policies.png');
      console.log('   4. Regenerate PDF and push to GitHub\n');
    }
  }
}

// Run
captureWithAuth().catch(console.error);
