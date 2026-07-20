# EDIM 검증 스위트

## 실행 방법

```powershell
# 전제: Python 3.12+ · pip install playwright pypdf openpyxl · playwright install chromium
$env:PYTHONUTF8 = "1"

# ① 폴백 회귀 52체크 (mock 모드 — 프리뷰 서버 필요)
cd edim-web; npm run build; npm run preview   # 별도 창
py tests\e2e_fallback.py

# ② 라이브 전 스위트 통합 러너 (실서버 edim.seekerslab.com 대상)
py tests\live_all.py
```

## 스위트 목록

| 파일 | 대상 | 비고 |
|---|---|---|
| `e2e_fallback.py` | 전 화면 52체크 (mock 폴백 경로) | 프리뷰 필요 · CI 게이트 |
| `live_all.py` | **라이브 스위트 통합 러너** — 아래 전부 순차 실행 + 요약 | B15 |
| `live_b15_regression.py` | RBAC 403 매트릭스(GENERAL×쓰기 10종)·401·업로드 에러(.exe/폴더)·i18n 폴백 | 브라우저 불필요 (API) |
| `live_security.py` | 비밀번호 변경·5회 실패 자동잠금·토큰 슬라이딩 갱신·감사 (27체크) | B8 |
| `live_b1_approval_flow.py` | 승인 요청→승인함→결정→이력→알림 왕복 | B1 |
| `live_b2_persistence.py` | 치수 F12·MAKE/BUY·UI 레이아웃 영속 (새로고침 유지) | B2 |
| `live_b7_drawings.py` | 도면 대장·Rev 올리기·Supersedure·승인 이력 (17체크) | B7 |
| `live_b16_drawing_detail.py` | 도면 상세 탭·단계별 승인 왕복·블록/관계 시드·Simulation 실평가 (24체크, 자체 정리) | B16 |
| `live_b17_parts.py` | 부품 CRUD(409 보호)·BOM 왕복·공급자 코드·슬롯 정의 (19체크, 자체 정리) | B17 |
| `live_b18_cost.py` | Run 원가 3분류·PCR 산출식/upsert·견적 생성/렌더/삭제 (19체크, 자체 정리) | B18 |
| `live_b19_warehouse.py` | 창고 5계층(순서 강제)·QCR 감사/알림·PO 문서 영속 (21체크, 자체 정리) | B19 |
| `live_b20_macro.py` | Macro 4-Way 왕복·CODING 422·참조 추출/영향도·함수 검색 (17체크, atexit 원복) | B20 |
| `live_b21_system.py` | auth/me·다중 역할·Hierarchy 편집·문서 전이·초대/비활성·중복검토·Child 추가 (29체크, 자체 정리) | B21 |
| `live_f1_project.py` | 프로젝트 대장·PS 채번·삭제 보호(단계/참조)·접수자료 실업로드·타이틀바 컨텍스트 (자체 정리) | F1 |
| `live_f3_rbac_ui.py` | 권한 UI 게이팅 — GENERAL 메뉴 숨김/403 안내/버튼 disabled·SETUP 부분 허용·ADMIN 과차단 회귀 (정리: ssh psql) | F3 |
| `live_f4_noop.py` | 무반응 일소 — S-1-4 관계 승인 전이·S-1-1 F8/값추가·Table Export XLSX·PrintSetup 위젯/바인딩/PDF·코드상세/툴바 컨텍스트·문서함 F8 | F4 |
| `live_f5_updates.py` | 마스터 수정 전면 — 공급처/부품/재질/규칙/값/창고/단가 마감/문서 메타/Templet·Macro 삭제/구성품 (왕복 원복, 잔여는 psql) | F5 |
| `live_f6_search.py` | 통합 검색 확장 — 부품/공급처/창고/매크로/프로젝트 그룹·사용자 SETUP 게이트·딥링크 3종 (조회 전용) | F6 |
| `live_f7_diff.py` | 이력 diff 모달 — historyId/before/after 노출·변경 필드 하이라이트·무페이로드 정직 안내 | F7 |
| `live_f8_sort.py` | 그리드 정렬 — DenseGrid 헤더 asc/desc/해제·선택 무결성·JSX 열 제외·서버 sort 화이트리스트 (조회 전용) | F8 |
| `live_f9_escape.py` | 다이얼로그 Escape 표준 — 등록/QuickEdit/PO/프로젝트/요구사항 5종 닫힘·무다이얼로그 무해 | F9 |
| `live_f10_ux.py` | 탭 오버플로(▾ 목록·최소폭)·KPI 드릴다운 2종·승인함 유형/검색 필터 (조회 전용) | F10 |
| `live_f2_users.py` | 사용자 등록(USER_CREATE 감사)·실로그인·프로필 PATCH·삭제 보호(이력 409/본인 422)·UI 다이얼로그 (정리: API + **ssh psql** — 로그인 감사행 FK) | F2 |
| `live_cad.py` | CAD 뷰/Import/Export (DXF) | INT-04 |
| `live_s3_macro_engine.py` | Macro 엔진 실평가 | ENG-01 |
| `live_s4_rbac_notify.py` | RBAC·알림 흐름 | S4 |
| `live_s5_run_pipeline.py` | Run 파이프라인 산출물 바이트 검증 (PDF/DXF/XLSX) | S5 |
| `check_i18n_en.py` | EN 전환 한글 잔존 0 — 24화면+로그인 (`BASE` env 로 프리뷰/라이브 전환) | B9 |
| `live_dev_requirements.py` | 개발서버 요구사항 접수 — devMode 게이트·CRUD·이미지 첨부(422/연쇄삭제)·RBAC 403·UI 모달 왕복 (자체 정리) | 운영 도구 |
| `live_product_builder.py` | 제품 코드 조합 — 자유텍스트 422·미승인 값 422·승인 반영·파생 코드/해시·동일 조합 409·Rev drift·GENERAL 403 (자체 정리) | 2.2 (#28) |
| `live_bom_basis.py` | BOM 전개 근거 — 관계 Revision 고정·stable 판정·승인 후 이동 지목·Snapshot drift·순환/테넌트 가드 (자체 정리) | 2.7 (#40) |
| `live_file_role.py` | 원본/산출물 이원화 — 역할 백필·동명 저장 격리(산출물 행 불변)·산출물 편집 409·원본 재저장 갱신·목록 역할 노출 (자체 정리) | 3.3 (#53) |
| `live_tenant_isolation.py` | 교차 테넌트 실증 — 신규 테넌트 토큰으로 타 테넌트 자원에 접근. 쓰기 12종(2xx 금지) + **GET 경로 파라미터 자동 스윕 34종**, 판정은 차등(`남의 ID 응답 == 없는 ID 응답`) (자체 정리) | 2.9·3.1 보안 |

## CI

| 워크플로 | 트리거 | 내용 |
|---|---|---|
| `edim-ci.yml` | push (edim-ai-blueprint/**) | 빌드 + 폴백 52체크 |
| `edim-nightly.yml` | 매일 03:00 UTC (+수동) | 빌드 + 폴백 52체크 + EN 잔존 0 (프리뷰) |

라이브 스위트는 서버 접근이 필요해 CI 러너에서는 실행하지 않는다 — 배치 완료 시 및 필요 시 로컬에서 `live_all.py` 를 실행한다.

## 규칙 (실행 환경)

- **배포 직후 라이브 스위트 실행 금지** — 자동 배포(2분 타이머)가 커밋 감지 시 백엔드를 재시작하므로 503 연쇄 발생. push 후에는 `deploy done: <sha>` 확인 후 실행한다.
- live_all 은 실패 스위트를 **1회 재시도**한다 (13개 브라우저 스위트 순차 부하의 산발 타임아웃 흡수 — 재시도 통과는 `(retry)` 표기).

## 규칙

- 라이브 스위트는 만든 테스트 데이터를 **반드시 정리**한다 (스위트 내 원복 또는 psql).
- honest-write: mock 모드에서 쓰기는 실패해야 정상 — 폴백 스위트는 "백엔드 연결 필요" 표기를 기대값으로 삼는다.
- 새 기능(배치)은 라이브 스위트를 함께 커밋하고 `live_all.py` 의 `SUITES` 에 등록한다.
- **좌측 트리 내비는 `_nav.py` 의 `tree_click`/`tree_node` 만 사용한다** — 2.0 이후 좌측 기본 패널이
  업무 프로세스라, `.tn` 을 직접 찾으면 메뉴 라벨이 없어 타임아웃한다(2.3 에서 36종 일괄 복구).
- **셸 기본값·공용 레이아웃을 바꾸는 배치는 신규 기능 검증만으로 수용하지 않는다** — `live_all.py` 완주가 수용 기준.
- **새 SQL 은 테넌트 스코프 테이블을 만질 때 반드시 `tenant_id=%s` 를 건다.** 예외는 같은 함수에서
  이미 tenant 스코프 조회로 404 검증된 ID 를 쓰는 경우뿐이며, 그 경우에도 검증 조회를 먼저 두어야 한다
  (2.9 에서 실누출 3건 — 특히 `_tenant_id` 를 호출조차 하지 않던 Run 조회).
  회귀 방지는 `live_tenant_isolation.py` 가 담당한다.
- 시드 전제: edim/edim(ADMIN)·kim01/edim(GENERAL), KDCR 3-13 도메인 데이터 (시드 v1~v12).
