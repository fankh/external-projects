# Quick Start: Capture Real KYRA Screenshots — Guided Walkthrough

**Time required:** 10 minutes  
**Difficulty:** Easy — Just follow the steps

---

## **STEP 1: Verify Your Setup (2 minutes)**

Open a terminal on your local machine and run:

```bash
# Check Node.js
node --version
# Should show: v16.0.0 or higher

# Check if in correct directory
cd /path/to/kita-ax
pwd
# Should show: .../kita-ax

# Check if npm packages installed
ls node_modules/playwright
# Should show files (not "No such file")
```

**If anything is missing:**
```bash
# Install Node.js from https://nodejs.org (v16+)
npm install
npx playwright install chromium
```

---

## **STEP 2: Log In to KYRA (2 minutes)**

**CRITICAL: Do this BEFORE running the script!**

1. **Open your browser** and go to:
   ```
   https://kyra-guardrails-dev.seekerslab.com/login
   ```

2. **Enter your admin credentials:**
   - Email: [your admin email]
   - Password: [your admin password]
   - Click "Sign In"

3. **Verify you're logged in:**
   - You should see the admin dashboard
   - URL should show `/admin/dashboard` or similar
   - Look for your name/profile in top-right corner

4. **LEAVE THE BROWSER WINDOW OPEN** ⚠️
   - Don't log out
   - Don't close the tab
   - The script needs your session cookies

5. **Take a screenshot for reference:**
   - Screenshot one of the pages so you know what it should look like
   - This helps verify the script captured correctly

---

## **STEP 3: Run the Capture Script (1 minute)**

In your terminal, run:

```bash
cd /path/to/kita-ax
node capture_all_kyra_pages.js
```

**You should see output like:**
```
╔═══════════════════════════════════════════════════════════════╗
║  KYRA Admin Console — Full Page Capture                       ║
║  For: KITA AI Guardrail Proposal PDF                          ║
╚═══════════════════════════════════════════════════════════════╝

📌 Base URL: https://kyra-guardrails-dev.seekerslab.com

📸 Capturing (1/10): Login page
   URL: https://kyra-guardrails-dev.seekerslab.com/login
   ✅ Saved: kyra_01_login.png (156 KB)

📸 Capturing (2/10): Admin dashboard
   URL: https://kyra-guardrails-dev.seekerslab.com/admin/dashboard
   ✅ Saved: kyra_02_dashboard.png (203 KB)

[... continues ...]

✨ Capture complete!
   ✅ Success: 10/10
   📁 Saved to: screenshots/kyra-real/
```

---

## **STEP 4: Verify Screenshots Were Captured (2 minutes)**

Run this command:

```bash
ls -lh screenshots/kyra-real/
```

**You should see:**
```
kyra_01_login.png (156 KB)
kyra_02_dashboard.png (203 KB)
kyra_03_documents.png (185 KB)
kyra_04_access-policies.png (220 KB) ← MOST IMPORTANT
kyra_05_audit-logs.png (180 KB)
kyra_06_users.png (150 KB)
kyra_07_settings.png (140 KB)
kyra_08_agents.png (175 KB)
kyra_09_compliance.png (210 KB)
kyra_10_rag-config.png (165 KB)
```

**Open and review the key screenshot:**
```bash
# On macOS
open screenshots/kyra-real/kyra_04_access-policies.png

# On Linux
feh screenshots/kyra-real/kyra_04_access-policies.png

# On Windows
start screenshots/kyra-real/kyra_04_access-policies.png
```

**Check if:**
- ✅ Role × Classification matrix is visible
- ✅ Checkboxes (✓/☐) are visible
- ✅ Column headers (Public, Internal, Confidential, Restricted) are visible
- ✅ Row labels (Admin, Manager, Power User, User, Viewer) are visible
- ✅ Overall image is clear and not blurry

---

## **STEP 5: Integrate Real Screenshot into Proposal (3 minutes)**

Once you've verified the screenshots look good, integrate them:

```bash
# Copy the real Access Policies screenshot
cp screenshots/kyra-real/kyra_04_access-policies.png screenshots/access_policies.png

# Verify it was copied
ls -lh screenshots/access_policies.png
```

---

## **STEP 6: Regenerate PDF with Real Screenshot (2 minutes)**

Run the slide capture:

```bash
node capture_all_slides.js
```

