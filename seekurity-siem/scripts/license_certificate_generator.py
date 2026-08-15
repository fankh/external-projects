#!/usr/bin/env python3
"""
Seekurity SIEM License Certificate Generator

Usage:
    python license_certificate_generator.py --config config.json
    python license_certificate_generator.py --customer KOVAN --start-date 2025-09-01 --end-date 2026-09-01
"""

import argparse
import json
from pathlib import Path
from datetime import datetime
from string import Template


def load_template(template_path):
    """Load HTML template."""
    with open(template_path, 'r', encoding='utf-8') as f:
        return f.read()


def generate_license_number(customer_code, start_date):
    """Generate license number: SK-{CUSTOMER_CODE}-{YYYYMM}-{RANDOM}"""
    date_part = datetime.strptime(start_date, '%Y-%m-%d').strftime('%Y%m')
    import random
    random_part = ''.join([str(random.randint(0, 9)) for _ in range(4)])
    return f"SK-{customer_code.upper()}-{date_part}-{random_part}"


def fill_template(template_content, data):
    """Replace template variables with customer data."""
    result = template_content
    for key, value in data.items():
        placeholder = f"{{{{{key}}}}}"
        result = result.replace(placeholder, str(value))
    return result


def generate_certificate(config):
    """Generate license certificate HTML file."""
    template_path = Path(__file__).parent.parent / 'projects' / '_template' / 'assets' / 'CUSTOMER_NAME_license_certificate.html'

    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")

    # Load template
    template = load_template(template_path)

    # Generate license number if not provided
    if 'LICENSE_NUMBER' not in config or not config['LICENSE_NUMBER']:
        customer_code = config.get('CUSTOMER_CODE', config['CUSTOMER_NAME'][:3])
        config['LICENSE_NUMBER'] = generate_license_number(customer_code, config['START_DATE'])

    # Default issue date to today if not provided
    if 'ISSUE_DATE' not in config or not config['ISSUE_DATE']:
        config['ISSUE_DATE'] = datetime.now().strftime('%Y-%m-%d')

    # Fill template
    html_content = fill_template(template, config)

    # Determine output filename and path
    customer_name = config['CUSTOMER_NAME']
    output_dir = Path(__file__).parent.parent / 'projects' / customer_name.lower()
    output_dir.mkdir(parents=True, exist_ok=True)

    output_file = output_dir / f"{customer_name.upper()}_license_certificate.html"

    # Save generated HTML
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)

    print(f"✓ Certificate generated: {output_file}")
    print(f"  License Number: {config['LICENSE_NUMBER']}")
    print(f"  Period: {config['START_DATE']} ~ {config['END_DATE']}")

    return output_file


def main():
    parser = argparse.ArgumentParser(
        description='Generate Seekurity SIEM License Certificate',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Using JSON config file
  python license_certificate_generator.py --config kovan_license.json

  # Using command-line arguments
  python license_certificate_generator.py \\
    --customer KOVAN \\
    --industry "금융" \\
    --contact "김철수" \\
    --phone "02-1234-5678" \\
    --license-type "영구 라이선스" \\
    --start-date 2025-09-01 \\
    --end-date 2026-09-01 \\
    --log-sources 67 \\
    --users 50 \\
    --scope "단일 사이트" \\
    --issued-by "이준호" \\
    --issuer-position "세큐리티 팀장"
        """
    )

    parser.add_argument('--config', type=str, help='JSON config file path')
    parser.add_argument('--customer', type=str, help='Customer/Company name')
    parser.add_argument('--industry', type=str, help='Industry type')
    parser.add_argument('--contact', type=str, help='Contact person name')
    parser.add_argument('--phone', type=str, help='Contact phone number')
    parser.add_argument('--license-type', type=str, help='License type (e.g., 영구 라이선스, 평가판)')
    parser.add_argument('--start-date', type=str, help='License start date (YYYY-MM-DD)')
    parser.add_argument('--end-date', type=str, help='License end date (YYYY-MM-DD)')
    parser.add_argument('--log-sources', type=int, help='Maximum number of log sources')
    parser.add_argument('--users', type=int, help='Maximum number of users')
    parser.add_argument('--scope', type=str, help='Deployment scope')
    parser.add_argument('--license-number', type=str, help='License number (auto-generated if not provided)')
    parser.add_argument('--issue-date', type=str, help='Issue date (YYYY-MM-DD, defaults to today)')
    parser.add_argument('--issued-by', type=str, help='Issued by person name')
    parser.add_argument('--issuer-position', type=str, help='Issuer position/title')

    args = parser.parse_args()

    # Load config from file or command-line
    if args.config:
        with open(args.config, 'r', encoding='utf-8') as f:
            config = json.load(f)
    else:
        config = {}

    # Override with command-line arguments
    cli_mapping = {
        'customer': 'CUSTOMER_NAME',
        'industry': 'INDUSTRY',
        'contact': 'CONTACT_PERSON',
        'phone': 'CONTACT_PHONE',
        'license_type': 'LICENSE_TYPE',
        'start_date': 'START_DATE',
        'end_date': 'END_DATE',
        'log_sources': 'LOG_SOURCE_COUNT',
        'users': 'USER_COUNT',
        'scope': 'DEPLOYMENT_SCOPE',
        'license_number': 'LICENSE_NUMBER',
        'issue_date': 'ISSUE_DATE',
        'issued_by': 'ISSUED_BY',
        'issuer_position': 'ISSUER_POSITION',
    }

    for arg_name, config_key in cli_mapping.items():
        arg_value = getattr(args, arg_name, None)
        if arg_value:
            config[config_key] = arg_value

    # Validate required fields
    required_fields = ['CUSTOMER_NAME', 'START_DATE', 'END_DATE']
    missing = [f for f in required_fields if f not in config or not config[f]]
    if missing:
        print(f"Error: Missing required fields: {', '.join(missing)}")
        parser.print_help()
        exit(1)

    # Set defaults for optional fields
    defaults = {}

    for key, default_value in defaults.items():
        if key not in config:
            config[key] = default_value

    try:
        output_file = generate_certificate(config)
        print(f"\n✓ To convert to PDF, use: wkhtmltopdf {output_file} {output_file.with_suffix('.pdf')}")
    except Exception as e:
        print(f"Error: {e}")
        exit(1)


if __name__ == '__main__':
    main()
