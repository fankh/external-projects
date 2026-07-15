# EDIM Next.js 기능 패리티 감사 (PM 관점)

> 2026-07-15, 컷오버(v13.64) 직후 전수 감사. 방법: 모듈별 5개 병렬 코드 대조(React `edim-web-react/src` ↔ Next `edim-web-next/app`)
> + 라이브 런타임 실클릭 검증. 근거 파일:라인은 각 모듈 절 참조.

## 결론 (Executive Summary)

**조회는 이관 완료, 업무는 미완.** 전 59화면이 SSR 조회로는 존재하지만, **쓰기/워크플로가 있는 화면 58개 중 15개만 서버 액션 보유**
(`find app/(app) -name actions.ts` = 15). 나머지 43개 화면은 React 에서 CRUD·결재·상태전이·Excel 왕복·PDF 발급이 있었으나
Next 에서 **읽기 전용 그리드로 축소**되었다. 레거시 React 는 `/edim-static` 롤백 자산으로 유지 중이므로 업무 연속성 위험은
롤백으로 관리 가능하나, Next 를 실사용 콘솔로 쓰려면 아래 P1 부터 복구해야 한다.

| 구분 | 판정 |
|---|---|
| 조회 화면 (대장·상세·대시보드) | ✅ 사실상 완전 이관 (DenseGrid 는 바이트 동일 이식 — 정렬·필터·CSV·컬럼설정·페이지네이션 전부) |
| 플래그십 상호작용 (Design Editor·UI Designer·Selection·Run·CAD 엔진) | ✅ 충실 이관 (DXF Import/Export·Macro 평가·undo/redo·승인요청·비동기 Run 파이프라인·CostPanel) |
| 개별 서버액션 화면 (data-i18n·relationship·quality 판정·work-process·holidays·inventory 입고·companies·cost-actual·mobile·print-setup·output) | ✅/🔶 핵심 동작 |
| **대장형 CRUD + 결재/상태전이 워크플로 (43화면)** | ❌ **읽기 전용으로 축소 — P1** |
| **셸 전역 계층 (⌘K 검색·F-key·전역 단축키·즐겨찾기·To-Do·비밀번호 변경)** | ❌ 미이관 (크롬 시각 구조는 v16.6 에서 복원) |
| i18n (화면 라벨 t()) | ❌ eco-ledger·RunPanel 외 하드코딩 한국어 (로케일 전환 시 KO 잔존) |

## P1 — 기능 상실 (업무 불가, 우선 복구)

### 결재·업무 처리 (가장 치명적 — 워크플로 중단) — 🔶 **N1 핵심 복구 (v16.8)**
1. ~~**승인함(common/approval)** — 승인/반려 단건·일괄·코멘트~~ ✅ v16.8 (다중선택+decide/decide-batch, 라이브 결재 E2E 검증) · Macro diff 패널은 후속(P2)
2. ~~**X-code 검토(cpq/x-review)** — 결재 액션·의견 입력~~ ✅ v16.8 (행 선택+승인/반려+의견)
3. ~~**업무함(erp/tasks)** — 완료 처리~~ ✅ v16.8 (+더블클릭→이벤트 상세 드릴다운) · 뷰 필터(내업무/부서)는 후속(P2)
4. ~~**이벤트 상세(detail/event)** — 완료·재배정·에스컬레이션~~ ✅ v16.8 (액션 패널)
5. ~~**이상 이벤트(erp/anomaly)** — 스캔·에스컬레이션·확인/해소 전이~~ ✅ v17.3~17.5 (+이관 시점부터 잠복하던 SSR 500 수정 — /anomalies 응답 언랩)

