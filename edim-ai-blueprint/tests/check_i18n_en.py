# -*- coding: utf-8 -*-
"""B9 i18n 검증 — EN 로케일로 33화면 크롬(라벨·버튼·그리드 헤더·그룹박스·콤보·칩) 한글 잔존 0.

Next 메인 콘솔 대상 (2026-07-19 개편): locale 은 edim_locale 쿠키(SSR), 화면은 menus.ts
node id → href 실 라우트. BASE 환경변수로 대상 지정(경로 무시, origin 만 사용).
데이터 셀(품명·공급처·문서 제목 등 콘텐츠)은 별도 번역 트랙 — 검사 제외.
"""
import os
import re
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "https://edim.seekerslab.com")
_u = urlparse(BASE)
ORIGIN = f"{_u.scheme}://{_u.netloc}"
KOREAN = re.compile(r"[가-힣]")


def menu_href_map() -> dict[str, str]:
    menus = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "..", "edim-web-next", "components", "chrome", "menus.ts")
    out: dict[str, str] = {}
    for line in open(menus, encoding="utf-8").read().split("\n"):
        i = re.search(r"id:\s*'([^']+)'", line)
        h = re.search(r"href:\s*'(/[^']+)'", line)
        if i and h:
            out[i.group(1)] = h.group(1)
    return out


# 화면: menus.ts node id (34개 구판 중 plm-material 은 code-raw 로 통합 — 33)
SCREENS = [
    "cpq-selection", "cpq-techdata", "cpq-doctpl", "cpq-docmgmt", "cpq-print",
    "plm-design", "plm-drawings", "plm-workprocess", "plm-duct",
    "code-subcode", "code-relationship", "code-datatable",
    "erp-project", "erp-dashboard", "erp-price", "erp-process", "erp-purchase",
    "erp-access", "tbx-ui", "tbx-macro",
    "com-approval", "com-tasks", "com-folder", "com-mobile",
    "code-hierarchy", "code-raw", "code-variant",
    "plm-arr", "plm-quality", "plm-parts",
    "erp-warehouse", "erp-company-master", "tbx-templet",
]

# 크롬 텍스트 셀렉터 (데이터 셀 td 는 제외 — 단, 칩 .st 은 상태 enum 이므로 포함)
CHROME_SELECTORS = [
    "label", "button.b", ".gt", "th", ".st", ".tn", ".flow .fs",
    ".mdi .t", ".qband", ".menubar", ".statusbar .fk",
]

offenders: list[tuple[str, str, str]] = []


def scan(page, screen: str) -> None:
    found = page.evaluate(
        """(sels) => {
            const out = [];
            const seen = new Set();
            for (const sel of sels) {
                for (const el of document.querySelectorAll(sel)) {
                    if (!el.offsetParent && el.tagName !== 'OPTION') continue; // 비표시 제외
                    let txt = '';
                    if (sel === '.qband' || sel === '.menubar') {
                        // 컨테이너: 직계 텍스트만 (자식 label/button 은 개별 수집)
                        for (const n of el.childNodes) if (n.nodeType === 3) txt += n.textContent;
                    } else { txt = el.innerText || ''; }
                    if (/[가-힣]/.test(txt) && !seen.has(sel + txt)) {
                        seen.add(sel + txt);
                        out.push([sel, txt.trim().slice(0, 60)]);
                    }
                }
            }
            // 보이는 select 의 옵션 표시 텍스트 (data-i18n-content = DB 콘텐츠 목록 — 크롬 아님, 제외)
            for (const s of document.querySelectorAll('select:not([data-i18n-content])')) {
                if (!s.offsetParent) continue;
                for (const o of s.options) if (/[가-힣]/.test(o.text)) out.push(['option', o.text.slice(0, 60)]);
            }
            // 보이는 input placeholder
            for (const i of document.querySelectorAll('input[placeholder]')) {
                if (!i.offsetParent) continue;
                if (/[가-힣]/.test(i.placeholder)) out.push(['placeholder', i.placeholder.slice(0, 60)]);
            }
            return out;
        }""", CHROME_SELECTORS)
    for sel, txt in found:
        offenders.append((screen, sel, txt))


with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    # EN 로케일 — SSR 쿠키 (Next getLocale)
    ctx.add_cookies([{"name": "edim_locale", "value": "en",
                      "domain": _u.netloc.split(":")[0], "path": "/"}])
    page = ctx.new_page()

    id2href = menu_href_map()
    missing = [s for s in SCREENS if s not in id2href]
    if missing:
        print(f"FAIL — menus.ts 에 없는 화면 id: {missing}")
        sys.exit(2)

    # 로그인 (EN 로케일 상태의 로그인 화면도 스캔)
    page.goto(f"{ORIGIN}/login", wait_until="networkidle")
    scan(page, "login")
    page.fill("input[name=userId]", "edim")
    page.fill("input[name=password]", os.environ.get("PW", "edim"))
    page.locator("button[type=submit]").first.click()
    page.wait_for_url("**/erp/**", timeout=15000)
    page.wait_for_selector(".app .titlebar", timeout=10000)

    for sid in SCREENS:
        page.goto(ORIGIN + id2href[sid], wait_until="load")
        page.wait_for_selector(".app .titlebar", timeout=8000)
        page.wait_for_timeout(700)   # 화면 로드·번들 적용
        scan(page, sid)

    b.close()

if offenders:
    print(f"FAIL — 한글 잔존 {len(offenders)}건:")
    for screen, sel, txt in offenders:
        print(f"  [{screen}] {sel}: {txt}")
else:
    print(f"PASS — {len(SCREENS)}화면 + 로그인 크롬 한글 잔존 0 (EN)")
sys.exit(1 if offenders else 0)
