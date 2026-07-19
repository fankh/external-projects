# EDIM 원본 PPT 기능 대조 — 미구현 기능 감사

> 원본: `docs/reference/EDIM Tool System EP2.pptx` (78슬라이드, 2026-03).
> 방법: ① 전 슬라이드 텍스트·표·발표자 노트 전수 추출(2026-07-16) ② **전 슬라이드 이미지 렌더링 후 시각 검증**(2026-07-18, LibreOffice→PDF→PNG 78장 — UI 목업의 시각 요소는 텍스트 추출로 누락되므로) → 구현 코드(edim-web-next·backend)·기존 감사 문서(미구현기능목록 B1~G5·Next 패리티감사) 대조.
> 목적: **원본 기획서가 요구하나 아직 구현되지 않았거나 부분 구현인 기능**의 전수 목록. 기존 백로그가 "구현물 기준 감사"였다면 본 문서는 "기획서 기준 감사".

## 요약 (2026-07-18 구현 트랙 완료 스냅샷 — v20.0~v24.4)

| 구분 | 항목 | 상태 |
|---|---|---|
| ✅ **완결** | U11 셸 소품(테마·로고·리사이즈·접기) · U14 Schedule 패널(To-do 그리드·Done·미니 달력) | 라이브 E2E 완료 |
| ✅ **핵심 구현** | U3 Work Process 공정 파라미터 · U4 MRP+스케줄링/Capacity · U5 창고 심화(유통기한·점검·대체자재) · U6 Print Set-up(옵션·Office) · U8 Duct(층·기술계산표·BOM) · U9 QR+대화 · U13 우측 공용 패널 | 각 절 체크리스트 잔여 소항목만 |
| 🔶 **1단계** | U1 Selection 캔버스(드래그 배치·세부선정·회전·분할통합 ✅ / 6면=도면 자료 대기) · **U2 파라메트릭 전 항목 완결 ✅ (v28.6)** | CAD 편집 심화 트랙 |
| 🔶 **U15 소형** | 4/7 완료(Fan Direction·성능 곡선·BOM 가격·세부선정 폼) — 잔여: Approval 툴바 표준화·3D/STEP·인쇄 다이얼로그 | |
| ⏸ **외부 의존** | U7 Toolbox AI·U10 AI 도면 학습·U28 내부 질의응답 | **키 설치 완료(2026-07-19, backend/.env 600·컨테이너 반영) — API 크레딧 잔액 부족(400 credit balance too low)으로 대기. 충전 시 즉시 라이브** |
| ⏸ **협의 대상** | U12 Digital Twin/AR/MES 연계 · U8 건축도 판독 · U9 AR | 본사업 범위 협의 |

> 회귀 게이트: 라이브 스모크 **75/75** (2026-07-19, edimsol.com — U8/U29 SSR 마커·U27/U30 API 계약 검사 포함 전체 그린).

---

## U1. CPQ Selection 캔버스 인터랙션 (슬라이드 5·7·60·61) — 🔶 2단계 구현 (v23.6~24.6)

기획: 이미지(모듈)를 **드래그하여 임의 배치 → 이동·삭제·분할·통합**, 치수 DB 연동 표시, 기준 치수 입력 시 하부 자료 반영, **화면-도면 비율 자동 조절**, **3각법 6면 보기**, 모듈 **더블클릭 → 제품 속성(기술·물성·치수) 세부선정 UI 창**, CAD식 명령 툴바(복사/이동/반전/연장/삭제/회전).

현재: C-1 캔버스는 블록 표시 + Add Item/Delete + BOM 하이라이트 + CommandLine(ZOOM/FIT/MEASURE/SELECT/RUN)까지. 드래그 재배치·분할통합·6면 전환·더블클릭 세부선정 창 없음 (9차 감사 G1 "뷰어는 충실하나 편집 부재"와 일치).

- [x] 모듈 드래그 배치·이동 (좌표 영속) ✅ v23.6 — Cvs onMoveBlock 배선(스케일 보정 기구현)·localStorage 영속. 라이브: (310,334)→(370,374)→리로드 유지
- [x] 더블클릭 → 모듈 세부선정 다이얼로그 ✅ v23.6~23.7 — 슬라이드 7 설계 옵션 9종 콤보(Material/Class/Spark/Airflow/Casing/Motor/Supplier/Pole/전압), 저장 시 블록 라벨 요약 반영·영속. +Cvs 캡처 리타겟 버그 수정(드래그+더블클릭 공존)
- [x] 반전·회전 명령 ✅ v24.6 — 선택 블록 90° 회전(RO)·좌우 반전(MI, 라벨 가독 역변환)·스냅 10px 그리드 토글, 툴바 버튼 + **CommandLine 실명령**(ROTATE [deg]/MIRROR/SNAP ON|OFF/RESET), geom 영속(rot·flip). 라이브 E2E 7/7
- [ ] 3각법 6면 뷰 전환 — 뷰별 도면 데이터 필요 (도면 DB 6면 자료 등재 시)
- [x] 분할/통합 ✅ v28.0 — 분할 ⫽(선택 모듈 좌/우 하프 ①·②, 재실행 해제)·통합 ⊞(기준+대상 클릭 → 외접 병합)·SPLIT/MERGE 명령·RESET 일괄 복원, edim-c1-layout 영속. 라이브 E2E 6/6(+1 분할·reload 유지·병합·복원)

## U2. PLM 파라메트릭 설계 편집기 심화 (슬라이드 40~42·63·67) — ✅ 전 항목 구현 (v24.3~v28.6)

기획(슬라이드 63이 명세서 수준): 파트 선택 2단계(블록→끝점/중앙/모서리/중심 스냅), 사용자 원점·블록별 원점 좌표계, 드래그/좌표 이동·복사·대칭·회전·선형식, **Block 단위 저장(승인 후 상위 호출 시 Block)**, **치수선-부품 동기화(치수 변경 = Parametric Design 반영)**, 설계 우선순위·자료 우선순위 **순환 참조 자동 점검**, 관계값 계산식(`=A2.Table23_3*Var32_2`), Verification 경고, Simulation, 우측 판넬(코드 호출·하부 Item·파트관계·도면 Frame).

