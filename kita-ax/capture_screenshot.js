#!/usr/bin/env node

/**
 * Playwright script to capture Access Policies screenshot from KYRA admin console
 * Usage: npx playwright install && node capture_screenshot.js
 */

const { chromium } = require('playwright');
const path = require('path');

async function captureAccessPoliciesScreenshot() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--no-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 }
  });

  try {
    console.log('🌐 Navigating to KYRA admin console...');

    // Navigate to the documents page
    await page.goto('https://kyra-guardrail-dev.seekerslab.com/admin/documents', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait a bit for the page to fully load
    await page.waitForTimeout(2000);

    // Check if we're logged in (look for the admin header)
    const isLoggedIn = await page.isVisible('[class*="admin"]', { timeout: 5000 }).catch(() => false);

    if (!isLoggedIn) {
      console.log('⚠️  Not logged in. Please log in manually first.');
      console.log('Visit: https://kyra-guardrails-dev.seekerslab.com/chat');
      await browser.close();
      return;
    }

    console.log('✅ Page loaded successfully');

    // Click on Access Policies tab
    console.log('📌 Clicking on Access Policies tab...');
    const accessPoliciesTab = await page.locator(
      'button:has-text("Access Policies"), a:has-text("Access Policies"), [role="tab"]:has-text("Access Policies")'
    ).first();

    if (!accessPoliciesTab) {
      console.log('❌ Access Policies tab not found. Looking for alternative selectors...');
      // Try looking for any tab that contains "Policies"
      const allTabs = await page.locator('[role="tab"]').all();
      for (const tab of allTabs) {
        const text = await tab.textContent();
        if (text && text.includes('Policies')) {
          await tab.click();
          console.log(`✅ Clicked on tab: ${text}`);
          break;
        }
      }
    } else {
      await accessPoliciesTab.click();
    }

    // Wait for the policies table to load
    await page.waitForTimeout(2000);

    // Wait for the role/classification matrix to be visible
    console.log('⏳ Waiting for Access Policies content to load...');
    await page.waitForSelector('table, [role="grid"], [class*="matrix"]', {
      timeout: 10000
    }).catch(() => {
      console.log('⚠️  Could not find table/grid element, proceeding anyway...');
    });

    // Scroll to ensure the policies table is fully visible
    await page.evaluate(() => {
      const element = document.querySelector('table, [role="grid"], [class*="matrix"]');
      if (element) {
        element.scrollIntoView({ behavior: 'auto', block: 'center' });
      }
    });

    await page.waitForTimeout(1000);

    // Take screenshot
    const screenshotPath = path.join(__dirname, 'screenshots', 'access_policies.png');
    console.log(`📸 Capturing screenshot to: ${screenshotPath}`);

    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
      type: 'png'
    });

    console.log(`✅ Screenshot saved: ${screenshotPath}`);

    // Get file info
    const fs = require('fs');
    const stats = fs.statSync(screenshotPath);
    console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);

  } catch (error) {
    console.error('❌ Error:', error.message);

    // Take a screenshot of the error state for debugging
    try {
      await page.screenshot({
        path: path.join(__dirname, 'screenshots', 'error_screenshot.png'),
        fullPage: true
      });
      console.log('📸 Error screenshot saved to screenshots/error_screenshot.png');
    } catch (e) {
      console.log('Could not save error screenshot');
    }
  } finally {
    await browser.close();
    console.log('✨ Done!');
  }
}

// Run the script
captureAccessPoliciesScreenshot();
