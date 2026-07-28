# KT ds 자산관리 시스템 (Shadow IT Discovery 포함)

## 상태

- **단계**: 문의 접수 / 초기 검토
- **문의 접수**: 2026-07-28 (홈페이지 Contact 폼)
- **문의자**: 김진언 (KT ds) · jinun.kim@kt.com · 010-6495-2712
- **기존 관계**: KT ds 는 보안 교육 기수행 고객 (`C:\repos\security-lectures\ktds-*` — AI 보안관제, 위협 인텔리전스, LLM 보안)

## 프로젝트 개요

IT 자산관리 시스템 구축 검토. 핵심 차별 요구사항은 **Shadow IT Discovery** —
관리 대장에 등록되지 않은 미인가 자산(단말·서버·SaaS·클라우드 리소스)을 자동 발견해
자산 인벤토리로 편입시키는 기능.

## 산출물 / 자료

| 경로 | 설명 |
|------|------|
| `AI기반_IT자산관리시스템_제품안내서.pdf` | **고객 공유용 제품안내서** (14p, A4 가로 — 보안포털 안내서 패턴 적용) |
| `AI기반_IT자산관리시스템_제품안내서.html` | 제품안내서 원본 (수정 후 Edge headless 재렌더링) |
| `diagrams/*.png` | 안내서 SVG 다이어그램 4종의 PNG 변환본 (2x, PPT 등 재사용) |
| `docs/DISCOVERY_CONCEPT.md` | Shadow IT Discovery 기능 초기 컨셉 (탐지 채널·아키텍처·단계화) |
| `docs/reference/` | 고객 제공 자료 (수신 시 보관) |

## 다음 단계

- [ ] 문의자 회신: 요구 범위 확인 질문 (관리 대상 자산 유형, 규모, 기존 자산관리 도구, 온프레미스/클라우드 비중)
- [ ] 범위 확인 후 제안 방향 수립 (신규 구축 vs 기존 CMDB/ITAM 연계 vs Discovery 모듈 단독)
- [ ] 미팅 일정 협의