현재: Design Editor에 치수 Macro 평가·Simulation 재작도·조립순서·부품관계 패널·dwg_block 실데이터·Undo/Redo까지. 스냅 선택·좌표계·대칭/회전 편집·치수선 동기 파라메트릭 재작도(전체)·순환참조 점검은 없음.

- [x] 파트 스냅 선택 + 좌표계·대칭/회전 편집 ✅ v28.2 확인·보강 — 스냅(끝점·중심·⊥)·이동/복사/회전/반전/트림/연장 툴은 G1~G2 트랙에서 기구현(CAD_TOOLS 10종), v28.2 신규: ⌖ UCS 사용자 원점(클릭 지정·스냅, 크로스헤어 마커, 좌표 판독 상대 표시, 재클릭/Esc 해제 — s63 노트). 라이브 E2E 7/7
- [x] 파라메트릭 전면 동기 ✅ v28.6 — 치수 변경 시 디바운스(0.7s) 자동 재작도(치수선 포함 정본 재생성), 편집 대상 존재 시 저장본 동시 갱신(치수=마스터), SYNC 토글(기본 ON). 라이브 E2E 6/6(기하 해시: 변경 시 변화·OFF 시 불변·원값 복원 시 원 해시 일치)
- [x] 설계/자료 우선순위 순환 참조 자동 점검·경고 ✅ v24.3 — Design Editor 패널: MACRO 치수 참조 그래프 위상 정렬(평가 순서 표시)+순환 시 적색 경고(슬라이드 67 '잘못된 자료 추출' 방지). 라이브: 3 MACRO A→C→E→B→K→D·참조 B←A/D←B/K←A
- [x] Block 단위 저장·상위 호출 ✅ v28.4 — API 3종(등록: 선택 엔티티→명명 Block·원위치 INSERT 대체 / 목록 / 좌표 지정 호출), DXF INSERT 전개 렌더(b-id 네임스페이스 — 물리 e-id 편집 정합 보존), Design Editor Block 패널(선택 통지 REG(n)·목록·X/Y 호출). 라이브: API 8검사(중복 409·이름 422·미존재 404 포함)+UI 5검사, part_edit.dxf 재생성 정리

## U3. Work Process 공정 파라미터 (슬라이드 44~45) — 🔶 부분 (P2 잔여와 일치)

기획: 공정 DB — **작업장·기계 종류·작업 인원·필요 스킬 등급·작업 시간**(Person/Skill/W.Time/Work place), 자재 흐름(Item별 warehouse·Min Stock·공급자·제조/구매·Time), **설계우선순위 테이블**(Dim.별 설계우선순위·상위설계 우선자료·설계 기준점·설계 오류 체크).

- [x] 공정 파라미터 CRUD (작업장·인원·스킬·W.Time) ✅ v21.4 — 인라인 편집+F12 저장, erp_work_process 기존 컬럼 활용(스키마 무변경). 라이브 E2E: WS-UT/3/H2 저장→리로드 영속
- [x] Item별 자재 흐름 정의 (warehouse·min stock·공급처·비고) ✅ v21.4 — 동일 그리드에서 편집·영속
- [x] 설계우선순위 테이블 ✅ v25.3 (U17 로 구현 — Work Process 화면 편집 그리드)

## U4. 생산계획 MRP (슬라이드 46) — ✅ 핵심 구현 (v22.0~24.1)

기획: **MRP(자재 소요량·시기 산출)**, 주문량+가용 자원 기반 **생산 Scheduling**, **생산능력(Capacity) 분석**, 공정별 데이터 실시간 수집.

현재: 백엔드에 MRP·capacity·scheduling 코드 없음(grep 0). BOM·재고·작업지시·마일스톤이 개별 존재하므로 연결 재료는 갖춰짐.

- [x] BOM×수주 → 자재 소요량/시기 산출 ✅ v22.0~22.1 — GET /erp/mrp(ORDERED 견적 자재 라인 × inv_stock, 부족·발주 권장일=납기-리드타임) + M-8-5 화면(리드타임 조정·발주 딥링크). 수주 0건 시 정직 빈 상태
- [x] 작업지시-일정-작업장 부하 스케줄링 뷰 ✅ v24.1 — GET /erp/production/schedule(미완료 WO × Work Process MAKE 공수) + D-3 우측 패널(WO별 공수·경과일). 라이브 왕복: 발행→공수 135분 집계→완료 정리
- [x] Capacity 분석 ✅ v24.1 — 작업장별 부하율(인원×480분/일 근사 명시)·소요일·부하 바(70%황/100%적). 상세 캘린더는 후속
- ※ v24.1 잠복 버그 수정: D-3 페이지가 /erp/work-process 를 조회해 WO 그리드가 비어 있던 문제 → /erp/work-orders 정정

## U5. 창고·자재 관리 심화 (슬라이드 46) — ✅ 핵심 구현 (v22.5)

기획: 자재 물성 분류(액체-독극물 등급·가스-폭발성·고체-판/파이프/개), 보관 품질 유지(**정기 점검·유통기한**), 재고 단가 4종(✅ 기구현), 불량품/폐품 처리(✅ NCF), 대체 자재 연구, 자재 표준화.

현재: 창고 5계층+위험물 허용 칩+검사주기(B19)·재고 4단가·부적합 이벤트 기구현. **유통기한 관리·정기점검 이력·대체 자재**는 없음.

- [x] 자재 유통기한(lot 만료) + 만료 임박 경고 ✅ v22.5 — inv_movement.expiry_date(입고 시 입력·PATCH 설정), lots에 EXPIRED/EXPIRING(30일)/OK 상태, 재고 화면 Lot 유통기한 패널. 라이브: 입고→EXPIRING→PATCH→EXPIRED 왕복
- [x] 창고 정기점검 실적 ✅ v22.5 — erp_wh_inspection(OK/ISSUE·감사), 창고 화면 위치 선택 패널. 라이브 등록·조회
- [x] 대체 자재 연결 ✅ v22.5 — prt_part_substitute(자기자신 422·중복 409), 부품 대장 패널(연결/해제). 라이브 왕복 (alembic 0023)

## U6. Print Set-up 완성 (슬라이드 50) — ✅ 핵심 구현 (v21.6)

