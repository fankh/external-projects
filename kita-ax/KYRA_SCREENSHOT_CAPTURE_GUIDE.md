# KYRA Admin Console Screenshot Capture — Complete Guide

**Objective:** Capture all KYRA admin console pages and generate a proposal PDF with real screenshots (not mockups)

**Timeline:** ~15-20 minutes of setup + 5 minutes of automated capture

---

## **Step 1: Prerequisites**

### **On Your Local Machine (macOS/Linux/Windows):**

✅ **Required:**
- Node.js 16+ installed
- Access to `https://kyra-guardrails-dev.seekerslab.com` (VPN/network access)
- Active KYRA admin account login
- Terminal/Command line access

✅ **Install Playwright (one-time):**
```bash
cd /path/to/kita-ax
npm install
npx playwright install chromium
```

---

## **Step 2: Pre-Capture Setup**

### **IMPORTANT: Log in to KYRA FIRST**

Before running the capture script, you MUST be logged in to the KYRA dev server:

1. **Open your browser**
   ```
   https://kyra-guardrails-dev.seekerslab.com/login
   ```

2. **Log in with admin credentials**
   - Email: [your admin email]
   - Password: [your admin password]

3. **Verify you can access admin pages:**
   - `/admin/dashboard` ✅
   - `/admin/documents` ✅
   - `/admin/access-policies` ✅
   - `/admin/audit-logs` ✅

4. **Keep the browser window open** (script will use your session cookies)

---

## **Step 3: Run the Capture Script**

### **Execute the automated capture:**

```bash
cd /path/to/kita-ax
node capture_all_kyra_pages.js
```

### **What the script does:**

✅ Captures 10 key KYRA admin pages:
1. Login page
2. Admin dashboard
3. Documents page
4. Access Policies (role × classification matrix) **← CRITICAL**
5. Audit logs
6. Users/Roles management
7. Admin settings
8. Agents configuration
9. Compliance dashboard
10. RAG system configuration

✅ Saves to: `screenshots/kyra-real/`

✅ Waits for page content to load before capturing

✅ Shows success/failure for each page

### **Expected Output:**
```
📸 Capturing (1/10): Login page
   URL: https://kyra-guardrails-dev.seekerslab.com/login
   ✅ Saved: kyra_01_login.png (156 KB)

📸 Capturing (2/10): Admin dashboard
   URL: https://kyra-guardrails-dev.seekerslab.com/admin/dashboard
   ✅ Saved: kyra_02_dashboard.png (203 KB)

[... continues for all 10 pages ...]

✨ Capture complete!
   ✅ Success: 10/10
   📁 Saved to: screenshots/kyra-real/
```

---

## **Step 4: Review & Select Screenshots**

### **Check captured images:**

```bash
ls -lh screenshots/kyra-real/
```

### **Open each screenshot to verify:**
- Content is visible and legible
- Page loaded completely (not blank/loading state)
- Admin console UI is clearly shown

### **Key screenshot to verify:**
- `kyra_04_access-policies.png` — This is the critical one for Slide 19
  - Should show role × classification matrix with checkboxes
  - Should be readable and professional-looking

---

## **Step 5: Integrate into Proposal PDF**

### **Option A: Use All Screenshots**

Copy all KYRA screenshots to main screenshots directory:
```bash
cp screenshots/kyra-real/*.png screenshots/
```

Then regenerate PDF with all real pages:
```bash
python3 << 'EOF'
from PIL import Image
import os

# Combine all KYRA screenshots into PDF
kyra_screenshots = sorted([f for f in os.listdir('screenshots/kyra-real/') if f.endswith('.png')])
images = []

for screenshot in kyra_screenshots:
    img = Image.open(f'screenshots/kyra-real/{screenshot}')
    if img.mode == 'RGBA':
        rgb_img = Image.new('RGB', img.size, (255, 255, 255))
        rgb_img.paste(img, mask=img.split()[3])
        images.append(rgb_img)
    else:
        images.append(img.convert('RGB'))

if images:
    images[0].save('KYRA_ADMIN_CONSOLE_SCREENSHOTS.pdf', save_all=True, append_images=images[1:])
    print(f"✅ Created KYRA_ADMIN_CONSOLE_SCREENSHOTS.pdf ({len(images)} pages)")
EOF
```