### 도메인 워크플로 (문서·설계·구매·생산) — 🔶 **PLM 5화면 N2 복구 (v17.0~17.1)**
6. **문서함(cpq/documents)** — 등록·메타수정(ACCEPTED 통제)·PDF 미리보기+Grade 열람통제·상세 드릴다운 상실
7. ~~**도면 대장(plm/drawings)** — 도면 등록·Rev-up·Supersedure·단계승인·상세~~ ✅ v17.0~17.1 (등록+Rev.A·Rev 이력·WRITE→REVIEW→APPROVE 단계승인·Supersedure — 라이브 E2E: 등록→Rev.B→WRITE ✓)
8. ~~**설계 변경(plm/eco-change)** — ECR 등록~~ ✅ v17.0 (영향분석 자동첨부 건수 표시)
9. ~~**부품 대장(plm/parts)** — 부품 등록·공급자 매핑~~ ✅ v17.0 (수정·삭제·Excel 왕복은 후속 P2)
10. ~~**Arrangement(plm/arrangement)** — M-4-2 구성코드/구성품 CRUD~~ ✅ v17.0 (대장+등록+구성품 추가/수량/삭제, CAD 구성도는 보조 패널 유지)
11. ~~**검증 규칙(plm/quality)** — 규칙 신규 등록~~ ✅ v17.0
12. ~~**수주 관리(erp/sales-order)** — 발송/수주/실주 전이 + 수주 전환~~ ✅ v17.3 (견적 Lifecycle 그리드 신설, 후속 TODO 건수 표시)
13. ~~**구매(erp/purchase·po)** — PO 발주 확정·QCR 발행·승인·입고(GR)~~ ✅ v17.7 (라이브 E2E: PO-00001 생성→승인→부분입고 50% — Stock Check 필터는 후속 P2)
14. ~~**재고(erp/inventory)** — 예약/해제·Lot 추적·ATP·입출고 이력~~ ✅ v17.7 (3패널: ATP·예약 등록/해제·이력)
15. ~~**작업지시(erp/work-order)** — 발행·착수/완료 전이~~ ✅ v17.3
16. ~~**검사·품질(erp/quality)** — 검사 등록(판정)·성적서 PDF~~ ✅ v17.7 (라이브 E2E: 등록→성적서 PDF 200 · /api/qc 프록시 + nginx 라우트 추가)
17. ~~**프로젝트(erp/projects)** — 등록·단계 저장(409 낙관적 잠금)·삭제~~ ✅ v17.3 (메타수정·파일 업로드는 후속 P2)
18. ~~**마일스톤(erp/milestones)** — 납기 등록·완료 처리~~ ✅ v17.3
19. ~~**단가(erp/prices)** — 등록·Excel Import·적용 마감~~ ✅ v17.7 (Import=서버액션 multipart+거부 리포트 — Resolve 시뮬레이션은 후속 P2)
20. ~~**환율·세금(erp/finance)** — 등록/삭제·세금엔진 계산기~~ ✅ v17.3~17.4 (계산기 응답 스키마 정합 수정 포함)
21. ~~**창고(erp/warehouses)** — 위치 등록(계층 검증)·삭제~~ ✅ v17.3 (수정 QuickEdit 은 후속 P2)
22. **거래처(erp/companies)** — 공급처 평가 스코어카드·Excel 대량등록 상실 (기본 등록·토글은 동작)
23. **사용자·권한(erp/roles)** — 사용자 관리 전체(등록/수정/잠금해제/레벨변경/초대)·권한 셀 토글·역할 CRUD 상실 — 관리자 기능 부재
24. **Code Set-up 5화면** — subcode(그룹등록·Excel 왕복·중복검토·승인), product-codes(CRUD·상태전이·일괄), datatable(셀 편집·행 CRUD·Excel), variant(등록·수정·폐기), materials(등록·수정) 전부 상실
25. **Hierarchy(code/groups)** — React sys_hierarchy 트리 편집기가 code_group 목록(다른 엔티티)으로 대체 — 계층 관리 기능의 Next 대응 화면 자체가 없음
26. **Macro Studio(toolbox/macros)** — 4-Way Sync 스튜디오(AI 생성·Test Run·함수 마법사·저장·승인) 전체 상실
27. **Templet 관리(toolbox/templets)** — CRUD·JSON 정의 편집기·승인 상실
28. **Run 이력(toolbox/runs)** — 산출물 드릴다운·Run 정리·MinIO GC 상실
29. **Run 산출물(cpq/run)** — "다음 행동"(미리보기/다운로드/AP요청/QCR/ERP 전송) 열 상실
30. **Tech Data(cpq/tech-data)** — Fan 성능표 PDF·밀도 계산서 PDF·성능 곡선·선정 연동 상실
31. **Report Center(cpq/reports)** — PCR 보고서 그리드+PDF 생성 상실 (카탈로그 카드만)
32. **선정(cpq/selection)** — 사양 Excel Import·견적 미리보기 PDF 상실
33. **Project Folder(common/folder)** — 폴더 분류·업로드·ZIP/고객전달 다운로드·이력 diff 상실

