# EDIM Next.js 기능 패리티 감사 (PM 관점)

> 2026-07-15, 컷오버(v13.64) 직후 전수 감사. 방법: 모듈별 5개 병렬 코드 대조(React `edim-web-react/src` ↔ Next `edim-web-next/app`)
> + 라이브 런타임 실클릭 검증. 근거 파일:라인은 각 모듈 절 참조.

## 결론 (Executive Summary)

> **🏁 2026-07-16 P1 전량 복구 완료 (N1~N6, v16.8~18.9).** 감사 시점(컷오버 직후) 판정은 아래와 같았으나,
> 결재(N1)·PLM 대장(N2)·ERP 대장/공급망(N3)·관리자/Code(N4)·문서/스튜디오/PDF(N5)·셸 전역(N6) 배치로
> **P1 35개 클러스터 전부 해소**. 서버 액션 보유 화면 15/58 → 40+/58, 스모크 13 → 56체크. 잔여는 P2/P3 (아래 절).

**감사 시점(2026-07-15) 판정 — 조회는 이관 완료, 업무는 미완.** 전 59화면이 SSR 조회로는 존재하지만, **쓰기/워크플로가 있는 화면 58개 중 15개만 서버 액션 보유**
(`find app/(app) -name actions.ts` = 15). 나머지 43개 화면은 React 에서 CRUD·결재·상태전이·Excel 왕복·PDF 발급이 있었으나
Next 에서 **읽기 전용 그리드로 축소**되었다. 레거시 React 는 `/edim-static` 롤백 자산으로 유지.

| 구분 | 판정 |
|---|---|
| 조회 화면 (대장·상세·대시보드) | ✅ 사실상 완전 이관 (DenseGrid 는 바이트 동일 이식 — 정렬·필터·CSV·컬럼설정·페이지네이션 전부) |
| 플래그십 상호작용 (Design Editor·UI Designer·Selection·Run·CAD 엔진) | ✅ 충실 이관 (DXF Import/Export·Macro 평가·undo/redo·승인요청·비동기 Run 파이프라인·CostPanel) |
| 개별 서버액션 화면 (data-i18n·relationship·quality 판정·work-process·holidays·inventory 입고·companies·cost-actual·mobile·print-setup·output) | ✅/🔶 핵심 동작 |
| **대장형 CRUD + 결재/상태전이 워크플로 (43화면)** | ❌ **읽기 전용으로 축소 — P1** |
| **셸 전역 계층 (⌘K 검색·F-key·전역 단축키·즐겨찾기·To-Do·비밀번호 변경)** | ❌ 미이관 (크롬 시각 구조는 v16.6 에서 복원) |
| i18n (화면 라벨 t()) | ✅ **N7 완료 (v19.2~19.4)** — 전 59화면 t() 재배선, EN 전환 라이브 검증(File/Edit/…). 신규 키 EN/JA/ZH 시드는 후속 |

## P1 — 기능 상실 (업무 불가, 우선 복구)

### 결재·업무 처리 (가장 치명적 — 워크플로 중단) — 🔶 **N1 핵심 복구 (v16.8)**
1. ~~**승인함(common/approval)** — 승인/반려 단건·일괄·코멘트~~ ✅ v16.8 (다중선택+decide/decide-batch, 라이브 결재 E2E 검증) · Macro diff 패널은 후속(P2)
2. ~~**X-code 검토(cpq/x-review)** — 결재 액션·의견 입력~~ ✅ v16.8 (행 선택+승인/반려+의견)
3. ~~**업무함(erp/tasks)** — 완료 처리~~ ✅ v16.8 (+더블클릭→이벤트 상세 드릴다운) · 뷰 필터(내업무/부서)는 후속(P2)
4. ~~**이벤트 상세(detail/event)** — 완료·재배정·에스컬레이션~~ ✅ v16.8 (액션 패널)
5. ~~**이상 이벤트(erp/anomaly)** — 스캔·에스컬레이션·확인/해소 전이~~ ✅ v17.3~17.5 (+이관 시점부터 잠복하던 SSR 500 수정 — /anomalies 응답 언랩)

