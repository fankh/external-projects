"""
Seekurity SIEM Presentation Exporter

Marp Markdown 파일을 PPTX로 변환

Requirements:
    npm install -g @marp-team/marp-cli

Usage:
    python export_presentations.py
    python export_presentations.py --format pptx
    python export_presentations.py --format pdf
    python export_presentations.py --file 01-project-kickoff.md
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

# Configuration
PRESENTATIONS_DIR = Path(__file__).parent.parent / "docs" / "presentations"
OUTPUT_DIR = Path(__file__).parent.parent / "projects" / "_template" / "presentations"

PRESENTATIONS = [
    {
        "file": "01-project-kickoff.md",
        "output": "SeekuritySIEM_Project_Kickoff_CUSTOMER_NAME",
        "desc": "프로젝트 수행 계획서",
    },
    {
        "file": "02-project-completion.md",
        "output": "SeekuritySIEM_Project_Completion_CUSTOMER_NAME",
        "desc": "완료 보고서",
    },
]


def check_marp_installed():
    """Check if Marp CLI is installed"""
    try:
        result = subprocess.run(
            ["marp", "--version"],
            capture_output=True,
            text=True,
            shell=True,
        )
        if result.returncode == 0:
            print(f"Marp CLI version: {result.stdout.strip()}")
            return True
    except FileNotFoundError:
        pass

    print("=" * 50)
    print("ERROR: Marp CLI is not installed")
    print("=" * 50)
    print()
    print("Please install Marp CLI:")
    print("  npm install -g @marp-team/marp-cli")
    print()
    print("Or use npx:")
    print("  npx @marp-team/marp-cli <file>")
    print()
    return False


def export_presentation(input_file: Path, output_file: Path, format: str = "pptx"):
    """Export single presentation"""
    print(f"Exporting: {input_file.name} -> {output_file.name}.{format}")

    cmd = [
        "marp",
        str(input_file),
        "-o",
        f"{output_file}.{format}",
        "--allow-local-files",
    ]

    if format == "pptx":
        cmd.append("--pptx")
    elif format == "pdf":
        cmd.append("--pdf")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            shell=True,
        )
        if result.returncode == 0:
            print(f"  Success: {output_file}.{format}")
            return True
        else:
            print(f"  Error: {result.stderr}")
            return False
    except Exception as e:
        print(f"  Error: {e}")
        return False


def export_all(format: str = "pptx"):
    """Export all presentations"""
    print()
    print("=" * 50)
    print("Seekurity SIEM Presentation Exporter")
    print("=" * 50)
    print()

    # Check Marp
    if not check_marp_installed():
        return False

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print()

    # Export each presentation
    success_count = 0
    for pres in PRESENTATIONS:
        input_file = PRESENTATIONS_DIR / pres["file"]
        output_file = OUTPUT_DIR / pres["output"]

        if not input_file.exists():
            print(f"Warning: {input_file} not found, skipping...")
            continue

        if export_presentation(input_file, output_file, format):
            success_count += 1

    print()
    print("=" * 50)
    print(f"Export Complete: {success_count}/{len(PRESENTATIONS)} files")
    print("=" * 50)
    print()
    print("Exported files:")
    for pres in PRESENTATIONS:
        output_path = OUTPUT_DIR / f"{pres['output']}.{format}"
        if output_path.exists():
            print(f"  - {pres['output']}.{format} ({pres['desc']})")
    print()

    return success_count == len(PRESENTATIONS)


def export_single(filename: str, format: str = "pptx"):
    """Export single presentation by filename"""
    print()
    print("=" * 50)
    print("Seekurity SIEM Presentation Exporter")
    print("=" * 50)
    print()

    if not check_marp_installed():
        return False

    # Find presentation
    pres = None
    for p in PRESENTATIONS:
        if p["file"] == filename or filename in p["file"]:
            pres = p
            break

    if not pres:
        print(f"Error: Presentation '{filename}' not found")
        print()
        print("Available presentations:")
        for p in PRESENTATIONS:
            print(f"  - {p['file']} ({p['desc']})")
        return False

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    input_file = PRESENTATIONS_DIR / pres["file"]
    output_file = OUTPUT_DIR / pres["output"]

    return export_presentation(input_file, output_file, format)


def main():
    parser = argparse.ArgumentParser(
        description="Export Marp presentations to PPTX/PDF"
    )
    parser.add_argument(
        "--format",
        "-f",
        choices=["pptx", "pdf", "html"],
        default="pptx",
        help="Output format (default: pptx)",
    )
    parser.add_argument(
        "--file",
        "-F",
        help="Export single file",
    )
    parser.add_argument(
        "--list",
        "-l",
        action="store_true",
        help="List available presentations",
    )

    args = parser.parse_args()

    if args.list:
        print("Available presentations:")
        for pres in PRESENTATIONS:
            print(f"  - {pres['file']}: {pres['desc']}")
        return

    if args.file:
        export_single(args.file, args.format)
    else:
        export_all(args.format)


if __name__ == "__main__":
    main()
