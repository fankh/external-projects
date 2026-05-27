#!/usr/bin/env python3
"""
Generate PDF from HTML proposal document using screenshot method.
This captures the HTML in a browser viewport and combines slides into a PDF.
"""

import os
import sys
from pathlib import Path

# Try importing required libraries
try:
    from PIL import Image
except ImportError:
    print("❌ PIL not found. Installing...")
    os.system("pip install Pillow")
    from PIL import Image

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options
except ImportError:
    print("❌ Selenium not found. Installing...")
    os.system("pip install selenium webdriver-manager")
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options

def capture_slides_from_html(html_path, output_dir='screenshots', viewport_width=1280, viewport_height=897):
    """
    Capture each slide from HTML as individual PNG images using Selenium.
    """
    print(f"🌐 Capturing slides from HTML: {html_path}")

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Setup Chrome options
    options = Options()
    options.add_argument('--headless')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument(f'--window-size={viewport_width},{viewport_height}')

    # Initialize driver
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        from selenium.webdriver.chrome.service import Service
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
    except:
        driver = webdriver.Chrome(options=options)

    try:
        # Load HTML file
        file_url = f'file://{os.path.abspath(html_path)}'
        print(f"📄 Loading: {file_url}")
        driver.get(file_url)

        # Wait for slides to load
        WebDriverWait(driver, 10).until(
            EC.presence_of_all_elements_located((By.CLASS_NAME, 'slide'))
        )

        print("⏳ Waiting for page to fully render...")
        import time
        time.sleep(2)

        # Get all slides
        slides = driver.find_elements(By.CLASS_NAME, 'slide')
        slide_count = len(slides)
        print(f"📊 Found {slide_count} slides\n")

        # Capture each slide
        for i, slide in enumerate(slides, 1):
            try:
                # Scroll to slide
                driver.execute_script('arguments[0].scrollIntoView(true);', slide)
                time.sleep(0.5)

                # Take screenshot
                filename = f'slide_{str(i).zfill(2)}.png'
                filepath = os.path.join(output_dir, filename)
                slide.screenshot(filepath)

                print(f"📸 Slide {i}/{slide_count}: {filename}")
            except Exception as e:
                print(f"❌ Error capturing slide {i}: {e}")

        print(f"\n✅ Captured {slide_count} slides to {output_dir}/")
        return slide_count

    finally:
        driver.quit()

def create_pdf_from_slides(slides_dir='screenshots', output_pdf='AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf'):
    """
    Combine individual slide PNGs into a single PDF.
    """
    print(f"\n📄 Creating PDF from slides in {slides_dir}/")

    # Get all slide files
    slide_files = sorted([f for f in os.listdir(slides_dir) if f.startswith('slide_') and f.endswith('.png')])

    if not slide_files:
        print(f"❌ No slide images found in {slides_dir}/")
        return False

    print(f"📊 Found {len(slide_files)} slides")

    # Open and convert slides to RGB
    images = []
    for slide_file in slide_files:
        filepath = os.path.join(slides_dir, slide_file)
        try:
            img = Image.open(filepath)
            # Convert RGBA to RGB if needed
            if img.mode == 'RGBA':
                rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[3])
                images.append(rgb_img)
            else:
                images.append(img)
            print(f"  ✓ {slide_file} ({img.size[0]}x{img.size[1]})")
        except Exception as e:
            print(f"  ✗ {slide_file}: {e}")
            continue

    if not images:
        print("❌ No images could be processed")
        return False

    # Create PDF
    try:
        pdf_path = output_pdf
        images[0].save(pdf_path, save_all=True, append_images=images[1:])

        # Get file size
        file_size = os.path.getsize(pdf_path) / (1024 * 1024)  # Convert to MB
        print(f"\n✅ PDF created: {pdf_path} ({file_size:.1f} MB)")
        print(f"📊 Total pages: {len(images)}")
        return True
    except Exception as e:
        print(f"❌ Error creating PDF: {e}")
        return False

def main():
    html_file = 'AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html'
    screenshots_dir = 'screenshots'
    pdf_file = 'AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf'

    # Ensure we're in the right directory
    if not os.path.exists(html_file):
        print(f"❌ {html_file} not found in current directory")
        print(f"   Current directory: {os.getcwd()}")
        sys.exit(1)

    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║  Generate PDF from HTML Proposal (Selenium + PIL)           ║")
    print("╚═══════════════════════════════════════════════════════════════╝")
    print()

    # Capture slides
    slide_count = capture_slides_from_html(html_file, screenshots_dir)

    # Create PDF
    if slide_count > 0:
        success = create_pdf_from_slides(screenshots_dir, pdf_file)
        if success:
            print("\n✨ Done! PDF is ready for delivery.")
        else:
            print("\n⚠️  PDF creation failed")
            sys.exit(1)
    else:
        print("\n❌ No slides captured")
        sys.exit(1)

if __name__ == '__main__':
    main()
