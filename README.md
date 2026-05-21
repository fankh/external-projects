# External Projects

Documentation repository for Korean SI (System Integration) projects. Contains project-related materials, proposals, requirements, and deliverables—no source code.

## 📋 Repository Structure

```
external-projects/
├── _template/              # Generic SI project templates (copy this folder for new projects)
│   ├── 01_제안서/          # Project Proposal
│   ├── 02_요구사항/        # Requirements Definition
│   ├── 03_기능확인서_FVT/  # Feature Verification Test
│   └── 04_WBS/             # Work Breakdown Structure & Schedule
├── kita-ax/                # Example project: AI Guardrail proposal documents
└── README.md
```

## 🚀 Getting Started

### 1. Create a New Project

Copy the `_template/` folder for each new SI engagement:

```bash
cp -r _template <project-name>
```

**Naming convention:** Use project code or client name (e.g., `sk-ax`, `kt-billing`, `kisa-security`)

### 2. Project Templates

Each template folder contains HTML documents designed for A4 print format with bilingual (Korean/English) content:

#### 01_제안서 (Proposal)
- **File:** `PROPOSAL.html`
- **Format:** A4 portrait, self-contained HTML
- **Sections:**
  - Executive Summary (제안 개요)
  - Scope of Work (사업 범위)
  - Solution Architecture (솔루션 구성)
  - Feature Specifications (기능 명세)
  - Project Schedule (수행 일정)
  - Team & Roles (투입 인력)
  - Pricing (사업 금액)
  - Expected Benefits (기대 효과)
  - Company Profile (회사 소개)

#### 02_요구사항 (Requirements)
- **File:** `REQUIREMENTS.html`
- **Format:** A4 portrait, self-contained HTML
- **Sections:**
  - Document History (문서 이력)
  - Project Overview (프로젝트 개요)
  - Functional Requirements (기능 요구사항)
  - Non-Functional Requirements (비기능 요구사항)
  - Interface Requirements (인터페이스 요구사항)
  - Constraints (제약 사항)
  - Glossary (용어 정의)

#### 03_기능확인서_FVT (Feature Verification Test)
- **File:** `FVT.html`
- **Format:** A4 portrait, self-contained HTML
- **Terminology:** 기능확인서 (not 인수확인서/UAT) — standard for Korean SI projects
- **Sections:**
  - Purpose & Scope (문서 목적 및 범위)
  - Test Environment (시스템 환경)
  - Test Cases (기능 확인 항목)
  - Non-Functional Checks (비기능 확인 항목)
  - Defect List (결함 목록)
  - Final Sign-off (최종 확인 및 승인)

#### 04_WBS (Work Breakdown Structure)
- **File:** `WBS.html`
- **Format:** A4 **landscape**, self-contained HTML
- **Sections:**
  - Project Header (프로젝트 기본 정보)
  - WBS Table with 8 phases:
    1. 착수 (Kickoff)
    2. 분석 (Analysis)
    3. 설계 (Design)
    4. 구현 (Development)
    5. 테스트 (Testing)
    6. 이행 (Migration)
    7. 안정화 (Stabilization)
    8. 종료 (Closure)
  - Milestone Summary (마일스톤 요약)

## 🎨 Design System

All templates follow a consistent design system:

- **Fonts:** Pretendard, Noto Sans KR (Google Fonts)
- **Color Palette:**
  - Primary: `#1a1a40` (dark navy)
  - Accent: `#2e8b57` (green)
  - Light backgrounds: `#f5f5f5`
  
- **Key Features:**
  - Print-ready A4 layout with proper margins
  - Bilingual headers (Korean + English)
  - Section headers with left accent border
  - Professional tables with alternating row colors
  - Status badges (Pass/Fail/Pending) and severity indicators
  - Self-contained HTML (no external dependencies)

## 📄 Using the Templates

### 1. Open in Browser
All HTML files can be opened directly in any modern web browser (Chrome, Edge, Safari, Firefox).

### 2. Edit Content
- Edit HTML files directly in a text editor or IDE
- Replace `[placeholder text]` with actual project details
- Use `[YYYY.MM.DD]` format for dates
- Use `₩` symbol for Korean Won amounts

### 3. Print to PDF
- Open HTML in browser
- Use **Print** (Ctrl+P / Cmd+P)
- Select **Save as PDF** option
- Choose A4 size (landscape for WBS)
- PDF files can then be distributed for formal sign-off

### 4. Example placeholders to update:
- `[프로젝트명]` → Project name
- `[고객사명]` → Client name
- `[YYYY.MM.DD]` → Date
- `[이름]` → Person name
- `₩[금액]` → Amount in Korean Won

## 📊 Example: kita-ax

The `kita-ax/` folder contains an existing project example with AI Guardrail proposal documents:
- `AI_GUARDRAIL_PROPOSAL.html` — Portrait proposal
- `AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html` — Presentation slide deck
- `logo_colored.png`, `logo_white.png` — Company logos

## ✅ Checklist for New Project

- [ ] Copy `_template/` → `<project-code>/`
- [ ] Update all `[placeholder]` values in each HTML file
- [ ] Add company/project logos if needed
- [ ] Review content for accuracy (dates, names, amounts)
- [ ] Test print preview in browser (Ctrl+P)
- [ ] Save as PDF for distribution
- [ ] Commit and push to repository

## 🔒 Confidentiality

All documents include "Confidential" watermarks and footers indicating restricted distribution. Ensure appropriate access controls when sharing.

## 📝 Notes

- All HTML files are **self-contained** — no external resources required beyond Google Fonts
- **Landscape format** (WBS) should be explicitly selected when printing to PDF
- For presentations, use the landscape variant or export individual slides
- Keep version numbers updated in document headers
- Update author/reviewer information for document history

---

**Last Updated:** 2026-05-21  
**Version:** 1.0
