# 🎯 Capture Real KYRA Screenshots — RIGHT NOW

**⚡ Quick Start:** 3 simple commands on your local machine

---

## **PROBLEM**

This cloud sandbox environment cannot access external websites (KYRA dev server). 

## **SOLUTION**

I've created a script that YOU can run on your local machine with the admin credentials.

---

## **DO THIS ON YOUR LOCAL MACHINE**

### **Step 1: Clone/Pull the Latest Code**

```bash
cd /path/to/kita-ax
git pull origin master
```

This gets the new `capture_kyra_with_auth.js` script with embedded credentials.

### **Step 2: Install Dependencies (if not done)**

```bash
npm install
npx playwright install chromium
```

### **Step 3: Run the Capture Script**

```bash
node capture_kyra_with_auth.js
```

**Expected output:**
```
╔═══════════════════════════════════════════════════════════════╗
║  KYRA Real Screenshot Capture — With Authentication           ║
║  Capturing from: https://kyra-guardrails-dev.seekerslab.com ║
╚═══════════════════════════════════════════════════════════════╝

🔐 Logging in with: admin@seekerslab.com
✅ Login page loaded
✍️  Entering credentials...
✅ Submitted login form
✅ Successfully logged in!

📸 Capturing (1/8): Login page
   URL: https://kyra-guardrails-dev.seekerslab.com/login
   ✅ Saved: kyra_01_login.png (156 KB)

📸 Capturing (2/8): Admin dashboard
   ✅ Saved: kyra_02_dashboard.png (203 KB)

[... continues for all 8 pages ...]

✨ Capture complete!
   ✅ Success: 8/8
   📁 Saved to: screenshots/kyra-real/
```

### **Step 4: Verify Screenshots**

```bash
ls -lh screenshots/kyra-real/
# You should see 8 PNG files
```

**Most important file to check:**
```bash
# On macOS:
open screenshots/kyra-real/kyra_04_access-policies.png

# On Linux:
feh screenshots/kyra-real/kyra_04_access-policies.png

# On Windows:
start screenshots/kyra-real/kyra_04_access-policies.png
```

✅ Should show the role × classification matrix with checkboxes

### **Step 5: Integrate Real Screenshot**

```bash
cp screenshots/kyra-real/kyra_04_access-policies.png screenshots/access_policies.png
```

### **Step 6: Regenerate PDF**

```bash
node capture_all_slides.js

python3 << 'EOF'
from PIL import Image
import os
screenshots_dir = 'screenshots'
slide_files = sorted([f for f in os.listdir(screenshots_dir) if f.startswith('slide_') and f.endswith('.png')])
images = [Image.open(os.path.join(screenshots_dir, f)).convert('RGB') for f in slide_files]
images[0].save('AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf', save_all=True, append_images=images[1:])
print(f"✅ PDF created with real KYRA screenshot ({len(images)} pages)")
EOF
```

### **Step 7: Commit & Push**

```bash
git add screenshots/kyra-real/ screenshots/access_policies.png AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf
git commit -m "feat: Add real KYRA admin console screenshots

- Captured 8 pages using automated login
- Real Access Policies screenshot integrated into Slide 19
- PDF regenerated with production-ready KYRA UI"

git push origin master
```

---

## **THAT'S IT! 🎉**

Your proposal PDF now has **REAL KYRA screenshots**, not mockups!

---

## **CREDENTIALS EMBEDDED IN SCRIPT**

The script already has the credentials baked in:
- Email: `admin@seekerslab.com`
- Password: `xmUoX0OA5XvSH4csBJbw`

**You don't need to enter them manually** — the script handles login automatically.

---

## **TROUBLESHOOTING**

### ❌ "Network error" or "Cannot reach server"

**Solution:** 
- Make sure you have internet connectivity
- Check if KYRA dev server is online
- Try accessing `https://kyra-guardrails-dev.seekerslab.com` in browser manually

### ❌ "Screenshot is blank"

**Solution:**
- Server might be slow → Wait a bit and retry
- Try running again: `node capture_kyra_with_auth.js`

### ❌ "Login failed"

**Solution:**
- Credentials might have changed
- Contact the KYRA team or check if account is active
- Try logging in manually in browser first to verify credentials work

---

## **QUESTIONS?**

Let me know when you:
1. ✅ Run the script
2. ✅ Get real screenshots
3. ✅ Verify kyra_04_access-policies.png looks good
4. ✅ Integrate and regenerate PDF
5. ✅ Push to GitHub

Then we're **100% ready for KT DS on 5/26!** 🚀
