# EDIM 미구현 기능 목록 — 단계별 구현 계획

> 전수 감사 결과 (2026-07-09, 프론트 24화면 + 백엔드 48엔드포인트 + 54테이블 + 요구사항 문서 대조).
> 위에서 아래로 순서대로 구현한다. 완료 시 체크 + 진행현황 문서 갱신.
> 규칙: 배치마다 **백엔드 + 프론트 + 테스트 + 문서 + 배포 + 라이브 검증**까지 한 번에 끝낸다.

## 현황 요약

| 구분 | 수치 |
|------|------|
| DB 테이블 사용률 | 28/54 (52%) — 26개 미사용 |
| 화면 내 가짜 버튼 (statusMsg 만) | 약 35개 |
| 로컬 상태만 있고 미영속 | Work Process·UI Designer·Print Set-up·Duct 배치 |
| 메뉴 '— 예정' | 7개 (Material·Quality·Arrangement·Raw Material·Variant·Templet·통합검색) |
| i18n 미적용 화면 | 20개 (셸·로그인·C-1·CAD 만 적용) |
| 보안 공백 | 비밀번호 변경·자동 잠금·로그인 감사·토큰 갱신 없음 |

---

## A. 즉시 구현 가능 배치 (외부 의존 없음 — 순서대로)

### B1. 승인 워크플로 전면 실배선
지금 모든 "승인 요청" 버튼이 메시지만 출력한다. 공통 승인 API 로 전부 실동작화.
- [ ] `POST /approvals` 범용 승인 요청 (target_table/target_id/type/comment → sys_approval_request + 알림)
- [ ] `PUT /macros/{name}` — Macro Studio 저장 (tbx_macro DRAFT 버전 영속)
- [ ] 배선: Design Editor 승인 요청 · Macro Studio 저장+검증·승인 요청 · Print Set-up 승인 요청→게시 · UI Designer 게시 · Duct 승인
- [ ] 승인함에서 위 요청들이 실제로 보이고 승인/반려 → 요청자 알림까지 왕복 검증
- [ ] 테스트: live_approval_flow.py (요청→수신→결정→알림 4단계)

### B2. 편집 영속화 — "저장이 진짜 저장"
- [ ] `PUT /drawings/dimensions` — Design Editor 임시저장 F12 (dwg_dimension/variant_value 갱신)
- [ ] `PUT /erp/work-process` — Work Process MAKE/BUY 토글 F12 저장 (erp_work_process)
- [ ] `PUT /toolbox/forms/{name}` — UI Designer 위젯 레이아웃 저장 (tbx_ui_form JSONB)
- [ ] 새로고침 후 저장값 유지 라이브 검증

### B3. 단가 관리 쓰기 완성
- [ ] `POST /prices` — ＋ 단가 등록 (폼 다이얼로그 + cst_price insert, EXCLUDE 제약 위반 안내)
- [ ] 단가 Excel Import (기존 import-excel 패턴 재사용)
- [ ] "단가 Table 전체(4종)" 콤보 실필터 (프론트)
- [ ] 등록 행이 resolve 시뮬레이션에 즉시 반영되는지 검증

### B4. 문서 도메인 완성 + 인쇄 렌더 (P2-4)
- [ ] `POST /documents` — ＋ 문서 등록 (doc_control insert + 승인 요청)
- [ ] `GET /documents/{no}/render.pdf` — reportlab 재사용, **Grade 워터마크**(S등급 CONFIDENTIAL) 실렌더
- [ ] 문서함 미리보기 = 실 PDF (iframe/blob) · Print = 실 다운로드
- [ ] Print Set-up "Print Test" = 자리표시자 치환 실렌더
- [ ] Doc Templet Print = 계산값 포함 PDF

### B5. 통합 검색
- [ ] `GET /search?q=` — product_code·doc_control·dwg_file·화면 레지스트리 통합 (ILIKE + 화면코드 매칭)
- [ ] 툴바 ⌘K 검색창: 타이핑 → 드롭다운 결과 (화면=탭 열기 · 코드=코드 상세 · 문서=문서 상세 · 파일=CAD 뷰어)
- [ ] 공통 메뉴 '통합 검색 — 예정' → 실화면 (M-15-x)

### B6. 이벤트·알림 액션 완성
- [ ] `PATCH /erp/events/{id}` — 재배정 (assignee 변경 + 부서장 승인요청 + 이력)
- [ ] `POST /erp/events/{id}/escalate` — 에스컬레이션 (ADMIN 알림 + 이력)
- [ ] 알림 벨: 모두 읽음 버튼 · 알림 클릭 → 해당 화면 탭 이동
- [ ] 이벤트 상세 이력 = sys_history 실데이터 (mock history 대체)

### B7. PLM 도면 대장 — 미사용 핵심 도메인 개방
dwg_drawing·dwg_revision·dwg_approval·dwg_supersedure 테이블이 전부 잠자고 있다.
- [ ] `GET/POST /drawings` — 도면 대장 목록·등록 (dwg_drawing)
- [ ] `GET /drawings/{no}/revisions` + Rev 올리기 (dwg_revision, 현재 Rev.B → C)
- [ ] Supersedure 실데이터: 툴바/코드 상세 Supersedure 버튼 → Rev 대체 이력 화면
- [ ] 코드 상세 "도면 열기" = 해당 도면 CAD 뷰어 (dwg_file 연결)
- [ ] 코드 상세 승인 이력 = sys_approval_request 실조회 (CODE_APPROVAL_HIST mock 대체)

