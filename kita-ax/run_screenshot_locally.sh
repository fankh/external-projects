#!/bin/bash

# KYRA AI Guardrail Access Policies Screenshot Capture
# This script should be run on your local machine with access to the KYRA dev server

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  KYRA Access Policies Screenshot Capture (Playwright)        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Check if we're in the right directory
if [ ! -f "capture_screenshot.js" ]; then
    echo "❌ capture_screenshot.js not found in current directory"
    echo "   Please run this script from the kita-ax directory:"
    echo "   cd /home/khchoi/external-projects/kita-ax && bash run_screenshot_locally.sh"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install 2>&1 | grep -E "added|up to date|audited"

echo ""
echo "🎬 Installing Playwright browsers..."
npx playwright install chromium 2>&1 | grep -E "chromium|Downloading|Complete"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📸 Starting screenshot capture..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run the screenshot script
node capture_screenshot.js

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Screenshot capture completed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if screenshot was created
if [ -f "screenshots/access_policies.png" ]; then
    SIZE=$(ls -lh screenshots/access_policies.png | awk '{print $5}')
    echo "📸 Screenshot saved: screenshots/access_policies.png ($SIZE)"
    echo ""
    echo "🎯 Next steps:"
    echo "  1. Verify the screenshot content is correct"
    echo "  2. Commit the changes:"
    echo "     git add screenshots/access_policies.png"
    echo "     git commit -m 'chore: Add Access Policies screenshot'"
    echo "  3. Push to GitHub:"
    echo "     git push origin master"
else
    echo "⚠️  Screenshot not created. Check the error output above."
    if [ -f "screenshots/error_screenshot.png" ]; then
        echo "   Debug screenshot saved: screenshots/error_screenshot.png"
    fi
fi
