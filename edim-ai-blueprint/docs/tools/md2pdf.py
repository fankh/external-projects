# -*- coding: utf-8 -*-
"""MD 산출물 → PDF 변환 (Mermaid 다이어그램 렌더 포함).

python-markdown으로 HTML 변환 → mermaid.js 브라우저 렌더 → Playwright Chromium PDF.
출력: docs/pdf/<이름>.pdf
실행: py docs/tools/md2pdf.py   (PYTHONUTF8=1)
"""
import html as html_mod
import os
import re

import markdown
from playwright.sync_api import sync_playwright

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_DIR = os.path.join(BASE, "pdf")
TMP_DIR = os.path.join(BASE, "tools", "_tmp_html")

# (MD 상대경로, PDF 파일명, 문서 제목)
DOCS = [
    ("EDIM_개요.md", "EDIM_시스템개요서.pdf", "EDIM 시스템 개요서"),
    ("EDIM_사업수행계획서.md", "EDIM_사업수행계획서.pdf", "EDIM 사업수행계획서"),
    ("EDIM_보안관리계획서.md", "EDIM_보안관리계획서.pdf", "EDIM 보안관리계획서"),
    ("README.md", "EDIM_문서관리요약.pdf", "EDIM 문서 관리 요약"),
    ("EDIM_요구사항_보완노트.md", "EDIM_요구사항보완노트.pdf", "EDIM 요구사항 보완노트"),
    ("EDIM_DB_정의서.md", "EDIM_DB정의서.pdf", "EDIM DB 정의서"),
    ("EDIM_컴포넌트_정의서.md", "EDIM_컴포넌트정의서.pdf", "EDIM 컴포넌트 정의서"),
    ("EDIM_인터페이스정의서.md", "EDIM_인터페이스정의서.pdf", "EDIM 인터페이스 정의서"),
    ("EDIM_클래스정의서.md", "EDIM_클래스정의서.pdf", "EDIM 클래스 정의서"),
    ("EDIM_개발표준정의서.md", "EDIM_개발표준정의서.pdf", "EDIM 개발 표준 정의서"),
    ("EDIM_데이터이행계획서.md", "EDIM_데이터이행계획서.pdf", "EDIM 데이터 이행 계획서"),
    ("EDIM_시연시나리오.md", "EDIM_시연시나리오.pdf", "EDIM 시연 시나리오"),
    ("EDIM_미구현기능목록.md", "EDIM_미구현기능목록.pdf", "EDIM 미구현 기능 목록"),
]

CSS = """
@page { size: A4; }
* { box-sizing: border-box; }
body { font-family: Pretendard, 'Malgun Gothic', 'Noto Sans JP', 'Noto Sans SC', sans-serif;
       font-size: 10pt; line-height: 1.55; color: #1E222A; margin: 0; }
h1 { font-size: 17pt; color: #17376B; border-bottom: 2.5px solid #17376B; padding-bottom: 6px; }
h2 { font-size: 13pt; color: #1F4E8C; border-bottom: 1px solid #C2C8D2; padding-bottom: 3px;
     margin-top: 22px; page-break-after: avoid; }
h3 { font-size: 11pt; color: #2B3A55; margin-top: 16px; page-break-after: avoid; }
h4 { font-size: 10pt; color: #2B3A55; page-break-after: avoid; }
table { border-collapse: collapse; width: 100%; font-size: 8.5pt; margin: 8px 0; }
th { background: #DCE3EE; color: #2B3A55; border: 1px solid #9AA2AF; padding: 3px 6px; text-align: left; }
td { border: 1px solid #C2C8D2; padding: 2.5px 6px; vertical-align: top; }
tr { page-break-inside: avoid; }
tr:nth-child(even) td { background: #F7F9FC; }
code { font-family: Consolas, 'D2Coding', monospace; font-size: 8.5pt;
       background: #F2F3F6; border: 1px solid #E1E5EB; border-radius: 2px; padding: 0 3px; }
pre { background: #F5F6F8; border: 1px solid #C2C8D2; border-radius: 2px; padding: 8px 10px;
      font-size: 8pt; overflow-x: hidden; white-space: pre-wrap; word-break: break-all;
      page-break-inside: avoid; }
pre code { background: none; border: none; padding: 0; }
blockquote { border-left: 3px solid #1F4E8C; background: #F2F5FA; margin: 8px 0;
             padding: 6px 12px; color: #40495A; }
a { color: #1F4E8C; text-decoration: none; }
hr { border: none; border-top: 1px solid #C2C8D2; margin: 18px 0; }
ul, ol { padding-left: 22px; }
li { margin: 2px 0; }
.mermaid { text-align: center; margin: 12px 0; page-break-inside: avoid; }
.mermaid svg { max-width: 100% !important; max-height: 225mm; width: auto; height: auto; }
.doc-cover { margin-bottom: 26px; }
.doc-cover .t { font-size: 20pt; font-weight: 800; color: #17376B; }
.doc-cover .s { color: #5A6270; font-size: 9pt; margin-top: 4px; }
"""


