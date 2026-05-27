const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const htmlPath = path.resolve('access_policies_console.html');
  
  // Set viewport to match the mockup size
  await page.setViewport({ width: 1280, height: 900 });
  
  // Load the HTML file
  await page.goto(`file://${htmlPath}`, {
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  // Wait for rendering
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Capture screenshot
  const screenshotPath = path.resolve('screenshots', 'access_policies.png');
  
  // Create screenshots dir if it doesn't exist
  if (!fs.existsSync(path.resolve('screenshots'))) {
    fs.mkdirSync(path.resolve('screenshots'), { recursive: true });
  }

  await page.screenshot({
    path: screenshotPath,
    fullPage: false,
    type: 'png'
  });

  await browser.close();

  const stats = fs.statSync(screenshotPath);
  console.log('✅ Screenshot captured: access_policies.png');
  console.log(`📁 Saved to: ${screenshotPath}`);
  console.log(`📊 Size: ${(stats.size / 1024).toFixed(1)} KB`);
})();
