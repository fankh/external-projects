const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Users\\seekers\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe';
const SRC = 'C:\\repos\\external-projects\\kita-ax\\AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html';
const KITA_DIR = 'C:\\repos\\external-projects\\kita-ax';
const OUT = 'C:\\repos\\external-projects\\bnk-kyra-poc\\KYRA AI Guardrail 제품소개서.pdf';

(async () => {
  let html = fs.readFileSync(SRC, 'utf8');

  // BNK-neutral edits (remove KITA/KT DS specifics)
  const edits = [
    ['KITA 맞춤 커스터마이징', '고객 맞춤 커스터마이징'],
    ['• 무역 도메인 RAG 학습<br>', '• 금융 도메인 RAG 학습<br>'],
    ['(통관번호, 사업자번호, 계좌)', '(계좌번호, 카드번호, 사업자번호)'],
    ['• KT DS 운영팀 기술 이전', '• 고객사 운영팀 기술 이전'],
  ];
  for (const [from, to] of edits) {
    if (!html.includes(from)) { console.error('NOT FOUND:', from); process.exit(1); }
    html = html.split(from).join(to);
  }

  // Embed logos
  for (const logo of ['logo_colored.png', 'logo_white.png']) {
    const b64 = fs.readFileSync(path.join(KITA_DIR, logo)).toString('base64');
    html = html.split(`src="${logo}"`).join(`src="data:image/png;base64,${b64}"`);
  }
  // Embed screenshots
  const shots = ['kyra_dashboard.png','kyra_chat.png','kyra_documents.png','kyra_bookmarks.png','kyra_history.png','kyra_analytics.png','kyra_settings.png'];
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
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await browser.close();
  console.log('PDF generated:', OUT);
})();