### 셸 전역
34. **⌘K 통합검색** — searchService·검색 UI 부재
35. **전역 단축키** — Alt+W/←→/1~9·Ctrl+K/S/P·Delete 핸들러 부재; **F2/F3/F8/F9/F12 디스패치는 수신자 0** (edim-fkey 발행만)

## P2 (편의 저하 — 2순위)
즐겨찾기·To-Do 푸터·F1 프로젝트 컨텍스트·비밀번호 변경 다이얼로그·데이터소스 표시·상태바 승인대기 카운트·
대시보드 드릴다운·감사 필터/XLSX·Audit before/after 패널·CAD 뷰어(레이어 특성편집·편집 영속·축척 PDF·DXF 다운로드)·
Duct(수동 도구·층 선택·기술계산표)·Work Process(공정 파라미터·CAD 매핑·Coding)·낙관적 잠금 안내·XLSX export 전반.

## P3 (사소 — 3순위)
화면 라벨 i18n 하드코딩(전 화면), F-key 라벨만 잔존, 로그인 부가 요소(로케일·테넌트·버전), MDI 파라미터 다중 인스턴스,
편집/조회 메뉴 드롭다운, 단축키 안내 다이얼로그, 데스크톱 세부 패널·KPI 타일 다수.

## 검증 방법 기록
- 서버 액션 커버리지: `find app/(app) -name actions.ts` = **15/58**
- 라이브 실클릭: 로그인→모듈 스위처→트리→MDI 탭→그리드(도면 대장 행 렌더)·EN 전환·창 메뉴·알림 벨 ✅ /
  부품 그리드 더블클릭 드릴다운 ❌ (감사 결과와 일치) / 로그인 랜딩 `/erp/eco-ledger`(→dashboard 로 통일 권장)
- DenseGrid: React↔Next **바이트 동일** — 그리드 계층은 회귀 없음

## 권고 복구 로드맵 (배치 단위, 기존 auto-next 규칙 재사용)
- **N1 결재 복구**: 승인함(단건·일괄·코멘트) + X-code 검토 + 업무함 완료 + 이벤트 액션 — 서버액션 4묶음, 기존 API 그대로
- **N2 대장 CRUD 1**: 도면 대장(등록·Rev·Supersedure·단계승인) + 부품 + ECO + Arrangement(M-4-2 복원)
- **N3 대장 CRUD 2 (ERP)**: 프로젝트·수주 전이·마일스톤·단가(Import 포함)·창고·작업지시·검사·재고(예약/추적)·구매(PO·QCR)·환율세금·이상이벤트
- **N4 관리자·Code**: 사용자·권한 매트릭스 + Code Set-up 5화면 + Hierarchy 트리 화면 신설
- **N5 스튜디오·문서**: Macro Studio 4-Way + Templet 편집기 + 문서함(등록·미리보기·Grade) + Run 산출물 액션 + PDF 발급(성능표·밀도·PCR·견적 미리보기)
- **N6 셸 전역**: ⌘K 검색·전역 단축키·F-key 수신 체계(useFKeys 이식)·즐겨찾기·To-Do·비밀번호 변경
- **N7 i18n·마감**: 화면 라벨 t() 전면 재배선 + 스모크 마커 확장

각 배치 완료 기준은 기존 규칙과 동일: 서버액션+빌드+스모크 마커+배포+라이브 검증+본 문서 체크오프.
