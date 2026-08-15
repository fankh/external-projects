#!/usr/bin/env python3
"""MD → PDF converter for SIEM project deliverables.

Renders markdown as a styled A4 document using markdown-it-py + headless Chromium.
"""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from markdown_it import MarkdownIt

CSS = """
@page { size: A4; margin: 20mm 18mm; }
html, body { font-family: 'Noto Sans CJK KR', 'Malgun Gothic', sans-serif; font-size: 10.5pt; color: #222; line-height: 1.55; }
h1 { font-size: 20pt; border-bottom: 2px solid #2c5282; padding-bottom: 4pt; margin-top: 16pt; color: #2c5282; }
h2 { font-size: 14pt; border-bottom: 1px solid #cbd5e0; padding-bottom: 3pt; margin-top: 14pt; color: #2d3748; }
h3 { font-size: 12pt; margin-top: 10pt; color: #2d3748; }
h4 { font-size: 11pt; margin-top: 8pt; color: #4a5568; }
p, li { margin: 4pt 0; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.5pt; }
th, td { border: 1px solid #cbd5e0; padding: 4pt 8pt; text-align: left; vertical-align: top; }
th { background: #edf2f7; font-weight: 600; }
tr:nth-child(even) td { background: #f7fafc; }
code { font-family: 'Menlo', monospace; background: #f0f0f0; padding: 1pt 4pt; border-radius: 2pt; font-size: 9.5pt; }
pre { background: #f7fafc; border: 1px solid #e2e8f0; padding: 8pt; border-radius: 4pt; overflow-x: auto; font-size: 9pt; }
pre code { background: transparent; padding: 0; }
hr { border: none; border-top: 1px solid #cbd5e0; margin: 12pt 0; }
blockquote { border-left: 3px solid #4299e1; padding-left: 10pt; color: #4a5568; margin: 8pt 0; }
"""

HTML_TMPL = """<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>{title}</title>
<style>{css}</style></head><body>{body}</body></html>"""


def md_to_html(md_path: Path) -> str:
    md = MarkdownIt("commonmark", {"html": True}).enable("table").enable("strikethrough")
    body = md.render(md_path.read_text(encoding="utf-8"))
    return HTML_TMPL.format(title=md_path.stem, css=CSS, body=body)


def html_to_pdf(html_path: Path, pdf_path: Path) -> None:
    cmd = [
        "/snap/bin/chromium",
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path}",
        f"file://{html_path.resolve()}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        sys.exit(f"❌ chromium failed: {result.stderr}")


def convert(md_path: Path, pdf_path: Path | None = None) -> Path:
    md_path = Path(md_path).resolve()
    if pdf_path is None:
        pdf_path = md_path.with_suffix(".pdf")
    pdf_path = Path(pdf_path).resolve()
    html = md_to_html(md_path)
    # snap chromium can't access /tmp; use a home-dir scratch
    scratch = Path.home() / ".cache" / "md_to_pdf"
    scratch.mkdir(parents=True, exist_ok=True)
    html_path = scratch / f"{md_path.stem}.html"
    html_path.write_text(html, encoding="utf-8")
    try:
        html_to_pdf(html_path, pdf_path)
    finally:
        html_path.unlink(missing_ok=True)
    return pdf_path


def main() -> None:
    p = argparse.ArgumentParser(description="Convert markdown to styled PDF")
    p.add_argument("md", type=Path, help="Input .md file")
    p.add_argument("-o", "--output", type=Path, help="Output .pdf (default: same name)")
    args = p.parse_args()
    out = convert(args.md, args.output)
    print(f"✅ {args.md} → {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
