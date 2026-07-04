# 현대엔지비 전사 AI 보안 포털 (Hyundai NGV Security Portal)

KYRA AI Guardrail 기반 전사(全社) AI 보안·거버넌스 제품 안내 자료.

## 문서

| 파일 | 설명 | 형식 |
|------|------|------|
| `현대엔지비_전사AI보안포털_제품안내서.md` | 기술 제품 안내서 (전사 AI 보안 포털) | Marp 슬라이드 (16:9) |
| `현대엔지비_전사AI보안포털_제품안내서.pdf` | 배포용 PDF | PDF |
| `현대엔지비_전사AI보안포털_제품안내서.html` | 배포용 HTML | HTML |

## 구성

기술 중심 구성으로, 시장 규모·도입 단계(로드맵)·인용 출처는 포함하지 않습니다.

1. 솔루션 개요 — 전사 단일 AI 보안 게이트웨이
2. 시스템 아키텍처 — 컨테이너 기반 마이크로서비스
3. 접근통제 — RBAC / ABAC 듀얼 정책 엔진
4. AI 보안 엔진 — 프롬프트 인젝션 방어 · DLP
5. RAG · Agentic AI 보안 — 지식베이스 격리 · 에이전트 권한 통제
6. 운영 · 연동 · 보안 하드닝 — 관리 콘솔 · REST API · 감사

## 슬라이드 생성

```bash
# PDF
npx @marp-team/marp-cli 현대엔지비_전사AI보안포털_제품안내서.md --pdf

# HTML
npx @marp-team/marp-cli 현대엔지비_전사AI보안포털_제품안내서.md --html
```