### B8. 보안 강화 배치
- [ ] `PUT /users/me/password` + 타이틀바 사용자 메뉴에 비밀번호 변경 다이얼로그
- [ ] 로그인 5회 실패 → 자동 LOCKED (sys_user), 실패 시도 sys_history 기록
- [ ] 토큰 슬라이딩 갱신: 만료 30분 전 API 응답 헤더로 재발급 (8시간 하드컷 제거)
- [ ] 감사 확장: 로그인 성공/실패·잠금해제·권한변경 전부 sys_history
- [ ] 테스트: live_security.py (변경→구비밀번호 거부·5회 실패 잠금·감사 행 확인)

### B9. i18n 전면 확장 (시드 v8)
- [ ] 20개 미적용 화면 전 라벨 키 추출 (~200키) — 그리드 헤더·그룹박스·버튼·상태 enum
- [ ] en/ja/zh 번역 생산 + sys_translation 시드 v8 + OFFLINE_BUNDLES 동기
- [ ] EN 전환 상태로 폴백 스위트 통과 (한글 잔존 0 검증 스크립트)

### B10. C-1 마감 + CommandLine 실명령
- [ ] 견적 미리보기 = Run 파이프라인 quotation PDF 즉석 렌더 (blob 미리보기)
- [ ] 사양 Excel ⬆ = 슬롯 선택 Excel 업로드 → 슬롯 자동 세팅 (openpyxl)
- [ ] CommandLine 실명령: ZOOM/FIT/MEASURE/SELECT <code>/RUN — CAD 캔버스 연동
- [ ] Design Editor Simulation 버튼 = Macro 전체 재평가 + CAD 재작도 시퀀스

### B11. Mobile 실동작
- [ ] 모바일 승인/반려 = approvalService.decide 실호출 (웹 승인함과 동일 데이터)
- [ ] 입고 처리 = erp 이벤트 complete 실호출
- [ ] 사진 첨부 = fileService.upload (RECEIVED 폴더)

### B12. Undo/Redo 실구현
- [ ] 편집 이력 스택 훅 (useEditHistory) — Design Editor 치수·Table12 셀·UI Designer 배치
- [ ] 툴바 ↶↷·편집 메뉴 = 활성 화면 스택 디스패치 (Ctrl+Z/Y)

### B13. '— 예정' 메뉴 화면 신설
- [ ] Arrangement Set-Up (arrangement_code·arrangement_component CRUD + 화면)
- [ ] Templet 관리 (tbx_templet CRUD + 화면)
- [ ] Variant·Constant 관리 (code_item_value 기반)
- [ ] Raw Material·GPI (mat_material CRUD + 화면)
- [ ] PLM Material·Quality (스펙 단순 — 자재 매핑·검사 항목 그리드)

### B14. 마스터 데이터 + RBAC 동적화
- [ ] com_company CRUD (공급처 관리 — 단가·발주 화면 연동)
- [ ] sys_role·sys_role_permission 개방: 사용자·권한 화면 매트릭스 → 실 역할 편집
- [ ] sys_hierarchy 관리 (Hierarchy 주소 체계)

### B15. 테스트·품질 마감
- [ ] 라이브 스위트 통합 러너 (tests/live_all.py) + CI nightly 잡 (서버 대상 스모크)
- [ ] auth 회귀 (만료·잠금·RBAC 403 매트릭스) / 파일 업로드 에러 케이스 / i18n 폴백
- [ ] 배치별 신규 기능 테스트는 각 배치에 포함 (여기서 잔여만)

---

## B. 외부 의존 — 입력되는 즉시 처리

| 항목 | 대기 대상 | 준비 상태 |
|------|----------|----------|
| AI 실연동 (P4-2) | `ANTHROPIC_API_KEY` 1줄 | 코드 완료 — env 설정만 |
| DWG 지원 (P4-3) | ODA File Converter 라이선스 | 플러그블 완료 — 경로 env 만 |
| Excel 양식 전면 (P4-1) | 고객 양식 확정 | import 패턴 보유 |
| 외부 ERP 어댑터 (I-001) | 대상 ERP 확정 | 인터페이스 정의서 준비됨 |
| Digital Twin (I-002) | DTDesigner 스펙 | — |
| 보안 솔루션 (DOC-004) | DRM/워터마크 범위 협의 | Grade 워터마크는 B4 에서 자체 구현 |
| DUCT 고도화 | 사업 범위 확정 | v1 화면 존재 |
| Mobile 실앱 (P5) | 스펙 협의 | 프리뷰 + B11 실배선까지 자체 진행 |

## C. 명시적 제외 (구현 안 함)

- Jenkins UI 파이프라인 — systemd auto-deploy + GitHub Actions CI 로 대체 완료
- 3D/STEP/IFC 뷰어 — 프로토타입(edim-ai-blueprint 스튜디오) 경로 유지, EDIM 범위 외
- WebSocket 알림 — 60초 폴링으로 충분 (고객 요구 시 전환)

---

*진행 방법: "do next" → 다음 미체크 배치를 통째로 구현·검증·배포·체크. 이 파일이 단일 진실 원천.*
