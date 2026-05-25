#!/usr/bin/env node

/**
 * Capture all slides from HTML proposal as individual images
 * Usage: npm install && npx playwright install && node capture_all_slides.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function captureAllSlides() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--no-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 897 } // A4 landscape: 297mm x 210mm at 96dpi
  });

  try {
    const htmlFile = path.join(__dirname, 'AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html');
    const fileUrl = `file://${htmlFile}`;

    console.log('🌐 Loading HTML file...');
    await page.goto(fileUrl, { waitUntil: 'networkidle' });

    console.log('⏳ Waiting for page to fully render...');
    await page.waitForTimeout(2000);

    // Get cover page + all content slides
    const coverExists = await page.locator('.cover').count() > 0;
    const contentSlides = await page.locator('.slide').count();
    const slideCount = (coverExists ? 1 : 0) + contentSlides;
    console.log(`📊 Found ${slideCount} slides (cover: ${coverExists ? 'yes' : 'no'}, content: ${contentSlides})\n`);

    // Create screenshots directory
    const screenshotsDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Capture cover page first (if it exists)
    const allSlides = [];
    if (coverExists) {
      allSlides.push(await page.locator('.cover').first());
    }
    // Then capture all content slides
    const contentSlideElements = await page.locator('.slide').all();
    allSlides.push(...contentSlideElements);

    for (let i = 0; i < allSlides.length; i++) {
      const slide = allSlides[i];
      const slideNum = i + 1;

      console.log(`📸 Capturing slide ${slideNum}/${slideCount}...`);

      try {
        // Scroll slide into view
        await slide.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);

        // Capture slide
        const filename = `slide_${String(slideNum).padStart(2, '0')}.png`;
        const filepath = path.join(screenshotsDir, filename);

        await slide.screenshot({ path: filepath });
        console.log(`   ✅ Saved: ${filename}`);
      } catch (error) {
        console.log(`   ❌ Error capturing slide ${slideNum}: ${error.message}`);
      }
    }

    console.log(`\n✨ Done! All ${slideCount} slides captured.`);
    console.log(`📁 Screenshots saved to: screenshots/slide_*.png`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

captureAllSlides();
