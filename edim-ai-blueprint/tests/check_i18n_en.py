# -*- coding: utf-8 -*-
"""B9 i18n 검증 — EN 로케일로 24화면 크롬(라벨·버튼·그리드 헤더·그룹박스·콤보·칩) 한글 잔존 0.

대상: preview(:4173, mock 폴백 = OFFLINE_BUNDLES) 또는 BASE 환경변수로 라이브.
데이터 셀(품명·공급처·문서 제목 등 콘텐츠)은 별도 번역 트랙 — 검사 제외.
"""
import os
import re
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173/edim-static/")
KOREAN = re.compile(r"[가-힣]")

# 화면 딥링크: (module, tabId=screenId)
SCREENS = [
    ("cpq", "cpq-selection"), ("cpq", "cpq-techdata"), ("cpq", "cpq-doctpl"),
    ("cpq", "cpq-docmgmt"), ("cpq", "cpq-print"),
    ("plm", "plm-design"), ("plm", "plm-drawings"), ("plm", "plm-workprocess"),
    ("plm", "plm-duct"),
    ("code", "code-subcode"), ("code", "code-relationship"), ("code", "code-datatable"),
    ("erp", "erp-project"), ("erp", "erp-dashboard"), ("erp", "erp-price"),
    ("erp", "erp-process"), ("erp", "erp-purchase"), ("erp", "erp-access"),
    ("toolbox", "tbx-ui"), ("toolbox", "tbx-macro"),
    ("common", "com-approval"), ("common", "com-tasks"), ("common", "com-folder"),
    ("common", "com-mobile"),
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
            // 보이는 select 의 옵션 표시 텍스트
            for (const s of document.querySelectorAll('select')) {
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
    ctx.add_init_script("localStorage.setItem('edim-locale','en')")
    page = ctx.new_page()

    page.goto(BASE, wait_until="networkidle")
    page.wait_for_selector(".login-dlg", timeout=10000)
    scan(page, "login")
    page.locator(".login-dlg input").nth(0).fill("edim")
    page.locator(".login-dlg input[type=password]").fill(os.environ.get("PW", "edim"))
    page.locator(".login-dlg button.b").last.click()
    page.wait_for_selector(".app .titlebar", timeout=8000)

    for module, tab in SCREENS:
        page.goto(f"{BASE}#/{module}/{tab}", wait_until="load")
        page.wait_for_selector(".app .titlebar", timeout=8000)
        page.wait_for_timeout(700)   # 화면 로드·번들 적용
        scan(page, tab)

    b.close()

if offenders:
    print(f"FAIL — 한글 잔존 {len(offenders)}건:")
    for screen, sel, txt in offenders:
        print(f"  [{screen}] {sel}: {txt}")
else:
    print(f"PASS — {len(SCREENS)}화면 + 로그인 크롬 한글 잔존 0 (EN)")
sys.exit(1 if offenders else 0)
