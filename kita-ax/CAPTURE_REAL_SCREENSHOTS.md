# Capture Real KYRA Screenshots

**⚡ Quick Start:** Run this on your local machine (where you have internet)

## Prerequisites

```bash
cd /path/to/kita-ax
npm install
npx playwright install chromium
```

## Run Capture Script

```bash
node capture_kyra_with_auth.js
```

## What It Captures

8 pages from `https://kyra-guardrail-dev.seekerslab.com`:
1. Login page
2. Admin dashboard
3. Documents
4. **Access Policies** ← Most important (replaces mockup)
5. Audit logs
6. Users
7. Settings
8. Agents

Screenshots saved to: `screenshots/kyra-real/kyra_01_login.png` through `kyra_08_agents.png`

## Replace Mockup & Regenerate PDF

Once you have the real screenshots:

```bash
# Copy the real Access Policies screenshot
cp screenshots/kyra-real/kyra_04_access-policies.png screenshots/access_policies.png

# Regenerate PDF with real screenshot
node convert_html_to_pdf.js

# Verify
pdfinfo AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf

# Commit & push
git add screenshots/access_policies.png AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf
git commit -m "feat: Replace mockup with real KYRA admin console screenshots"
git push origin master
```

## Credentials

Already embedded in `capture_kyra_with_auth.js`:
- Email: `admin@seekerslab.com`
- Password: `xmUoX0OA5XvSH4csBJbw`

## Troubleshooting

If script fails with "Connection refused" or "Timeout", check:
1. Internet connection is active
2. KYRA dev server is online: https://kyra-guardrail-dev.seekerslab.com
3. Account is active (try logging in manually in browser)

---

**Status:** Corrected URL is in `capture_kyra_with_auth.js`. Awaiting real screenshot capture from local machine. 🚀
