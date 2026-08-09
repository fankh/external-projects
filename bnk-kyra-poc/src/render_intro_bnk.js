const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Users\\seekers\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe';
const HTML = path.join(__dirname, 'kyra_intro_bnk.html');
const KITA_DIR = 'C:\\repos\\external-projects\\kita-ax';
const OUT = 'C:\\repos\\external-projects\\bnk-kyra-poc\\KYRA AI Guardrail 제품소개서.pdf';

(async () => {
  let html = fs.readFileSync(HTML, 'utf8');

  const shots = ['kyra_chat.png','kyra_documents.png','kyra_dashboard.png','kyra_bookmarks.png','kyra_history.png','kyra_analytics.png','kyra_settings.png'];
  for (const s of shots) {
    const p = path.join(KITA_DIR, 'screenshots', 'kyra-real', s);
    if (fs.existsSync(p)) {
      const b64 = fs.readFileSync(p).toString('base64');
      html = html.split(`src="./screenshots/kyra-real/${s}"`).join(`src="data:image/png;base64,${b64}"`);
    } else {
      console.error('screenshot missing:', s);
    }
  }

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });
  await page.pdf({
    path: OUT,
    width: '338.67mm',
    height: '190.5mm',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await browser.close();
  console.log('PDF generated:', OUT);
})();