### 도메인 워크플로 (문서·설계·구매·생산) — 🔶 **PLM 5화면 N2 복구 (v17.0~17.1)**
6. ~~**문서함(cpq/documents)** — 등록·메타수정·PDF 미리보기·상세 드릴다운~~ ✅ v18.3 (라이브 E2E: 등록→PDF 렌더 200→메타 수정 — /api/next/bin 프록시)
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
22. ~~**거래처(erp/companies)** — 공급처 평가 스코어카드·Excel 대량등록~~ ✅ v20.0 (라이브 E2E: 등록 모달[평가등급 필드]→SUPPLIER 행 클릭→이행지표·평가이력→평가 저장[총점·등급] · Excel 대량등록 /companies/import-excel — 테스트 행 DB 정리 완료)
23. ~~**사용자·권한(erp/roles)** — 사용자 등록/잠금해제/레벨변경/비활성 + 권한 셀 토글 + 역할 CRUD~~ ✅ v17.9 (라이브 E2E: 사용자 등록→레벨 SETUP→역할 생성/삭제 — 초대·다중역할·모듈 구성은 후속 P2)
24. ~~**Code Set-up 5화면**~~ ✅ v17.9~18.1 전체 완료 — product-codes·variant·materials(v17.9) + subcode(그룹등록·중복검토 게이트→승인·Excel 왕복)·datatable(행 편집 패널·추가/삭제·Excel — 라이브 E2E: UT99 추가→저장→삭제 왕복) (v18.1)
25. ~~**Hierarchy(code/groups)**~~ ✅ v18.1 — sys_hierarchy 트리 패널 신설(treeType 전환·노드 등록/개명/삭제), code_group 그리드 병치. **/api/next/ 공용 프리픽스** 신설(XLSX 프록시, nginx 1회 라우팅으로 이후 핸들러 커버)
26. ~~**Macro Studio(toolbox/macros)** — 식 편집·Test Run·저장·승인·삭제~~ ✅ v18.5 (라이브 E2E: =IF 식 평가 결과 30 — 4-Way Sync 뷰·AI 생성은 후속 P2)
27. ~~**Templet 관리(toolbox/templets)** — JSON 정의 편집기·upsert·삭제~~ ✅ v18.5~18.7 (+definition 객체 렌더 **잠복 SSR 500** 수정)
28. ~~**Run 이력(toolbox/runs)** — Run 정리·보관 정리·MinIO GC~~ ✅ v18.5
29. ~~**Run 산출물(cpq/run)** — 다운로드·상세 드릴다운~~ ✅ v18.3 (AP요청/QCR/ERP 전송 라벨은 후속 P2)
30. ~~**Tech Data(cpq/tech-data)** — 행 선정 + Fan 성능표/밀도 계산서 PDF~~ ✅ v18.5 · ~~성능 곡선 SVG~~ ✅ v22.9
31. ~~**Report Center(cpq/reports)** — PCR 보고서 그리드+PDF~~ ✅ v18.3 (라이브: PCR PDF 200)
32. ~~**선정(cpq/selection)** — 사양 Excel Import·견적 미리보기 PDF~~ ✅ v18.5
33. ~~**Project Folder(common/folder)** — 업로드·개별/ZIP 다운로드·DXF 드릴다운~~ ✅ v18.3 (라이브: ZIP 2.4MB — 폴더 트리 분류·이력 diff 는 후속 P2)

### 셸 전역 — 🏁 **N6 완료 (v18.9)**
34. ~~**⌘K 통합검색**~~ ✅ v18.9 (메뉴바 우측 — 화면 레지스트리+/search 그룹 드롭다운 딥링크, Ctrl+K 포커스 라이브 검증)
35. ~~**전역 단축키·F-key 수신**~~ ✅ v18.9 (Alt+W/←→/1~9·Ctrl+K + useFKeys 훅 — Macro F12/F9·데이터 Table F12/F3 배선, 라이브 E2E: Alt+← 탭 이동·F9 평가) + 비밀번호 변경 다이얼로그(B8) 복원

