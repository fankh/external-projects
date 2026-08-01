# SEEKERSLAB ITAM — AI 기반 IT 자산관리 시스템 (Shadow IT Discovery 포함)

자체 개발 자산관리 플랫폼. 등록되지 않은 미인가 자산까지 발견해 대장에 편입시키는
Shadow IT Discovery 를 핵심 차별점으로 한다.

## 프로젝트 개요

IT 자산관리 시스템. 핵심 차별 요구사항은 **Shadow IT Discovery** —
관리 대장에 등록되지 않은 미인가 자산(단말·서버·SaaS·클라우드 리소스)을 자동 발견해
자산 인벤토리로 편입시키는 기능.

동작하는 웹 플랫폼은 [`itam-web/`](itam-web/README.md) 참고 (실행·테스트·배포·화면 매핑).

## 산출물 / 자료

| 경로 | 설명 |
|------|------|
| `itam-web/` | **동작하는 웹 플랫폼** — Next.js 15 · React 19 · TS (edim 패턴, SEEKERSLAB 브랜드) |
| `AI기반_IT자산관리시스템_제품안내서.pdf` | 제품안내서 (14p, A4 가로) |
| `AI기반_IT자산관리시스템_제품안내서.html` | 제품안내서 원본 (Edge headless 재렌더링) |
| `diagrams/*.png` | 안내서 SVG 다이어그램 4종의 PNG 변환본 (2x, PPT 등 재사용) |
| `docs/구축_요약.md` | 구축 요약 — 구현 범위·폐쇄 루프·설계 결정·미완 항목 |
| `docs/DISCOVERY_CONCEPT.md` | Shadow IT Discovery 기능 초기 컨셉 (탐지 채널·아키텍처·단계화) |
