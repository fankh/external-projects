#!/usr/bin/env node

/**
 * Capture KYRA mockup console pages as realistic PNG screenshots
 * Works locally without external network access
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

// Pages to capture from local HTML mockups
const PAGES_TO_CAPTURE = [
  {
    name: 'access_policies',
    htmlFile: 'access_policies_console.html',
    description: 'Access Policies — Role × Classification Matrix',
  },
  {
    name: 'dashboard',
    htmlFile: 'kyra_dashboard.html',
    description: 'Dashboard — System Overview',
  },
  {
    name: 'audit_logs',
    htmlFile: 'kyra_audit_logs.html',
    description: 'Audit Logs — Access & Change History',
  },
  {
    name: 'users',
    htmlFile: 'kyra_users.html',
    description: 'Users — Access Control Management',
  },
];

async function captureLocalMockups() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  KYRA Mockup Screenshot Capture — Local HTML Rendering      ║');
  console.log('║  Creating realistic UI screenshots from mockup HTML pages    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Create screenshots directory if it doesn't exist
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

    for (let i = 0; i < PAGES_TO_CAPTURE.length; i++) {
      const pageConfig = PAGES_TO_CAPTURE[i];
      const pageNum = i + 1;

      try {
        console.log(`📸 Capturing (${pageNum}/${PAGES_TO_CAPTURE.length}): ${pageConfig.description}`);

        const htmlPath = path.join(__dirname, pageConfig.htmlFile);
        const fileUrl = `file://${htmlPath}`;
        console.log(`   File: ${pageConfig.htmlFile}`);

        // Navigate to local HTML file
        await page.goto(fileUrl, {
          waitUntil: 'networkidle',
          timeout: 10000
        });

        // Wait for rendering to complete
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Take screenshot
        const filename = `kyra_${pageConfig.name}.png`;
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
      console.log(`   1. ✅ Screenshots captured in ${SCREENSHOTS_DIR}`);
      console.log(`   2. Push to GitHub: git add screenshots/kyra_*.png && git push`);
      console.log(`   3. Update PDF with real screenshot references\n`);
    }
  }
}

// Run
captureLocalMockups().catch(console.error);