기획: 기본 양식 배치·Data 호출·**그래프 불러오기·Data 위치 설정**·워터마크(✅)·**Font/크기·용지 크기·색상(칼라/흑백)·머리글 바닥글 편집·여백**·Printer/PDF(✅)·**File 내보내기(Office)**.

- [x] 용지(A4/A3/LETTER)/방향/여백(mm)/글꼴(pt)/색상(칼라·흑백)/바닥글 → 렌더 반영 ✅ v21.6 (build_lines_pdf 옵션·라이브: A3 가로 MediaBox 검증)
- [x] Office(xlsx) 내보내기 ✅ v21.6 (POST /render/xlsx + UI 버튼 — 라이브 클릭 다운로드 edim-print.xlsx)
- [ ] 양식 내 Data 위치(자리표시자) 편집기·그래프 배치 — U13 우측 패널·그래프 마법사(U7)와 통합 추진

## U7. EDIM Toolbox 심화 (슬라이드 27·29·59) — 🔶 부분

기획: 함수 마법사(✅ B20)·**그래프 마법사**·5-모드(Prompt–Macro–Flowchart–Description–Coding) **상호 자동 변환**(현재 4-way 영속만, 변환 없음)·**Coding 런타임 실행**(현재 정직 게이트)·**인터넷 검색 Tool**·**AI 질의응답(사내 자료 검색·응답)**·**UI 개발 AI(설명→UI 자동 제안)**.

- [ ] 그래프 마법사 (Table → 차트 생성·문서 삽입)
- [ ] 모드 간 자동 변환 (Prompt→Macro→Flowchart→Coding — AI 의존, C9 연계)
- [ ] AI Q&A 패널 (ai/chat — C9 백로그와 동일)
- [ ] UI 개발 AI (ui-suggest — C9)
- [ ] 인터넷 검색 도구 (외부 의존·정책 협의)

## U8. 건축 설비 Duct 설계 심화 (슬라이드 68) — ✅ 핵심 구현 (v23.1~23.2)

기획: 건축도면 학습(램프·빔·소방구역·실 판독), **층별/대공간 복수 연결(XYZ Point)**, 실 용도별 설계 기준 DB(풍속·환기횟수), **자동배치 = 유체 흐름 고려 최단 경로**, Diffuser 자동배치+**수동 조정(Drag/Click)**, 블록화 설계(최대 size/길이 분할·합체), **기술자료(압력손실·Leak율·온도변화·결로·하중·풍량 비교)**, EDIM 연결(BOM·최소 스크랩 제조·구매·견적).

현재: Duct 화면 자동 배치 1차 + honest-write. 층 선택·수동 조정 도구·기술계산표·건축도 판독 없음.

- [x] 층 선택 ✅ v23.1 — 1F/2F/3F/RF 콤보(백엔드 floor 파라미터 기활용)·URL 재생성. 복수 층 연결(XYZ Point)은 후속
- [x] 기술계산표 ✅ v23.1 — 압력손실(f=0.019·Dh)·Leak율(SMACNA Class C 근사)·결로(Magnus 노점 vs 급기온)·하중(아연도 0.8T 자중·행거당)·풍량 비교(디퓨저 합 vs 장비), 입력 즉시 재계산 + 계산서 PDF. 라이브: 결로 위험 판정·PDF 새 창
- [x] Duct BOM → 구매 연결 ✅ v23.1 — 직관(도면 라인 길이 합산)·디퓨저·플렉시블·행거(2m 간격)·보온재(결로 위험 시 필수 표기) 산출 + PR 화면 딥링크
- [x] 수동 조정 도구 ✅ v29.4 — ✎ 수동 조정: 자동 배치를 dwg_file 실체화(POST /cad/duct-layout/save, 같은 이름 덮어쓰기=자동 배치 복원 가능) 후 U2 편집 트랙 재사용(드래그 이동·Delete 삭제·✂ 트림=분할/합체). 라이브 E2E 6/6(이동 영속·모드 진입·원본 재생성 정리)
- [ ] 건축도 판독(AI 학습 의존 — U10)

## U9. 모바일·현장 업무 (슬라이드 77) — ✅ 핵심 구현 (v22.7)

기획: 컴퓨터 접근 불가 지역을 **QR 코드**로 업무 접근(도면·서류·Project History·정보·처리할 업무), 업무 승인(✅ B11), 자재 입출고(✅), 검수(자재·완성품·설치), 유지보수, **업무 소통(Project 중심 대화 + History 관리)**, 공지(알림), 증강현실(AR).

- [x] QR 코드 진입 ✅ v22.7 — QrBadge(qrcode 캔버스, 화면 딥링크 URL+스캔 안내), 프로젝트 대장·모바일 화면 장착. 라이브: 캔버스 픽셀 렌더 검증
- [x] Project 중심 대화 ✅ v22.7 — sys_project_comment(alembic 0024)+GET/POST/DELETE(본인/ADMIN 삭제 가드), 프로젝트 대장 업무 소통 패널(Enter 등록·✕ 삭제). 라이브 왕복 9/9
- [ ] 설치·유지보수 검수 기록 (현장 체크리스트) — 후속
- [ ] AR — 명시적 제외 후보 (하드웨어·범위 외)

## U10. AI 학습 트랙 (슬라이드 25~26·13) — ❌ 미구현 (외부 의존)

기획: 사내 도면 CAD 학습 — DXF/STEP 엔티티 파싱·타이틀블록/속성/BOM 추출(난이도 하), 치수/기호 객체 이해(중), 3D Feature 인식·유사형상 검색(상), 스캔 도면 OCR, **PDF→DXF·2D→3D 변환**, 기술자료 자동 생성, 일반 서류 챗봇(RAG), AI 학습 DB 구축.

현재: ANTHROPIC_API_KEY 미설정 — C9(AI 활성화)·B(외부 의존) 백로그와 동일 트랙. 도면 DB 스키마(슬라이드 26의 9테이블)는 전부 구현 완료.

- [ ] C9 선행(키 입력) 후: 도면 메타데이터 추출(1단계) → 치수 객체(2단계) → 유사형상(3단계) 순차
- [ ] PDF→DXF·2D→3D 는 전용 엔진 필요 — 협의 대상

