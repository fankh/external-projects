const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Users\\seekers\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe';
const HTML = path.join(__dirname, 'bnk_network_diagram.html');
const KITA_DIR = 'C:\\repos\\external-projects\\kita-ax';
const OUT_DIR = 'C:\\repos\\external-projects\\bnk-kyra-poc';
const OUT = path.join(OUT_DIR, 'KYRA 네트워크 구성도_BNK금융그룹.pdf');

(async () => {
  let html = fs.readFileSync(HTML, 'utf8');
  for (const logo of ['logo_colored.png', 'logo_white.png']) {
    const b64 = fs.readFileSync(path.join(KITA_DIR, logo)).toString('base64');
    html = html.split(`src="${logo}"`).join(`src="data:image/png;base64,${b64}"`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
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
