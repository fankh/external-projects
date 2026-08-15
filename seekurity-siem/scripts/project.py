#!/usr/bin/env python3
"""Seekurity SIEM 프로젝트 워크플로: init / package.

산출물은 PDF + Excel만 납품 (markdown은 편집용 소스). package 시 .md →
md_to_pdf.convert()로 자동 변환되며 zip 에는 PDF만 포함됩니다.
라이선스 증서(HTML → PDF)도 자동 생성됩니다.
"""
import argparse
import datetime
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from md_to_pdf import convert as md_to_pdf  # noqa: E402
from license_certificate_generator import fill_template, load_template, generate_license_number  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "projects" / "_template"
PROJECTS = ROOT / "projects"

EXCLUDE = {"CLAUDE.md", ".git", ".DS_Store", "__pycache__", "_template"}
# 산출물 zip 에서 제외할 .md 파일 (내부 가이드)
MD_EXCLUDE_FROM_ZIP = {"README.md", "CLAUDE.md"}
# 기존 PDF 가 이 크기 이상이면 자체 빌드(Marp+스크린샷 등) 로 간주하고 자동 변환 스킵
LARGE_PDF_THRESHOLD = 1024 * 1024  # 1 MB


def generate_license_certificate_html(customer: str, src: Path) -> Path:
    """Generate license certificate HTML if config exists."""
    config_file = src / "license_certificate_config.json"
    html_file = src / f"{customer.upper()}_license_certificate.html"

    if not config_file.exists():
        return None

    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"  ⚠️  Failed to read license config: {e}")
        return None

    # Generate license number if not provided
    if 'LICENSE_NUMBER' not in config or not config['LICENSE_NUMBER']:
        customer_code = config.get('CUSTOMER_CODE', customer[:3])
        config['LICENSE_NUMBER'] = generate_license_number(customer_code, config.get('START_DATE', '2026-01-01'))

    # Set issue date to today if not provided
    if 'ISSUE_DATE' not in config or not config['ISSUE_DATE']:
        config['ISSUE_DATE'] = datetime.date.today().strftime('%Y-%m-%d')

    # Set defaults for optional fields
    defaults = {
        'INDUSTRY': '정보보안',
        'CONTACT_PERSON': '담당자',
        'CONTACT_PHONE': '-',
        'LICENSE_TYPE': '평가판',
        'LOG_SOURCE_COUNT': 'Unlimited',
        'USER_COUNT': 'Unlimited',
        'DEPLOYMENT_SCOPE': '단일 사이트',
        'ISSUED_BY': 'Seekurity Team',
        'ISSUER_POSITION': 'Technical Director',
    }

    for key, default_value in defaults.items():
        if key not in config:
            config[key] = default_value

    # Load and fill template
    template_path = TEMPLATE / "assets" / "CUSTOMER_NAME_license_certificate.html"
    template_content = load_template(template_path)
    html_content = fill_template(template_content, config)

    # Write HTML file
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(html_content)

    print(f"  📋 Generated license certificate: {customer.upper()}_license_certificate.html")
    print(f"     License #: {config['LICENSE_NUMBER']}")

    return html_file


def html_to_pdf_chromium(html_path: Path, pdf_path: Path) -> bool:
    """Convert HTML to PDF using headless Chromium."""
    try:
        cmd = [
            "/snap/bin/chromium",
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--print-to-pdf={pdf_path}",
            f"file://{html_path.resolve()}",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            print(f"  ⚠️  Chromium conversion failed: {result.stderr}")
            return False
        return True
    except FileNotFoundError:
        return False
    except subprocess.TimeoutExpired:
        print(f"  ⚠️  PDF conversion timeout")
        return False


def generate_license_pdf(html_file: Path) -> Path:
    """Convert license certificate HTML to PDF."""
    pdf_file = html_file.with_suffix('.pdf')

    # Try Chromium first
    if html_to_pdf_chromium(html_file, pdf_file):
        return pdf_file

    # Fallback: try wkhtmltopdf
    try:
        cmd = [
            "wkhtmltopdf",
            "--page-size", "A4",
            "--margin-top", "10mm",
            "--margin-bottom", "10mm",
            str(html_file),
            str(pdf_file),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            return pdf_file
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    print(f"  ⚠️  Could not convert to PDF. Install: chromium or wkhtmltopdf")
    return None


def init(customer: str) -> None:
    dest = PROJECTS / customer
    if dest.exists():
        sys.exit(f"❌ {dest} already exists")
    shutil.copytree(TEMPLATE, dest)

    # Korean convention: company prefix is UPPERCASE (e.g. KOVAN_, AIG_)
    prefix = customer.upper()

    for f in list(dest.rglob("*CUSTOMER_NAME*")):
        f.rename(f.with_name(f.name.replace("CUSTOMER_NAME", prefix)))

    for f in dest.rglob("*"):
        if f.is_file() and f.suffix in {".md", ".txt", ".py", ".json"}:
            text = f.read_text(encoding="utf-8")
            if "{CUSTOMER_NAME}" in text:
                f.write_text(
                    text.replace("{CUSTOMER_NAME}", prefix), encoding="utf-8"
                )

    print(f"✅ Initialized {dest}  (file prefix: {prefix}_)")


def package(customer: str) -> None:
    src = PROJECTS / customer
    if not src.exists():
        sys.exit(f"❌ {src} not found")
    today = datetime.date.today().strftime("%Y%m%d")
    out = src / f"{customer.upper()}_산출물_{today}.zip"

    # 라이선스 증서 HTML → PDF 생성
    pdfs_generated: list[Path] = []
    html_file = generate_license_certificate_html(customer, src)
    if html_file:
        pdf_file = generate_license_pdf(html_file)
        if pdf_file:
            print(f"  📄 {html_file.name} → PDF")
            pdfs_generated.append(pdf_file)

    # MD → PDF 변환 (편집용 .md 는 zip 에서 제외하고 PDF 만 포함)
    pdfs_built: list[Path] = []
    for md in src.rglob("*.md"):
        if md.name in MD_EXCLUDE_FROM_ZIP:
            continue
        if any(p in EXCLUDE for p in md.relative_to(src).parts):
            continue
        pdf = md.with_suffix(".pdf")
        if pdf.exists() and pdf.stat().st_size >= LARGE_PDF_THRESHOLD:
            # 자체 빌드된 큰 PDF — 덮어쓰지 않음
            pdfs_built.append(pdf)
            continue
        if not pdf.exists() or pdf.stat().st_mtime < md.stat().st_mtime:
            print(f"  📄 {md.relative_to(src)} → PDF")
            md_to_pdf(md, pdf)
        pdfs_built.append(pdf)

    count = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in src.rglob("*"):
            if not f.is_file() or f == out:
                continue
            if f.suffix == ".md":  # editable source only — exclude from deliverable
                continue
            if any(p in EXCLUDE for p in f.relative_to(src).parts):
                continue
            z.write(f, f.relative_to(src))
            count += 1

    print(f"✅ Created {out} ({count} files, {out.stat().st_size // 1024} KB)")
    print(f"   PDFs generated: {len(pdfs_built) + len(pdfs_generated)}")


def main() -> None:
    p = argparse.ArgumentParser(description="SIEM project workflow")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init", help="Copy template to projects/{customer}").add_argument(
        "customer"
    )
    sub.add_parser(
        "package", help="Bundle projects/{customer} into {customer}_산출물_YYYYMMDD.zip"
    ).add_argument("customer")
    args = p.parse_args()
    {"init": init, "package": package}[args.cmd](args.customer)


if __name__ == "__main__":
    main()
