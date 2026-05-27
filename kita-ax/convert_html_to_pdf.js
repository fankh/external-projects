const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  const htmlPath = path.resolve('AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html');
  const currentDir = path.dirname(htmlPath);
  
  // Read HTML
  let htmlContent = fs.readFileSync(htmlPath, 'utf8');
  
  // Convert logos to base64 and embed
  const logosToEmbed = ['logo_colored.png', 'logo_white.png'];
  
  for (const logoFile of logosToEmbed) {
    const logoPath = path.join(currentDir, logoFile);
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      const base64Logo = logoBuffer.toString('base64');
      
      // Replace ALL instances (use global regex)
      const regex = new RegExp(`src="${logoFile}"`, 'g');
      htmlContent = htmlContent.replace(regex, `src="data:image/png;base64,${base64Logo}"`);
      console.log(`✓ Embedded ${logoFile} as base64`);
    }
  }
  
  // Embed real KYRA screenshots from kyra-real directory
  const screenshotDir = path.join(currentDir, 'screenshots', 'kyra-real');
  const screenshotFiles = ['kyra_04_access-policies.png'];

  for (const screenshotFile of screenshotFiles) {
    const screenshotPath = path.join(screenshotDir, screenshotFile);
    if (fs.existsSync(screenshotPath)) {
      const imageBuffer = fs.readFileSync(screenshotPath);
      const base64Image = imageBuffer.toString('base64');

      // Replace ALL instances (use global regex)
      htmlContent = htmlContent.replace(
        /src="\.\/screenshots\/kyra-real\/kyra_04_access-policies\.png"/g,
        `src="data:image/png;base64,${base64Image}"`
      );
      console.log(`✓ Embedded ${screenshotFile} (real KYRA screenshot) as base64`);
    }
  }
  
  await page.setContent(htmlContent, {
    waitUntil: 'networkidle0',
    timeout: 30000
  });
  
  await page.pdf({
    path: 'AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf',
    format: 'A4',
    landscape: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    displayHeaderFooter: false
  });
  
  await browser.close();
  console.log('✅ PDF generated with all embedded images: AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf');
})();
