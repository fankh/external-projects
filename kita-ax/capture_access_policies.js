#!/usr/bin/env node

/**
 * Capture Access Policies admin console screenshot from sample HTML
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function captureAccessPolicies() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--no-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 }
  });

  try {
    const htmlFile = path.join(__dirname, 'access_policies_console.html');
    const fileUrl = `file://${htmlFile}`;

    console.log('🌐 Loading Access Policies sample HTML...');
    await page.goto(fileUrl, { waitUntil: 'networkidle' });

    console.log('⏳ Waiting for page to fully render...');
    await page.waitForTimeout(1500);

    // Take screenshot of the entire content
    console.log('📸 Capturing screenshot...');
    const screenshotPath = path.join(__dirname, 'screenshots', 'access_policies.png');

    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
      type: 'png'
    });

    const stats = fs.statSync(screenshotPath);
    console.log(`✅ Screenshot saved: ${screenshotPath}`);
    console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`   Dimensions: 1280x900`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

captureAccessPolicies();
