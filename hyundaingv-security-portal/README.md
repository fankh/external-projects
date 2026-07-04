# 현대엔지비 IT·보안 거버넌스 포털 (Hyundai NGV IT & Security Governance Portal)

IT 투자/비용 · 인프라 운영 · 프로젝트 · 보안 컴플라이언스를 단일 포털로 통합하는
전사 IT 관리 시스템의 **기술 제품 안내서**.

> 요구사항 원본: `sample.xlsx` (IT포털시스템 개발 목록) — 검증된 전사 구축 사례 기반.

## 문서

| 파일 | 설명 | 형식 |
|------|------|------|
| `현대엔지비_IT보안_거버넌스포털_제품안내서.html` | 기술 제품 안내서 (고정 레이아웃 슬라이드) | HTML (A4 landscape) |
| `현대엔지비_IT보안_거버넌스포털_제품안내서.pdf` | 배포용 PDF (16p) | PDF (A4 landscape) |
| `sample.xlsx` | 요구사항 원본 (메뉴체계·첨부·결재) | Excel |

## 구성

기술 중심 구성으로, 시장 규모·도입 단계(로드맵)·인용 출처는 포함하지 않습니다.

1. **시스템 개요** — 전사 IT·보안 통합 포털 / 메뉴 체계(10대 업무 도메인)
2. **플랫폼 아키텍처** — 3-Tier 구성 / 권한·접근통제 모델 / 전자결재 워크플로우 엔진
3. **IT 운영 관리 모듈** — IT 투자·비용 / IT Request(SR) / 인프라 운영 / 프로젝트
4. **보안 거버넌스 모듈** — 임직원 보안의식 제고 / 보안 컴플라이언스(교육·점검, ISMS)
5. **연동 & 공통 기반** — 시스템 연동(Knox·HR-HUB·자산관리) / 공통 기능·환경설정
6. **기술 스택 & 보안** — Windows · MS-SQL · WAS · SAML SSO · DB암호화 · 시큐어코딩

## PDF 재생성

HTML의 CSS `@page`(A4 landscape)를 그대로 반영하려면 `prefer_css_page_size` 옵션이 필요합니다.

```python
from playwright.sync_api import sync_playwright
import pathlib
html = pathlib.Path('현대엔지비_IT보안_거버넌스포털_제품안내서.html').resolve().as_uri()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.goto(html, wait_until='networkidle')
    pg.pdf(path='현대엔지비_IT보안_거버넌스포털_제품안내서.pdf',
           prefer_css_page_size=True, print_background=True)
    b.close()
```

> 참고: Chrome/Edge `--print-to-pdf` CLI는 CSS `@page` 크기를 무시하고 Letter 세로로 출력되므로 사용하지 않습니다.
