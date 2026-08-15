# Seekurity Presentation Style Guide

> Professional presentation standards inspired by IBM, HP, Microsoft, and enterprise consulting best practices.

---

## Brand Identity

### Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Primary Blue | `#0f62fe` | Headers, CTAs, accent elements |
| Secondary Blue | `#0353e9` | Links, interactive elements |
| Dark Gray | `#161616` | Body text, headings |
| Medium Gray | `#525252` | Subheadings |
| Light Gray | `#6f6f6f` | Captions, secondary text |
| Background | `#ffffff` | Primary background |
| Alternate BG | `#f4f4f4` | Section dividers |
| Success Green | `#198038` | Positive indicators |
| Warning Yellow | `#f1c21b` | Caution indicators |
| Error Red | `#da1e28` | Critical indicators |

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Title | IBM Plex Sans / Segoe UI | 600 | 44px |
| H1 | IBM Plex Sans / Segoe UI | 600 | 36px |
| H2 | IBM Plex Sans / Segoe UI | 500 | 28px |
| H3 | IBM Plex Sans / Segoe UI | 500 | 22px |
| Body | IBM Plex Sans / Segoe UI | 400 | 18px |
| Table | IBM Plex Sans / Segoe UI | 400 | 14-16px |
| Caption | IBM Plex Sans / Segoe UI | 400 | 12px |

---

## Slide Structure

### Title Slide

```markdown
<!-- _class: lead -->
<!-- _backgroundColor: #0f62fe -->
<!-- _color: #ffffff -->

# [Project Name]
## [Subtitle/Phase]

**[Customer Name]**

Prepared by Seekurity
[Date]
```

### Section Divider

```markdown
<!-- _class: lead -->
<!-- _backgroundColor: #f4f4f4 -->

# 01
## Section Title
```

### Content Slide

```markdown
# Slide Title

## Optional Subtitle

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data     | Data     | Data     |

- Bullet point
- Bullet point
```

### Closing Slide

```markdown
<!-- _class: lead -->
<!-- _backgroundColor: #0f62fe -->
<!-- _color: #ffffff -->

# Thank You

**Seekurity**
Enterprise Security Solutions

[contact@seekurity.com]
[phone]
[website]
```

---

## Content Principles

### 1. Clarity First

- One main idea per slide
- Maximum 6-7 bullet points
- No more than 3 levels of hierarchy
- Use tables for structured data

### 2. Visual Hierarchy

```
Title (largest, primary color)
    └── Subtitle (medium, secondary color)
            └── Body (standard, dark gray)
                    └── Caption (smallest, light gray)
```

### 3. Data Presentation

**DO:**
- Use tables for comparing items
- Include status indicators (Pass/Fail, Complete/Pending)
- Show targets vs. actuals
- Highlight key metrics

**DON'T:**
- Overcrowd tables (max 5-6 columns)
- Use inconsistent formatting
- Mix units without labels
- Hide important data in footnotes

### 4. Professional Language

**Use:**
- Active voice
- Specific metrics and dates
- Industry-standard terminology
- Concise statements

**Avoid:**
- Jargon without explanation
- Vague timeframes ("soon", "later")
- Passive constructions
- Marketing hyperbole

---

## Slide Types

### 1. Agenda Slide

```markdown
# Agenda

| # | Topic | Duration |
|---|-------|----------|
| 1 | Topic One | 10 min |
| 2 | Topic Two | 15 min |
| 3 | Topic Three | 20 min |

**Total Duration: X minutes**
```

### 2. Status Summary

```markdown
# Project Status

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Item 1 | X | Y | **PASS** |
| Item 2 | X | Y | **PASS** |
```

### 3. Timeline/Milestones

```markdown
# Timeline

| Phase | Start | End | Duration |
|-------|-------|-----|----------|
| Phase 1 | [DATE] | [DATE] | X weeks |
| Phase 2 | [DATE] | [DATE] | X weeks |
```

### 4. Risk Register

```markdown
# Risk Register

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|------------|
| R1 | Risk description | High/Med/Low | High/Med/Low | Mitigation |
```

### 5. Action Items

```markdown
# Next Steps

| # | Action | Owner | Due Date |
|---|--------|-------|----------|
| 1 | Action description | Name | [DATE] |
```

---

## Table Formatting

### Standard Table

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Data | Data | Data | Data |

### Status Indicators

| Item | Status |
|------|--------|
| Complete | **PASS** or **100%** |
| In Progress | *In Progress* or **X%** |
| At Risk | **AT RISK** |
| Blocked | **BLOCKED** |

### Metric Comparison

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Value | X | Y | +Z% or -Z% |

---

## Best Practices

### Slide Count Guidelines

| Presentation Type | Recommended Slides | Duration |
|------------------|-------------------|----------|
| Project Kickoff | 25-35 slides | 60-90 min |
| Project Completion | 30-40 slides | 60-90 min |
| Status Update | 10-15 slides | 30 min |
| Technical Review | 15-25 slides | 45-60 min |
| Executive Summary | 5-10 slides | 15-20 min |

### Time Per Slide

- Content slides: 2-3 minutes each
- Section dividers: 30 seconds
- Discussion slides: 5-10 minutes

### Presentation Flow

```
1. Title Slide
2. Agenda
3. [Section Divider]
4. Content Slides (3-5 per section)
5. [Repeat for each section]
6. Summary/Next Steps
7. Q&A
8. Thank You/Contact
9. Appendix (optional)
```

---

## Tools & Conversion

### Marp (Markdown to Presentation)

These templates are designed for [Marp](https://marp.app/), which converts Markdown to presentation formats.

**Installation:**
```bash
npm install -g @marp-team/marp-cli
```

**Convert to PDF:**
```bash
marp presentation.md --pdf
```

**Convert to PPTX:**
```bash
marp presentation.md --pptx
```

**Convert to HTML:**
```bash
marp presentation.md --html
```

### PowerPoint Conversion

When converting to PowerPoint:
1. Export from Marp to PPTX
2. Apply corporate template
3. Verify formatting
4. Add animations (sparingly)
5. Check speaker notes

---

## Checklist

Before presenting, verify:

- [ ] All placeholders replaced (`[CUSTOMER_NAME]`, `[DATE]`, etc.)
- [ ] Data is accurate and current
- [ ] Tables are properly aligned
- [ ] Status indicators are correct
- [ ] Dates are in consistent format
- [ ] Names and titles are correct
- [ ] Contact information is current
- [ ] Appendix references are valid
- [ ] Version history is updated
- [ ] Spell check completed

---

## File Naming Convention

```
SeekuritySIEM_[DocumentType]_[CustomerName]_v[Version].[ext]

Examples:
- SeekuritySIEM_Project_Kickoff_Acme_v1.0.pdf
- SeekuritySIEM_Project_Completion_Acme_v1.0.pptx
```

---

## Version Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-13 | Seekurity | Initial style guide |

