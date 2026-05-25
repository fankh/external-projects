#!/usr/bin/env node

/**
 * Capture all KYRA admin console pages for proposal PDF
 * Run this on your machine with access to kyra-guardrails-dev.seekerslab.com
 *
 * Usage:
 *   node capture_all_kyra_pages.js
 *
 * Prerequisites:
 *   - npx playwright install chromium
 *   - Active login to KYRA dev server
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://kyra-guardrails-dev.seekerslab.com';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'kyra-real');

// Pages to capture with their URLs and descriptions
const PAGES_TO_CAPTURE = [
  {
    name: 'login',
    url: `${BASE_URL}/login`,
    description: 'Login page',
    waitFor: 'input[type="email"]',
  },
  {
    name: 'dashboard',
    url: `${BASE_URL}/admin/dashboard`,
    description: 'Admin dashboard',
    waitFor: '[class*="dashboard"], h1',
  },
  {
    name: 'documents',
    url: `${BASE_URL}/admin/documents`,
    description: 'Documents page',
    waitFor: '[class*="document"], table, [role="grid"]',
  },
  {
    name: 'access-policies',
    url: `${BASE_URL}/admin/documents/access-policies`,
    description: 'Access Policies tab',
    waitFor: 'table, [role="grid"], [class*="matrix"]',
  },
  {
    name: 'audit-logs',
    url: `${BASE_URL}/admin/audit-logs`,
    description: 'Audit logs page',
    waitFor: 'table, [role="grid"], [class*="log"]',
  },
  {
    name: 'users',
    url: `${BASE_URL}/admin/users`,
    description: 'Users/Roles management',
    waitFor: 'table, [role="grid"], [class*="user"]',
  },
  {
    name: 'settings',
    url: `${BASE_URL}/admin/settings`,
    description: 'Admin settings',
    waitFor: '[class*="settings"], form, [class*="config"]',
  },
  {
    name: 'agents',
    url: `${BASE_URL}/admin/agents`,
    description: 'Agents configuration',
    waitFor: '[class*="agent"], table, [class*="config"]',
  },
  {
    name: 'compliance',
    url: `${BASE_URL}/admin/compliance`,
    description: 'Compliance dashboard',
    waitFor: '[class*="compliance"], chart, [role="grid"]',
  },
  {
    name: 'rag-config',
    url: `${BASE_URL}/admin/rag/config`,
    description: 'RAG system configuration',
    waitFor: '[class*="rag"], form, [class*="config"]',
  },
];

async function captureAllPages() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  KYRA Admin Console — Full Page Capture                       ║');
  console.log('║  For: KITA AI Guardrail Proposal PDF                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Create screenshots directory
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--no-sandbox']
  });

  try {
    const context = await browser.createBrowserContext({
      viewport: { width: 1280, height: 900 },
      locale: 'ko-KR'
    });

    const page = await context.newPage();

    console.log(`📌 Base URL: ${BASE_URL}\n`);
    console.log('⚠️  IMPORTANT NOTES:');
    console.log('   1. Make sure you are already logged in to KYRA dev server');
    console.log('   2. The script will use your existing session cookies');
    console.log('   3. Some pages may require specific permissions\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let successCount = 0;
    let failCount = 0;

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

        // Wait for content to load
        try {
          await page.waitForSelector(pageConfig.waitFor, { timeout: 10000 });
        } catch (e) {
          console.log(`   ⚠️  Selector not found, waiting additional time...`);
          await page.waitForTimeout(2000);
        }

        // Extra wait for rendering
        await page.waitForTimeout(1000);

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
        console.log(`   ❌ Error: ${error.message}`);
        console.log(`   💡 Troubleshooting:`);
        console.log(`      - Check if you're logged in`);
        console.log(`      - Verify page exists in your KYRA instance`);
        console.log(`      - Check permissions for this admin page\n`);

        failCount++;
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n✨ Capture complete!`);
    console.log(`   ✅ Success: ${successCount}/${PAGES_TO_CAPTURE.length}`);
    console.log(`   ❌ Failed: ${failCount}/${PAGES_TO_CAPTURE.length}`);
    console.log(`   📁 Saved to: ${SCREENSHOTS_DIR}\n`);

    if (successCount > 0) {
      console.log('🎯 Next steps:');
      console.log('   1. Review screenshots in screenshots/kyra-real/');
      console.log('   2. Copy desired screenshots to screenshots/ for PDF integration');
      console.log('   3. Run: python3 generate_pdf_from_screenshots.py');
      console.log('   4. Commit and push to GitHub\n');
    }

    await context.close();

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error('\n💡 Common issues:');
    console.error('   - Network: Are you connected to the internet?');
    console.error('   - Auth: Did you log in to KYRA first?');
    console.error('   - Server: Is kyra-guardrails-dev.seekerslab.com online?');
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// Run if called directly
if (require.main === module) {
  captureAllPages().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { captureAllPages, PAGES_TO_CAPTURE };
