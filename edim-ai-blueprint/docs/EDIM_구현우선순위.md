# EDIM 구현 우선순위 로드맵

> 남은 구현 항목의 우선순위 결정 기록. 산출물 체계는 [README](README.md), 현재 상태는 [진행현황](EDIM_진행현황.md) 참조.

| 항목 | 내용 |
|---|---|
| 문서 버전 | v0.1 (2026-07-09) |
| 판단 기준 | ① 보안·신뢰성 리스크 ② 핵심 가치사슬(RCCS→Run) 완성도 ③ 의존성 선후관계 ④ 검수(FVT) 커버리지 |
| 현재 기준선 | 24화면+상세4종 전량 · 실 PG 연동 13 엔드포인트(쓰기 4) · mock 폴백 체계 |

---

## 우선순위 총괄

| 순위 | 항목 | 이유 (왜 이 순서인가) | 관련 ID | 규모 |
|---|---|---|---|---|
| **P0-1** | **API 인증 강제 (JWT 검증 + 테넌트 클레임)** | `/api/v1` 이 현재 **무인증 공개** — 쓰기 엔드포인트(승인·완료·등록)가 노출된 보안 결함. 다른 모든 작업의 전제 | REQ-N-001 · SYS-001/002 | S |
| **P0-2** | 잔여 mock 데이터셋 실 DB 이행 | "절반 live·절반 mock" 상태는 데모 신뢰를 깎음 — Dashboard KPI/부서 Event 집계, Child Group, PR 품목, Folder 파일 목록 | ERP-014 · CODE-008 · ERP-007 | M |
| **P1-1** | Table12 행 CRUD + Excel Import | **Macro·기술데이터·단가의 원천 데이터** — Table 없이는 이후 엔진이 전부 mock. row_key_num 정렬은 DDL 검증 완료 | TBL-001~006 | M |
| **P1-2** | Running Test API (BOM 전개 재사용) | 승인 게이트의 실체 — "Test 통과해야 승인"이 실제 규칙이 됨. expand SQL 재사용이라 저비용 | CODE-009 | S |
| **P1-3** | 파일 업/다운로드 (MinIO presigned, SVC-12) | **인프라 이미 가동 중** — Project Folder·접수자료·Run 산출물이 실파일이 됨. 이행(RECEIVED) 준비물 | RUN-009 · DOC-004 | M |
| **P1-4** | Macro 실행 엔진 v1 (ENG-01) | EDIM 차별점의 심장 — `Table12(E,10:25,Cos2)+Var(...)` 파서·평가기. P1-1(Table) 선행 필수 | TBX-005~012 | **L** |
| **P2-1** | 알림 (sys_notification + WebSocket, SVC-13) | 승인·기한초과 흐름이 이미 실동작 — 통지가 붙어야 프로세스가 닫힘 | SYS-011 · ERP-003 | M |
| **P2-2** | RBAC 서비스 재검사 | 권한승인정의서 매트릭스(98메뉴)를 API 레벨에 적용 — P0-1(인증) 선행 | SYS-003~005 | M |
| **P2-3** | i18n 번들 API + 프론트 로더 | sys_translation 테이블·API 스펙 확정 상태 — en/ja/zh 런타임 전환 | REQ-N-015 · SYS-021 | M |
| **P2-4** | 인쇄 렌더 (SVC-11, Print Form → PDF) | 견적서·승인도서 출력 — 워터마크·Grade 통제 실체화. Playwright PDF 재사용 가능 | CPQ-013 · DOC-002 | M |
| **P3-1** | EDIM Run 실 파이프라인화 | BOM 단계는 이미 실 SQL — 치수(=P1-4 엔진)·원가(resolve 확장)·산출물 저장(=P1-3)을 단계별로 실체화. **P1 완료 후 자연 조립** | RUN-001~009 | **L** |
| **P3-2** | Jenkins CI/CD 파이프라인 | 수동 배포(빌드→커밋→pull→rsync)를 자동화 — Jenkins 대기 중, 배포 절차는 README에 문서화 완료 | INF-05 | S |
| **P3-3** | 백업·모니터링 (INF-07) | pg_dump 일배치 + 헬스 알림 — 운영 전환 전 필수 | REQ-N-008 | S |
| **P4-1** | Excel Import/Export 전면 (INT-03) | 사양 Import·BOM/견적 Export — 양식 확정(고객 협의) 대기 | INT-03 · CPQ-003 | M |
| **P4-2** | AI 연동 (AI-01/04) — Macro 생성·UI 제안 | `ANTHROPIC_API_KEY` 설정만으로 경로 존재 — 데모 임팩트 크지만 핵심 계약 아님 | AI-004~006 | M |
| **P4-3** | CAD 변환 (INT-04, ODA) | ODA 라이선스 확인 대기 (고객 협의 항목) | DWG-022~025 | L |
| **P4-4** | Mobile 실앱 · Digital Twin 연계 | P5 계획 항목 — 스펙 협의(슬라이드 77) 선행 | APP-* · I-002 | L |