Then create the PDF:

```bash
python3 << 'EOF'
from PIL import Image
import os

screenshots_dir = 'screenshots'
slide_files = sorted([f for f in os.listdir(screenshots_dir) if f.startswith('slide_') and f.endswith('.png')])

print(f"Creating PDF from {len(slide_files)} slides...")

images = []
for slide_file in slide_files:
    img = Image.open(os.path.join(screenshots_dir, slide_file))
    if img.mode == 'RGBA':
        rgb_img = Image.new('RGB', img.size, (255, 255, 255))
        rgb_img.paste(img, mask=img.split()[3])
        images.append(rgb_img)
    else:
        images.append(img.convert('RGB'))

images[0].save('AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf', save_all=True, append_images=images[1:])
print(f"✅ PDF created: AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf ({len(images)} pages)")
EOF
```

**Verify the PDF was created:**
```bash
ls -lh AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf
# Should show ~1.5 MB
```

---

## **STEP 7: Commit & Push to GitHub (2 minutes)**

```bash
# Add the real screenshots
git add screenshots/kyra-real/ screenshots/access_policies.png AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf

# Commit
git commit -m "feat: Add real KYRA admin console screenshots

- Captured 10 pages from live KYRA dev system
- Real Access Policies screenshot on Slide 19
- Replaced mockup with production-ready KYRA UI
- All pages verified and visible
- PDF regenerated with authentic screenshots"

# Push to GitHub
git push origin master
```

**Verify push succeeded:**
```bash
git log --oneline -1
# Should show your new commit
```

---

## **TROUBLESHOOTING**

### **❌ "Page not found" errors**

**Solution:** Some pages might not exist in your KYRA instance
- This is OK — the script continues and captures what exists
- You'll have 8-10 screenshots instead of 10
- As long as you have `kyra_04_access-policies.png`, the proposal works

### **❌ "Timeout" errors**

**Solution:** Page is taking too long to load
- Reduce network load (close other browser tabs)
- Increase wait time in script:
  ```javascript
  await page.waitForTimeout(3000); // Change from 1000 to 3000
  ```

### **❌ Blank/white screenshots**

**Solution:** Page didn't render before screenshot
- Make sure you're still logged in to KYRA in your browser
- Don't minimize browser window while script runs
- Increase wait times in script

### **❌ "Not logged in" error**

**Solution:** Session expired or not authenticated
- Make sure KYRA browser window is OPEN while running script
- Don't log out before/during script execution
- Try logging in again in browser, then run script

### **❌ "Cannot find module 'playwright'"**

**Solution:** Dependencies not installed
```bash
npm install
npx playwright install chromium
```

---

## **WHAT TO DO IF SCRIPT FAILS**

If you get errors, **share these details with me:**

```bash
# Run this to generate a debug report
echo "=== SYSTEM INFO ===" 
node --version
npm --version
ls -lh screenshots/kyra-real/ 2>/dev/null || echo "No screenshots captured"
echo "=== GIT STATUS ===" 
git status
echo "=== LAST 5 COMMITS ===" 
git log --oneline -5
```

Then copy/paste:
- The error message
- The debug report above
- Any screenshot file names that DID get created

---

## **SUCCESS CHECKLIST**

- [ ] Node.js v16+ installed
- [ ] npm packages installed (`node_modules/` exists)
- [ ] Logged in to KYRA dev server in browser
- [ ] Ran `node capture_all_kyra_pages.js`
- [ ] Got "Success: 10/10" or similar
- [ ] Verified `screenshots/kyra-real/kyra_04_access-policies.png` exists and looks good
- [ ] Copied to `screenshots/access_policies.png`
- [ ] Regenerated PDF with real screenshot
- [ ] Committed and pushed to GitHub
- [ ] PDF shows on GitHub: https://github.com/fankh/external-projects/blob/master/kita-ax/AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf

---

## **NEXT: Share Results With Me**

Once you've completed the steps, let me know:

1. ✅ How many screenshots captured? (e.g., "Success: 10/10")
2. ✅ Is the Access Policies screenshot visible and clear?
3. ✅ Any errors or issues?
4. ✅ Is PDF regenerated?
5. ✅ Pushed to GitHub?

Then we can verify everything and ensure the proposal is **100% ready for KT DS on 5/26!** 🎯
