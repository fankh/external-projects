# KOVAN SIEM Deliverables — Slide Rules

## Marp Slide Constraints
- Slide: 1280x720px, header 43px, footer 32px, content area ~645px usable height
- NEVER place content that overflows the footer (bottom 32px)
- All images MUST be wrapped in fixed-height containers with overflow:hidden
- Main screenshots: 320px height (img-crop-lg class)
- Appendix 2x2 grid: 160px per image (grid-2x2 + g-img class), max 4 per slide
- Tables: max 10 rows per slide, split if more
- Bullet lists: max 8 items per slide

## Image Rules
- Always use `<div style="height:Npx; overflow:hidden; margin:8px 56px;">` wrapper
- Place descriptions ABOVE images (Marp auto-expands images downward)
- Use object-fit:cover + object-position:top to show top portion of cropped images
- Never use bare `<img>` without height-constrained wrapper
- Architecture SVG: use viewBox to constrain, no wrapper needed

## Table Rules
- Use `display: table !important` in global CSS to force full width
- Cover/TOC tables: narrower width (400-520px), centered or left-aligned
- Content tables: full width via global CSS
- Max 10 rows per table slide, split into multiple slides if needed
- Column widths: use `table-layout: auto` for content-based sizing

## Footer
- Footer height: 32px, always visible at bottom
- Content must end at least 32px above the slide bottom
- Never overlap footer with content
- Verify via screenshot after every change

## Build Command
```bash
CHROME_PATH=/tmp/chrome-no-sandbox.sh npx @marp-team/marp-cli@latest --no-stdin FILE.md --pdf --allow-local-files --browser-path /tmp/chrome-no-sandbox.sh -o FILE.pdf
```

## Verification
- Always generate PNG screenshots and visually verify
- Check bottom 50px of each slide for overflow
- Crop bottom area with PIL to programmatically detect dark pixels near footer