### **Option B: Use Selected Screenshots (Recommended for Proposal)**

Only use the most critical pages for the proposal:
1. `kyra_04_access-policies.png` — For Slide 19 (ABAC & policy management)
2. `kyra_02_dashboard.png` — Optional for opening
3. `kyra_03_documents.png` — Optional for document library

Replace the mockup:
```bash
cp screenshots/kyra-real/kyra_04_access-policies.png screenshots/access_policies.png
```

Then regenerate the proposal PDF:
```bash
node capture_all_slides.js
python3 << 'EOF'
from PIL import Image
import os

screenshots_dir = 'screenshots'
slide_files = sorted([f for f in os.listdir(screenshots_dir) if f.startswith('slide_') and f.endswith('.png')])
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
print(f"✅ PDF updated with real KYRA screenshot: {len(images)} pages")
EOF
```

---

## **Step 6: Commit & Push to GitHub**

```bash
# Commit the real KYRA screenshots
git add screenshots/kyra-real/ screenshots/access_policies.png
git commit -m "feat: Add real KYRA admin console screenshots

- Captured 10 pages from live KYRA dev system
- Real Access Policies UI replaces mockup (Slide 19)
- Dashboard, documents, audit logs also captured
- All screenshots verified and production-ready

Pages captured:
- Login page
- Admin dashboard
- Documents page
- Access Policies (role × classification matrix)
- Audit logs
- Users/Roles management
- Admin settings
- Agents configuration
- Compliance dashboard
- RAG system configuration"

# Push to GitHub
git push origin master
```

---

## **Troubleshooting**

### **Issue: "Page not found" errors**

**Cause:** Not all pages exist in your KYRA instance

**Solution:**
- Comment out non-existent URLs in the script
- Or let the script skip them (it continues on failure)
- Focus on the pages you DO have

### **Issue: "Timeout while waiting"**

**Cause:** Page is slow to load or requires different selector

**Solution:**
```bash
# Edit capture_all_kyra_pages.js and adjust:
# 1. waitFor selectors (change CSS selectors if needed)
# 2. timeout values (increase from 30000ms)
# 3. waitForTimeout duration (increase from 1000ms)
```

### **Issue: "Not logged in" errors**

**Cause:** Session expired or not authenticated

**Solution:**
1. Make sure you're still logged in to KYRA in your browser
2. Keep the browser window OPEN while running script
3. Don't log out before running capture
4. Restart browser if needed

### **Issue: Screenshots are blank/incomplete**

**Cause:** Page didn't fully render before screenshot

**Solution:**
- Increase `waitForTimeout` in the script (e.g., 3000ms instead of 1000ms)
- Add more specific selectors in `waitFor` field
- Manually scroll down on complex pages

---

## **Advanced: Custom Page List**

If you want to capture different/additional pages, edit `PAGES_TO_CAPTURE` in the script:

```javascript
const PAGES_TO_CAPTURE = [
  {
    name: 'your-page-name',
    url: 'https://kyra-guardrails-dev.seekerslab.com/path/to/page',
    description: 'Description for logs',
    waitFor: 'CSS selector for page content (e.g., "table" or "h1")',
  },
  // Add more pages...
];
```

---

## **Final Checklist**

Before the 5/26 KT DS meeting:

- [ ] Installed Node.js and Playwright
- [ ] Logged in to KYRA dev server
- [ ] Ran `node capture_all_kyra_pages.js`
- [ ] Reviewed captured screenshots in `screenshots/kyra-real/`
- [ ] Verified Access Policies screenshot is clear and professional
- [ ] Copied real screenshot to `screenshots/access_policies.png`
- [ ] Regenerated `AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf` with real screenshots
- [ ] Committed changes to GitHub
- [ ] Verified PDF on your local machine

---

## **Expected Result**

✅ **Proposal PDF with REAL KYRA screenshots** (not mockups)

✅ **Slide 19** shows actual admin console UI with role × classification matrix

✅ **Credibility boost:** "Look at the actual KYRA system" vs "Here's our mockup"

✅ **Ready to impress KT DS on 5/26** 🎯

---

**Need help?** Check the troubleshooting section or review the script comments for detailed explanations.