## P2 (편의 저하 — 2순위)
~~To-Do 푸터~~ ✅ v20.2 · ~~상태바 승인대기 카운트~~ ✅ v20.2 · ~~비밀번호 변경 다이얼로그~~ ✅ v18.9 · ~~데이터소스 표시(DB 라벨)~~ ✅ v18.9 ·
~~즐겨찾기~~ ✅ v20.4~20.5 · ~~대시보드 드릴다운~~ ✅ v20.4 · ~~감사 필터/XLSX~~ ✅ v20.4 · ~~Audit before/after 패널~~ ✅ v20.4 ·
~~F1 프로젝트 컨텍스트~~ ✅ v21.2 (타이틀바 활성 프로젝트 — localStorage 레거시 동일 키+첫 프로젝트 시드+행 클릭 edim-set-project) ·
~~XLSX export 전반~~ ✅ v21.2 (대장 5종 prices·parts·drawings·warehouses·companies — /api/next/xlsx 프록시+ScreenHeader 버튼, 라이브 5/5 200) — 잔여:
CAD 뷰어(레이어 특성편집·~~편집 영속~~ ✅ v34.11(onEdit 실배선 — 작도·마퀴·트림 영속)·~~축척 PDF~~ ✅ v34.9/16·DXF 다운로드는 Project Folder ⬇ 로 갈음)·
Duct(~~층 선택·기술계산표~~ ✅ v23.1·~~수동 도구~~ ✅ U1/U2 편집 트랙(✎ 수동 조정))·Work Process(~~공정 파라미터~~ ✅ v21.4·~~CAD 매핑~~ ✅ E5·Coding)·낙관적 잠금 안내(~~프로젝트 단계 409~~ ✅).
- **2026-07-19 트리아지 추가 해소(v34.8~19)**: 부품 rowActions 선택/삭제·제품코드 인라인 편집·승인함 유형 필터/검색·거래처 더블클릭 수정·요구사항 접수 모달·감사 필드별 diff·⌘K 그룹 확장(공급처/창고/Macro/사용자)·전달 패키지(E2)·블록 DXF·프로젝트 중복검토 — U35 참조
- To-Do 푸터/상태바 카운트: shellCounts 서버액션(/approvals/inbox 길이 + /erp/dashboard delayed 합), 초기+라우팅+60초 폴링+edim-inbox-refresh 즉시 갱신. 라이브: 상태바 `승인 대기 3` 실데이터.
- 즐겨찾기(D8): 메뉴바 ★ 토글+칩(최대 8), /prefs/favorites 서버 영속. 레거시 SPA 항목(screenId 기반, href 없음)은 읽기 시 필터(v20.5). 라이브 E2E: 추가→칩 이동→해제.
- 감사(M-14-6A): 레거시 AuditQueryScreen 풀 포팅 — facet 콤보 필터·F8 재조회·선택 CSV·XLSX(kind=audit 프록시)·before/after 상세 패널. 라이브: XLSX 200.
- 대시보드: KPI 타일 드릴다운(F10) + 부서 Event 행→부서 업무함(E4). 라이브: 승인 대기→승인함 이동.

## P3 (사소 — 3순위)
~~화면 라벨 i18n 하드코딩(전 화면)~~ ✅ v34.9~19 (N7 — t() 키 전수 시드 1,890키·EN 크롬 잔존 0, check_i18n_en 33화면 PASS), F-key 라벨만 잔존, 로그인 부가 요소(로케일·테넌트·버전), MDI 파라미터 다중 인스턴스,
편집/조회 메뉴 드롭다운(v21 네비 개편으로 의도적 제거), ~~단축키 안내 다이얼로그~~ ✅ v25.0, 데스크톱 세부 패널·KPI 타일 다수.

## 의도적 패리티 델타 (v21.0 네비게이션 개편)
- 좌측 트리의 카테고리 그룹은 **상단 헤더 드롭다운으로 이동** (원본 PPT Head 메뉴 설계·사용자 요청) — 레거시 SPA 트리 구조와 다른 것은 의도된 변경.
- 좌측 패널 = 사용자 정의 목록(/prefs/leftnav, 기본=전체 권한 메뉴). ~~D10 Next 이식은 후속~~ → ✅ v25.0 이식 완료(타이틀바 모듈 필터+차단 모듈 리다이렉트, 라이브 왕복 검증).

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