규모: S = 1~2일 · M = 3~5일 · L = 1~2주 (1인 기준, mock 폴백 체계 유지 가정)

---

## 의존성 체인

```
P0-1 인증 ─┬─→ P2-2 RBAC
           └─→ (모든 쓰기 API 의 전제)

P1-1 Table CRUD ──→ P1-4 Macro 엔진 ──→ P3-1 Run 파이프라인 (치수 단계)
P1-3 파일(MinIO) ─────────────────────→ P3-1 Run 파이프라인 (산출물 단계)
P1-2 Running Test ─→ (승인 게이트 완성 — 이미 있는 decide 와 결합)
P2-1 알림 ←─ 승인·이벤트 쓰기 (완료됨)
```

핵심 경로(critical path)는 **Table → Macro 엔진 → Run 파이프라인**. 이 축이 EDIM의
"Configuration 선택 → 전 자료 자동 생성" 가치를 실제로 증명한다.

---

## 단계 제안 (2주 스프린트 기준)

| 스프린트 | 범위 | 완료 판정 (FVT 연계) |
|---|---|---|
| **S1** ✅ 완료 (2026-07-09) | P0-1 + P0-2 + P1-2 | 무토큰 쓰기 API 401 ✓ · Dashboard 집계/Child Group/PR 품목/Folder(cpq_output) live ✓ · Running Test 실전개(KDP 1-21-13-15) ✓ |
| **S2** ✅ 완료 (2026-07-09) | P1-1 + P1-3 | Table12 CRUD·Excel Import(upsert·거부 리포트) 실저장 ✓ · 파일 업/다운로드(MinIO 프록시, dwg_file) 바이트 일치 ✓ |
| **S3** | P1-4 (엔진 v1: 사칙·IF·Table()·Var() 범위) | Design Editor 치수 평가가 엔진 결과로 동작 (B=A+56 실계산) |
| **S4** | P2-1 + P2-2 + P3-2 | 승인→알림 수신 · GENERAL 계정 권한 차단 · push 시 자동 배포 |
| **S5** | P3-1 + P2-4 | Run 이 실 산출물(PDF 견적서) 을 Folder 에 저장 |
| 이후 | P2-3 · P3-3 · P4-* | 번역 콘텐츠·운영 준비·협의 항목 확정 후 |

> WBS(착수 2026-08-03 가정) 관점: S1~S3 은 WBS P1(기반)·P2(코어) 구간의 선행 검증(PoC)에 해당하며,
> 본사업 착수 시 본 로드맵의 산출 코드가 그대로 기준선이 된다.

---

## 협의 대기로 인한 보류 (우선순위 외)

| 항목 | 차단 사유 |
|---|---|
| DUCT 자동 배치 고도화 | 사업 범위 미확정 (보완노트 §3.3) |
| 외부 ERP 어댑터 (I-001) | 대상 ERP 미확정 |
| Digital Twin (I-002) | DTDesigner 스펙 협의 필요 |
| 보안 솔루션 연계 (DOC-004) | 요건 협의 대상 |
| CAD ODA (INT-04) | 라이선스 확인 |

---

## 변경 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| v0.1 | 2026-07-09 | 최초 작성 — 실 백엔드 배치 A 완료 시점의 잔여 항목 우선순위화 |
