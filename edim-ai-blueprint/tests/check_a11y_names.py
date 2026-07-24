# -*- coding: utf-8 -*-
"""접근성 게이트 (9.40) — 인터랙티브 요소의 접근가능 이름(accessible name) 스캔.

버튼·링크·역할기반 요소가 아이콘/이모지만 있고 aria-label·title 이 없으면 스크린리더가
의미를 읽지 못한다(예: '✕' → '곱셈 기호'). 이름이 비었거나 **문자·숫자 없이 기호/이모지뿐**인
요소를 결함으로 보고한다(WCAG 4.1.2 Name, Role, Value). i18n 게이트와 동일한 Playwright
로그인·화면순회 패턴을 재사용한다.
"""
import os
import re
import sys
import urllib.parse as _up

from playwright.sync_api import sync_playwright

ORIGIN = os.environ.get("EDIM_ORIGIN", "https://edim.seekerslab.com")
_u = _up.urlparse(ORIGIN)
HERE = os.path.dirname(os.path.abspath(__file__))


def menu_href_map():
    menus = os.path.join(HERE, "..", "edim-web-next", "components", "chrome", "menus.ts")
    out = {}
    for line in open(menus, encoding="utf-8").read().split("\n"):
        i = re.search(r"id:\s*'([^']+)'", line)
        h = re.search(r"href:\s*'(/[^']+)'", line)
        if i and h:
            out[i.group(1)] = h.group(1)
    return out


# 전 화면 (menus.ts 62화면 — i18n 게이트와 동일 커버리지)
SCREENS = [
    "cpq-selection", "cpq-techdata", "cpq-doctpl", "cpq-docmgmt", "cpq-print",
    "plm-design", "plm-drawings", "plm-workprocess", "plm-duct",
    "code-subcode", "code-relationship", "code-datatable",
    "erp-project", "erp-dashboard", "erp-price", "erp-process", "erp-purchase",
    "erp-access", "tbx-ui", "tbx-macro", "com-approval", "com-tasks", "com-folder",
    "com-mobile", "code-hierarchy", "code-raw", "code-variant", "plm-arr",
    "plm-quality", "plm-parts", "erp-warehouse", "erp-company-master", "tbx-templet",
    "code-master", "plm-eco", "erp-po", "erp-work-order", "erp-quality", "erp-cost-actual",
    "cpq-xreview", "cpq-run", "cpq-reports", "plm-eco-ledger", "plm-bom-compare", "i18n-data",
    "erp-sales-order", "erp-milestone", "erp-calendar", "erp-finance", "erp-inventory",
    "erp-mrp", "erp-anomaly", "erp-tenant-menu", "erp-audit", "erp-tenants", "erp-heads",
    "tbx-runs", "tbx-assistant", "detail-code", "detail-part", "detail-event", "detail-output",
]

JS = r"""
() => {
    const bad = [], seen = new Set();
    const sel = 'button, a[href], [role=button], [role=tab], [role=menuitem], [role=link]';
    const hasWord = (s) => /[\p{L}\p{N}]/u.test(s || '');
    for (const el of document.querySelectorAll(sel)) {
        if (!el.offsetParent) continue;                    // 비표시 제외
        if (el.closest('[aria-hidden=true]')) continue;
        const name = (el.getAttribute('aria-label') || el.getAttribute('title')
                      || el.getAttribute('aria-labelledby') || el.innerText || el.textContent || '').trim();
        // 이미지 alt 로 이름이 있으면 통과
        const img = el.querySelector('img[alt]');
        const imgAlt = img && hasWord(img.getAttribute('alt'));
        if (hasWord(name) || imgAlt) continue;
        const disp = (el.innerText || el.textContent || '').trim().slice(0, 12);
        const key = el.tagName + (el.className || '') + disp;
        if (seen.has(key)) continue;
        seen.add(key);
        bad.push([el.tagName.toLowerCase(), String(el.className || '').slice(0, 28), disp]);
    }
    return bad;
}
"""

offenders = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    id2href = menu_href_map()
    page.goto(f"{ORIGIN}/login", wait_until="networkidle")
    page.fill("input[name=userId]", "edim")
    page.fill("input[name=password]", os.environ.get("PW", "edim"))
    page.locator("button[type=submit]").first.click()
    page.wait_for_url("**/erp/**", timeout=15000)
    page.wait_for_selector(".app .titlebar", timeout=10000)
    for sid in SCREENS:
        href = id2href.get(sid)
        if not href:
            continue
        page.goto(ORIGIN + href, wait_until="load")
        try:
            page.wait_for_selector(".app .titlebar", timeout=8000)
        except Exception:  # noqa: BLE001
            pass
        page.wait_for_timeout(600)
        for tag, cls, disp in page.evaluate(JS):
            offenders.append((sid, tag, cls, disp))
    b.close()

if offenders:
    print(f"FAIL — 접근가능 이름 없는 인터랙티브 {len(offenders)}건:")
    for sid, tag, cls, disp in offenders:
        print(f"  [{sid}] <{tag} class='{cls}'> text={disp!r}")
    sys.exit(1)
print(f"PASS — {len(SCREENS)}화면 인터랙티브 접근가능 이름 결함 0")
sys.exit(0)