## U11. 셸 공통 소품 (슬라이드 57) — ✅ 완결 (v23.4)

- [x] Head **회사 로고 배치** ✅ v23.4 — sys_tenant.settings JSONB(스키마 무변경)·ADMIN 설정 다이얼로그(48KB 가드)·타이틀바 렌더. 라이브: 업로드→렌더→제거 왕복
- [x] **색상 테마** ✅ v23.4 — 4종(기본 Navy/Graphite/Forest/Burgundy) body[data-theme] CSS 토큰, 파일 메뉴 선택·localStorage 영속. 라이브: 적용→리로드 유지→복원
- [x] 판넬 **크기 조정** ✅ v21.4 — 트리 폭 드래그 리사이즈(140~420px, localStorage 영속)
- [x] 판넬 **접기/펼치기** ✅ v22.1 — 좌측 트리(« ↔ » 레일)·우측 Sub Work Place(도구 레일) 각각 localStorage 영속. 라이브 E2E 6/6(접기→리로드 영속→펼침 왕복)

## U12. Digital Twin·외부 연계 (슬라이드 12·14·77) — ❌ 범위 외 후보

설계 치수 Table API → 2D/3D 도면 생성(외부 CAD), Smart Factory(Digital Twin)·AR/XR, 3rd party 제조업체 실시간 Code 연결, MES 연계. → 플랫폼 외부 통합 트랙. **명시적 제외 목록(§C) 편입 또는 본사업 협의 항목** 권고.

---

## U13. 화면 공통 우측 도구 패널 체계 — Sub Work Place Templet (슬라이드 4·7·8·38·45·66 시각 확인) — ✅ 핵심 구현 (v21.8)