def extract_mermaid(md_text):
    """```mermaid 블록을 placeholder로 치환 — markdown 변환에서 보호."""
    blocks = []

    def repl(m):
        blocks.append(m.group(1))
        return f"\n<!--MERMAID{len(blocks) - 1}-->\n"

    out = re.sub(r"```mermaid\n(.*?)```", repl, md_text, flags=re.S)
    return out, blocks


def build_html(md_path, title):
    src = open(md_path, encoding="utf-8").read()
    body_md, mermaids = extract_mermaid(src)
    body = markdown.markdown(
        body_md, extensions=["tables", "fenced_code", "sane_lists", "attr_list"])
    for i, code in enumerate(mermaids):
        body = body.replace(
            f"<!--MERMAID{i}-->",
            f'<div class="mermaid">{html_mod.escape(code)}</div>')
    return f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>{html_mod.escape(title)}</title>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
<style>{CSS}</style></head>
<body>
<div class="doc-cover"><div class="t">{html_mod.escape(title)}</div>
<div class="s">EDIM Tool System — NOVA Solution · 저장소 fankh/external-projects (edim-ai-blueprint/docs)</div></div>
{body}
<script type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
mermaid.initialize({{ startOnLoad: false, theme: "base",
  themeVariables: {{ fontSize: "14px" }}, flowchart: {{ useMaxWidth: true }} }});
await mermaid.run();
// A4 인쇄 폭에 맞춰 자연 크기 고정 후 CSS max-*로 축소 (페이지 넘침 방지)
document.querySelectorAll(".mermaid svg").forEach(s => {{
  const w = s.viewBox?.baseVal?.width, h = s.viewBox?.baseVal?.height;
  if (w && h) {{ s.setAttribute("width", w); s.setAttribute("height", h); }}
  s.style.width = "auto"; s.style.height = "auto";
}});
window.__MERMAID_DONE__ = true;
</script>
</body></html>"""


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(TMP_DIR, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        for rel, pdf_name, title in DOCS:
            md_path = os.path.join(BASE, rel)
            tmp_html = os.path.join(TMP_DIR, pdf_name.replace(".pdf", ".html"))
            open(tmp_html, "w", encoding="utf-8").write(build_html(md_path, title))
            page.goto("file:///" + tmp_html.replace(os.sep, "/"),
                      wait_until="networkidle")
            page.wait_for_function("() => window.__MERMAID_DONE__ === true",
                                   timeout=30000)
            n_svg = page.evaluate(
                "document.querySelectorAll('.mermaid svg').length")
            n_err = page.evaluate(
                "document.querySelectorAll('.mermaid svg[aria-roledescription=\"error\"]').length")
            out = os.path.join(OUT_DIR, pdf_name)
            page.pdf(path=out, format="A4", print_background=True,
                     margin={"top": "16mm", "bottom": "16mm",
                             "left": "14mm", "right": "14mm"},
                     display_header_footer=True,
                     header_template="<span></span>",
                     footer_template=(
                         '<div style="width:100%;font-size:7.5px;color:#8B93A1;'
                         'display:flex;padding:0 14mm">'
                         f'<span>{html_mod.escape(title)}</span>'
                         '<span style="flex:1"></span>'
                         '<span class="pageNumber"></span>/<span class="totalPages"></span>'
                         "</div>"))
            size = os.path.getsize(out)
            flag = f"  !! mermaid 오류 {n_err}건" if n_err else ""
            print(f"{pdf_name:44s} mermaid {n_svg:2d}  {size / 1024:7.0f} KB{flag}")
        browser.close()
    print("done ->", OUT_DIR)


if __name__ == "__main__":
    main()