기획: 거의 **모든 화면 우측에 공통 모듈 3~4종을 상시 배치**하는 템플릿 체계(E-4) —
① **Data Up-Load** (부서·유형(Table/Data/File/Image)·이름·설명 + 업로드/찾기/Hierarchy 아이콘)
② **Table** (Table List 콤보 + Add/Edit/**Excel Import** + **중복검토** 링크 + 미리보기 그리드)
③ **Coding** (Coding List 콤보 + Item·매크로 수식 표시 + **즉석 Run**)
④ 화면 문맥 패널 (Specification 사양표·BOM 트리·Sub Item list·Document Code 등).

현재: 화면별 개별 구성만 있고 "우측 공통 모듈 템플릿" 체계 없음. 기능 단위(업로드·Table 편집·Macro Run)는 각자 화면에 존재하므로 **재사용 컴포넌트 3종 + 화면별 장착**으로 구현 가능.

- [x] `DataUploadPanel`(부서·유형·이름·파일→/files/upload DATA)·`TablePanel`(콤보+미리보기+편집/XLSX 딥링크)·`CodingPanel`(Macro 콤보+즉석 Run) 공통 컴포넌트화 ✅ v21.8 (components/panels, GET /tables 신설)
- [x] Set-up 3화면 장착 — Sub Code(S-1-1)·제품 코드 마스터(M-3-8)·Document Templet(C-3) ✅ v21.8. 라이브 E2E: 3화면 렌더·미리보기 4행·Run·업로드(정리 완료)
- [ ] 잔여 화면(S-1-3~6·S-4-1-x 등) 확산 — 수요 확인 후 점진

## U14. 좌하단 Schedule management 상시 패널 (전 화면 공통, 시각 확인) — ✅ 완결 (v23.9)

기획: 전 화면 좌측 트리 하단에 **그리드형 개인 업무 패널** — To-do list(Item·Doc No.·Task·Remarks·Person·Status·Next 컬럼 그리드), Done items(동일 그리드), Schedule(달력), Approval Request List.

- [x] To-do 미니 그리드 — 승인 inbox 상위 3건(유형·대상, 클릭→승인함) + PL 지연 ✅ v21.2 (shellCounts inboxTop)
- [x] Schedule — 지연/임박 마일스톤 상위 3건(OVERDUE 적색, 클릭→마일스톤) ✅ v21.2 (shellCounts upcoming)
- [x] Done items(최근 승인 결과 3)·미니 달력(이번 달 마일스톤 납기 마킹·오늘 하이라이트·클릭=마일스톤) ✅ v23.9. 라이브 E2E 6/6

## U15. 시각 검증 추가 발견 (소형·세부)

- [ ] **Approval 툴바 모듈** — 공통 아이콘 세트 표준화. ※ 화면별 실액션 버튼과 중복되고 F-key 미수신 화면에선 무동작 버튼이 되어 no-noop 원칙과 상충 — 적용 범위 **협의 필요**(디자인 결정 대상)
- [x] **Fan Direction 8방향 선택기** + **Installation Code** ✅ v22.9 — Arrangement 등록 모달(L0~R270 토글 버튼 + Direct Driven/Belt In-Line/Belt Along 콤보, 기존 direction_option/install_option 컬럼 — 스키마 무변경). 라이브 E2E
- [ ] **3D 지원** — 화면 곳곳의 3D/2D 토글 + H-1 "Drawing Control: **DXF & STEP**" — 현재 DXF 2D만, STEP/3D 뷰 없음 (18·38)
- [x] **모듈 더블클릭 세부선정 폼** ✅ v23.6 — C-1 캔버스 더블클릭 모달(옵션 9종 콤보) — U1 과 통합 구현
- [x] **성능 곡선 SVG** ✅ v22.9 — C-2 우측 패널(모델별 Pt 실선·효율 점선, 점 클릭=선정·적색 하이라이트). 라이브 E2E
- [x] **BOM 트리 가격 병기** — 기구현 확인 ✅ (C-1 SelectionView 단가(K) 컬럼, expand priceK — 감사 시점 오판 정정)
- [x] **인쇄 다이얼로그** ✅ v24.8 — Print Set-up 🖨 인쇄: 렌더 PDF(출력 옵션 반영)를 숨김 iframe 적재 후 브라우저/OS 인쇄 다이얼로그 직접 호출(실패 시 새 창 폴백). 라이브: 프레임 blob 적재 검증

---

## 3차 조사 신규 태스크 (2026-07-18, 미열람 슬라이드 시각 검증 — U16~U20)

> 78장 중 이전 패스에서 열람하지 않았던 슬라이드(27·36·44·64·70·74 등)를 추가 시각 검증해 발굴한 신규 태스크.

### U16. UI Designer 위젯 액션·데이터 바인딩 (슬라이드 27) — ✅ 핵심 구현 (v26.2)
Qt Designer 급 상세: **Commend button set-up macro**(동작 콤보: 저장/삭제/복사/등록/찾기 + 대상 + Data 지정), **Combo box set-up macro**(Data set-up·Active set-up — Table 열 바인딩), **실행 설정 다이얼로그**(클릭 시: 하이퍼링크/프로그램/매크로/개체 실행). 현재 UI Designer 는 팔레트 배치·레이아웃 저장까지.
- [x] 액션 설정 다이얼로그 ✅ v26.2 — 위젯 더블클릭/⚙ Set-up: 동작 매크로 8종(저장/삭제/복사/등록/찾기/하이퍼링크/프로그램 실행/매크로)+대상+Data, layout_def(action) 영속(백엔드 스키마 무변경 — list[dict] 통과). Property Editor action/data bind 행
- [x] Combo Data 바인딩 ✅ v26.2 — GET /toolbox/bind-options 화이트리스트(prt_part·cst_quotation 열) distinct 값, 다이얼로그 테이블·열 선택+조회 미리보기. 라이브: prt_part.part_no 4건·비화이트리스트 422 차단
- [x] 미리보기 바인딩 동작 ✅ v26.2 — 미리보기 모달: 바인딩 Combo 실데이터 옵션 렌더(4건)·버튼 클릭 시 설정 동작 표시. 라이브 E2E 8/8(설정→속성 반영→미리보기→저장 layout_def 영속 검증→원 레이아웃 원복)
- [ ] 실행 설정 고급(하이퍼링크 실이동·프로그램/개체 실행 새시) — 게시 Form 런타임(TBX-003 동적 렌더) 연계 후속

### U17. Work Process 설계우선순위 테이블 (슬라이드 44) — ✅ 핵심 구현 (v25.3)
- [x] Dim.별 설계 파라미터 표 ✅ v25.3 — dwg_dimension 기존 미사용 컬럼(design/data_priority·base_point) 개방 + error_check 추가(alembic 0025), GET/PUT design-params, Work Process 화면 편집 그리드(우선순위·상위자료·기준점·오류체크 '④ > 300'·비고). 라이브 왕복 6/6(저장→영속→원복)
- [ ] 오류조건 위반 시 Design Editor/Run 경고 연동 — U2 순환 점검과 통합 후속

### U18. Hierarchy 트리 편집 심화 (슬라이드 64) — ✅ 핵심 구현 (v25.5~25.6)
- [x] 컨텍스트 메뉴 + 노드 이동 ✅ — 우클릭(잘라내기→붙여넣기·속성·삭제), POST /hierarchy/nodes/{id}/move: 하위 주소 접두 연쇄 재계산·순환/시스템/타트리 가드 422. 라이브: 902→901.1 이동·순환 422
- [x] 노드 속성/정보 다이얼로그 ✅ — GET info(주소·심볼·상태·하위수·작성/수정 메타)
- [x] 트리 내 검색 ✅ — 이름/주소 필터 (라이브 9→1건)
- ※ v25.6 수정: info SQL 리터럴 % psycopg 이스케이프 (배포 후 발견·즉시 수정)
- [ ] 노드 복사(구조 복제)·심볼 편집 UI — 후속

### U19. PCR 세부 비용 체계 + CLT 견적서 양식 (슬라이드 74) — ✅ 핵심 구현 (v25.8)
현재 PCR = 기여마진·EBIT(SGA 8%) 단일. 원본: **비용 트리 × 사업유형 다열**(Own acc./Biz.Type1~n) — Procurement(Ex-Work·운임·관세·내륙운송·조달간접·회피이자)/Sub-manufacturing(현장설치·장비임차·외주조립·현장관리·A/S시운전)/Other direct(납품·리스크 충당)/Direct total·기여마진/판관(영업·관리·대손·R&D·출장·접대·유지·국가·고객·지불조건)/Full costs·EBIT. + **CLT 견적서 공식 양식**(장비별 수량·단가·합계 표, 공사명·견적번호·납품/지불조건·보증기간).
- [x] PCR 비용 트리 ✅ v25.8 — GET /cost/pcr/{id}/breakdown: Run 원가 라인 3분류(Procurement/Sub-manufacturing/Other direct) + 판관 분해(율 근사, 합계=SGA — 근거 명시)·Full costs·EBIT. Report Center 행 클릭 트리 패널. 라이브 정합 4/4(판관합=SGA·Full=직접+판관·EBIT)
- [x] CLT 견적서 양식 ✅ v25.8 — build_clt_quotation_pdf(헤더 메타 4행·품목표·합계·조건·Remarks), 기존 render.pdf 라우트 교체. 라이브 왕복: QT-72-001 생성→CLT 마커/조건/품목표 pypdf 검증→삭제
- [ ] 사업유형 다열 비교(Own acc./Biz.Type n 열) — PCR 다건 축적 후 비교 표 후속 · 상세 판관율은 PCR 기준 관리(M-14-5) 연계 후속

### U20. Relationship·BOM 소품 (슬라이드 36·70) — ✅ 핵심 구현 (v26.0)
- [x] Data 링크 아이콘 ✅ v26.0 — Child Group 그리드 Data 컬럼 → 코드 상세(/detail/code?code=) 딥링크(Tech·Variant·도면 탭 일원화). 라이브: 5행 렌더·KAD 900 FW 이동 확인
- [x] 도면 미리보기 ✅ v26.0 — 구성도 박스 블록/CAD 토글, /cad/arrangement 정본 SVG 미리보기(C-1 패턴 재사용). 라이브 SVG 렌더 확인
- [x] EBOM Run 분리 + Export ✅ v26.0 — Part List Running Test 버튼을 "EBOM Run ▶" 표기(BOM 전개 전용, 슬라이드 70)·전개 결과 ⬇ CSV Export. 라이브: Run→Export 활성→ebom-KDCR 3-13.csv 다운로드
- [ ] child 개별 DXF 썸네일 — 부품 단위 CAD 정본 엔드포인트 부재(현행 /cad/arrangement 전체 구성도만) · 부품 도면 정본화 후속

## 4차 조사 신규 태스크 (2026-07-19, 미열람 슬라이드 시각 검증 — U21~U23)

> 추가 열람: 11·13·15·17·20·22·24·26·30·33·41·47·49·53·55·57·61·72·76·78. 대부분 기구현 확인
> (도면 개정/첨부 dwg_revision·dwg_file API ✓, CAD 측정 📏 ✓, 매크로 함수 도움말 /macros/functions ✓,
> 밀도 계산·성능 곡선 U15/E1 ✓, PR 재고 Check D2 ✓, SaaS 배치도 s20 = 인프라 설명). 잔여 갭 3건 등록.

### U21. Head 메뉴 사용자 편집 (슬라이드 57-②) — ✅ 구현 (v26.5)
"Head Item 편집: 추가 편집 삭제 기능 (기업 사용자는 ERP 하부의 Item 만 가능)". 현재 헤더 드롭다운은 고정(navDropdowns), 좌측 패널만 사용자 정의(/prefs/leftnav).
- [x] 헤더 드롭다운 사용자 편집 ✅ v26.5 — /prefs/headnav(모듈별 leaf id 순서, 백엔드 무변경), 커스텀 존재 시 드롭다운 재구성(그룹 최초 등장 순), SETUP 권한 필터. 라이브: 20→3 항목 편집 시 드롭다운 5→1 축소·pref 영속·reload 유지·항목 클릭 /erp/projects 이동
- [x] 편집 모달 + 기본값 복원 ✅ v26.5 — 메뉴바 ✎ 버튼 → LeftNavEdit 모달 재사용(title prop), 기본값 복원으로 5개 드롭다운 원복 확인. 테스트 pref 정리 완료

### U22. Hierarchy 저장 전 정합 점검 (슬라이드 57-⑧) — ✅ 구현 (v26.7~8)
"Tree 편집 작업 점검: DB 의 상호 관계 이상 유무 확인 후 저장". U18 이동 가드(자기/하위·시스템·교차 422)는 있으나 트리 전체 정합 리포트 없음.
- [x] GET /hierarchy/validate ✅ v26.7~8 — 주소 중복(DUP_ADDRESS)·고아 노드(ORPHAN)·부모 주소 불일치(ADDR_MISMATCH)·루트 형식(ROOT_FORMAT) 4종, 구분자 혼용(. /) 세그먼트 기준(실데이터 /C/ENG 오탐 v26.8 수정)
- [x] 패널 점검 버튼 ✅ v26.7 — 이상 목록 배너(유형·주소·상세)/정상 배너. 라이브 E2E 7/7: 기존 6노드 정합 ✓ → /C/909 다중 세그먼트 루트 주입 → ROOT_FORMAT 탐지·배너 표시 → 삭제 정리 → 정합 복원

### U23. 문서 채번 규칙 (슬라이드 53 Document Code) — ✅ 구현 (v27.0)
"Document Code: EU-3-2020-450-6-21-4-SR-7" — 세그먼트(부문-유형-연도-프로젝트-차수 등) 조합 자동 채번. 현재 문서번호는 수동 입력.
- [x] 채번 규칙 + 발급 ✅ v27.0 — sys_tenant.settings.docNumbering(템플릿 {DEPT}/{TYPE}/{YYYY}/{YY}/{SEQ:n}+부문), 기존 allocate-code 를 규칙 기반으로 확장(유형별 순번·중복 회피), GET/PUT /documents/numbering-rule(미지원 토큰 422). 라이브: EU-UTN-26-001 발급→등록→재채번 -002 중복 회피→원복
- [x] 등록 폼 자동 채번 ✅ v27.0 — 문서 등록 모달 '자동 채번' 버튼(유형 반영)·툴바 채번 규칙 편집 행(템플릿+부문, 저장 시 예시 표시). 라이브 E2E 10/10, 산출물 등록(detail/output) 채번도 동일 규칙 자동 적용

## 5차 조사 신규 태스크 (2026-07-19, 미열람 슬라이드 시각 검증 — U24~U25)

> 추가 열람: 31·34·37·39·42·46·51·58·59·62·65·66·73·75. 기구현 확인(S-1-2/S-1-5 등록 화면=Sub/Arrangement+패널,
> s42 Call Sub Drawing=Design Editor Sub Item, s58 승인/권한/보안=승인함·D10·워터마크, s65 Key Work Place=F1+To-Do,
> s73 Run 산출물 폴더 등재=register-output G3-a, s75 단가 4-Table=prices 4종, s59 ERP Toolbar 사용자 편집=U21). 잔여 갭 2건.

### U24. 매크로 함수 마법사 UI (슬라이드 59·24 Toolbox Macro) — ✅ 핵심 구현 (v27.2)
백엔드 함수 카탈로그(GET /macros/functions — 명칭·시그니처·설명·자연어 키워드 검색, TBX-014)는 있으나 프런트 미배선. 원본: [함수 마법사] 다이얼로그(검색→설명→선택 삽입).
- [x] Macro Studio ƒx 다이얼로그 ✅ v27.2 — 카탈로그 11함수(자연어 검색: '조건'→IF·'합계'→SUM)·시그니처·설명, 클릭 시 식에 삽입 후 닫힘. 라이브 E2E 7/7(저장 미수행 — 서버 무변경)
- [ ] Sub Work Place Coding 패널 진입점 — 패널 식 편집이 읽기 전용(승인 Macro 표시)이라 편집 개방과 함께 후속

### U25. 그래프 마법사 (슬라이드 59 [그래프 마법사]) — ✅ 완결 (v27.6~v29.6)
Table 데이터 → 차트 생성 위저드(Qt 스타일). 현재 성능 곡선(U15)은 고정 SVG.
- [x] Table → 차트 위저드 ✅ v27.6 — 데이터 Table(M-3-7) 📊 버튼: 숫자 열 시리즈 다중 선택·라인/막대 전환·순수 SVG(그리드선·축 라벨·색상 6종). 라이브 E2E 7/7(시리즈 6후보·라인 2→3·막대 15개·닫기, 클라이언트 전용)
- [x] 차트 문서 연계 ✅ v29.6 — ⬇ SVG 다운로드(xmlns 포함 단독 파일, chart-{table}.svg)·🖶 인쇄(새 창+OS 인쇄 대화상자). 라이브 E2E 5/5(다운로드 파일 유효성·인쇄 창 차트 포함)

## 6차 조사 신규 태스크 (2026-07-19, 잔여 미열람 전수 열람 — U26)

> 추가 열람: 1·2·3·6·9·12·14·16·19·21·23·25·28·54·56·60·63·69·71·77 — 이로써 78장 전량 열람 완료(잔여는 동일 화면 연속 페이지 32·35·40·43·48·52뿐).
> 기구현·기분류 확인: s09 문서 4종=U19/문서함, s25 CAD 학습=C9(API 키 대기), s28 UI Designer 상세=U16(Signal/Slot 협의),
> s54=s53 동일(PR·PO 기구현), s56 작업판 구조=U13/U21, s60 Selection 툴바=C-1+U16, s63 Design 툴바 상세=U2 잔여(파라메트릭),
> s77 Mobile App=M-16(별도 앱 협의). 신규 갭 1건.

### U26. Sub Work Place 보강 — Child Component 패널 + Spec Import 진입점 (슬라이드 69) — ✅ 구현 (v27.4)
E-4 SWP 모듈 명세 중 미배치 2종: **Child Component**(BOM Mother 연결 Sub Code 표 + 세부 정보 Data 아이콘), **Specification**(정형 Excel Import — 백엔드 /tables/{name}/import-excel 은 기구현, SWP 진입점 부재).
- [x] Child Component 패널 ✅ v27.4 — SWP 4번째 패널: mother 조회(기본 KDCR 3-13)→child 표(코드·설명·수량)+📄 코드 상세 딥링크. 라이브: 5행·/detail/code 이동
- [x] Table Excel Import 진입점 ✅ v27.4 — Table 패널 하단 .xlsx 업로드 폼(기존 import-excel 멀티파트 재사용, 신규/갱신/거부 집계 표시). 라이브: FanTechData UT999 신규 1건 왕복(Import→반영 확인→삭제 원상)

## 7차 조사 신규 태스크 (2026-07-19, 발표자 노트 전수 추출 — U27~U28)

> python-pptx 로 78장 발표자 노트 51건·숨김 슬라이드(0건) 전수 추출. 노트 대부분은 제품 설계/선정/서류 3종 표준 흐름 반복(기추적:
> U1~U3·U15·문서함)이며 s56 Head 권한 구조=D10/U21, s77 QR 현장=Mobile App 협의, s05 6면/분할통합=U1 잔여 재확인. 신규 2건.

### U27. 공학 함수 Templet — 매크로 엔진 확장 (s27 노트 "공학 함수 Templet") — ✅ 구현 (v27.8)
현행 엔진 내장 = 논리/집계/Var/PreC 10종뿐. 노트: "Excel Macro 기능 모두 포함 + 공학 함수 Templet".
- [x] 엔진 공학 함수 17종 ✅ v27.8 — ABS/SQRT/ROUND/POWER/EXP/LN/LOG/MOD/CEILING/FLOOR/PI/SIN/COS/TAN/RADIANS/DEGREES/INTERP(2점 보간·trace), 오류 가드(음수 SQRT·0 나눔·역보간). 단위 테스트 4건 추가(35/35)
- [x] 카탈로그 동기 ✅ v27.8 — ENGINE_BUILTINS(Table 참조 오인 방지)·/macros/functions 17건 등록 → 함수 마법사 28함수 자동 노출. 라이브 E2E 9/9(SQRT·CEILING·삼각·INTERP 49.0·오류·기존 회귀·'삼각'→SIN/COS/TAN 검색)

### U28. AI 내부 자료 질의응답 (s27 노트 "AI 질의 응답 — 내부 자료 검색·응답용") — ⏸ API 키 대기
U7/U10(C9)과 동일 그룹 — ANTHROPIC_API_KEY 입력 시: 내부 Table·문서·코드 자료 검색 기반 질의응답 패널(도구 호출형). 인터넷 검색 Tool 은 별도 협의.

## 8차 조사 신규 태스크 (2026-07-19, 내장 미디어 전수 스캔 — U29)

> PPT 내장 미디어 242건 스캔(zip ppt/media). 대형 이미지들은 스톡아트/화면 캡처(기열람)였고,
> **model3d1.glb — 18MB glTF 2.0 제품 3D 모델**을 발굴. 3D/STEP 트랙의 "자료 부재" 전제가 해소됨.

### U29. 제품 3D 뷰어 — PPT 내장 GLB 정본 (DWG 패널 "3D ☑" 실체) — ✅ 구현 (v28.9)
- [x] GLB 정본 등재 ✅ — public/models/ahu-fan.glb (18MB, glTF 2.0) — 원본 PPT 내장 3D 모델 추출
- [x] 웹 3D 뷰어 ✅ — /detail/model3d: three.js 동적 로드(GLTFLoader·OrbitControls), 바운딩 자동 중심·거리, 드래그 회전/휠 줌/우클릭 이동, CAD 뷰어 🧊 3D 진입 링크. 라이브 E2E: WebGL 캔버스 렌더 완료·GLB 서빙·뷰어 링크 이동
- [ ] 코드별 3D 모델 연결(dwg_file 3D 유형 등재·다중 모델) — 추가 모델 자료 입수 시

## 사용자 지시 태스크 (2026-07-19 — U30)

### U33. 테넌트 메뉴 관리 화면 (사용자 지시: CPQ·ERP 좌측 패널 테넌트별 관리자 구성) — ✅ 구현 (v31.0)
- [x] 통합 관리 화면 ✅ — /erp/tenant-menus (M-14-6B, Company Info. SETUP 리프): 모듈 6종 × 대상(좌측/헤더) ●○ 지정 현황 매트릭스 → 목록 편집(↑↓✕·카탈로그 추가) → 🏢 저장/해제
- [x] 라이브 E2E ✅ — CPQ 좌측 8→3항목 저장→서버 반영→개인 미설정 사용자에 3항목 적용(개인 설정 보유 시 개인 우선 정상)→해제 복귀→개인·테넌트 원복

### U30. 테넌트 기본 좌측 메뉴 (사용자 지시: 메뉴 패널을 테넌트 관리자가 설정) — ✅ 구현 (v29.2)
- [x] 관리자 지정 저장소 ✅ — GET/PUT /tenant/leftnav (sys_tenant.settings.tenantLeftNav, ADMIN 가드·형식 422), 감사 기록
- [x] 3단 해석 ✅ — 사용자 개인 pref > 테넌트 기본 > 전체 권한 트리 (개인 설정 없는 사용자에게 테넌트 기본 자동 적용)
- [x] 편집 UI ✅ — 좌측 메뉴 편집 모달에 관리자 전용 \'🏢 테넌트 기본 저장\' 버튼. 라이브 E2E 7/7(테넌트 3항목 → 트리 반영·개인 pref 우선·원복)
- [x] 헤더 드롭다운 확장 ✅ v29.8 — /tenant/headnav 동일 패턴(개인>테넌트>전체), 헤더 편집 모달에도 🏢 버튼. 라이브 E2E 5/5(드롭다운 축소 반영·검증 422·원복)

## 9차 조사 신규 태스크 (2026-07-19, 추적성 재대조 — U31)

### U31. WORK INSTRUCTION 공통 문서 헤더 (슬라이드 9 양식 표) — ✅ 완결 (v30.0~v30.3)
s09 의 BOM·견적서 목업 상단 공통 표(Category ISO 9001 | Issued by department | Language | Revision | Page | 문서번호 + Title 행)가 PDF 렌더에 없었음.
- [x] 공통 헬퍼 ✅ — _work_instruction_header(6열 메타+Title 행) 를 문서 관리 PDF·CLT 견적서에 적용, 본문 자동 하향. 라이브 E2E 6/6(pypdf 마커: WORK INSTRUCTION·ISO 9001·Revision·Issued by + 기존 CLT/문서 마커 회귀 무결, 견적 생성→삭제 왕복)
- [x] 잔여 렌더 확산 ✅ v30.3 — 계산서·기술자료 계열(build_lines_pdf: 밀도/덕트 계산서·성능표 등 공통 경로)에도 헤더 적용(Issued by Engineering). 라이브: /api/render/pdf 마커+본문 회귀 무결. 문서 렌더 3계열(문서·견적·계산서) 양식 통일 완료

## 10차 조사 신규 태스크 (2026-07-19 — U32)

### U32. Approval 스트립 표준화 1단계 (전 Set-up 화면 좌측 Approval 박스, s33 등) — 🔶 1단계 (v30.6)
협의로 분류했던 결재 툴바 중 실데이터 근거가 확실한 부분(상태 칩 + ✍ 승인 요청 + 📥 승인함 링크)을 공용 컴포넌트로 표준화.
- [x] 공용 위젯 ✅ v30.6 — components/ApprovalStrip(+ requestApprovalGeneric 공용 액션, POST /approvals) — 대상 테이블·코드 지정형
- [x] 1단계 장착 ✅ v30.6 — Hierarchy 패널(M-3-1): 선택 노드 상태 칩·승인 요청·승인함 링크. 라이브 E2E 5/5(미선택 비활성→선택 활성→요청→승인함 +1 등록→반려 정리, U23 잔존 승인 1건도 함께 정리)
- [x] 2단계 확산 ✅ v30.8 — Product Code(M-3-2)에 스트립 장착: 기존 직접 전이(관리자 단축)와 병행하는 승인함 경유 요청 경로 신설(s32 노트 '저장→승인요청→관리자 승인' 흐름). 라이브 E2E 4/4(요청→승인함 등록→반려 정리)
- [ ] 잔여 화면 확산(Sub Code·Relationship 등 기존 개별 버튼의 스트립 교체) + 아이콘 6종(복사·편집·삭제 등) 시맨틱 — 협의 유지

## 구현 완료 확인 (원본 요구 → 구현 근거, 대표만)

| 원본 (슬라이드) | 구현 |
|---|---|
| RCCS Sub/Product/Relationship/Arrangement Code + 중복검토 + 승인 (32~38) | code/* 5화면 + Running Test(순환 참조 점검) + X-code |
| EDIM Run: BOM→원가 3분류→제작도 Macro→기술자료→견적 (70·73~75) | cpq/run 파이프라인 + cst_calc/PCR/QT |
| 단가 4-Table (견적/구매이력/재고/견적적용) (74~75) | prices source 4종 |
| 문서 통제 Grade·워터마크·승인 체인 (58·20) | doc_control + S-1/S-2 타일 워터마크 |
| ERP 이벤트 체인 PS→…→PE (10) | erp_process_event 상태기계 + Dashboard |
| 업체 평가 CE (10) | v20.0 공급처 스코어카드 |
| Macro 문법 `IF/Table/Var/PreC` (29~30) | macro_engine (31 유닛테스트) |
| Hierarchy 관리·심볼·History (57·64) | sys_hierarchy + code/groups 트리 |
| To-do·Schedule·Approval Request List 상시 판넬 (전 화면) | 승인함·업무함·마일스톤 + To-Do 푸터(v20.2) |
| 프로젝트 등록(영업단계·Client·Type·담당·Pain Point·파일) (4·52) | projects + folder 업로드 (메타수정 P2) |

## 권장 순서 (기존 백로그 연계)

0. **U14 + U15 소형(Approval 툴바·BOM 가격)** — 즉시 가능한 셸/공통 개선
1. **U3 + U6 + U11 + U13** — 소·중형, 외부 의존 없음 (U13 공통 패널이 이후 화면 작업의 기반)
2. **U5 + U4(MRP 1차)** — ERP 사이클 완결 연장 (D-트랙 후속)
3. **U1 + U2** — 캔버스 편집 트랙 (9차 감사 G1과 통합 추진)
4. **U8 Duct 수동도구·기술계산표** — P2 잔여와 동일 항목
5. **U9 QR·프로젝트 대화** — QR 은 저비용 고효과, 대화는 신규 도메인
6. **U7 AI 3종 + U10** — ANTHROPIC_API_KEY 입력 후 (C9)
7. **U12** — 협의·제외 결정
