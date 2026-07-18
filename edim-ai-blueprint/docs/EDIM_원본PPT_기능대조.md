# EDIM 원본 PPT 기능 대조 — 미구현 기능 감사

> 원본: `docs/reference/EDIM Tool System EP2.pptx` (78슬라이드, 2026-03).
> 방법: ① 전 슬라이드 텍스트·표·발표자 노트 전수 추출(2026-07-16) ② **전 슬라이드 이미지 렌더링 후 시각 검증**(2026-07-18, LibreOffice→PDF→PNG 78장 — UI 목업의 시각 요소는 텍스트 추출로 누락되므로) → 구현 코드(edim-web-next·backend)·기존 감사 문서(미구현기능목록 B1~G5·Next 패리티감사) 대조.
> 목적: **원본 기획서가 요구하나 아직 구현되지 않았거나 부분 구현인 기능**의 전수 목록. 기존 백로그가 "구현물 기준 감사"였다면 본 문서는 "기획서 기준 감사".

## 요약

| 구분 | 수 | 내용 |
|---|---|---|
| 원본 핵심 요구 구현 완료 | 대부분 | RCCS 코드 체계(S-1-1~6)·CPQ Run(BOM/원가/도면/기술자료)·문서 통제(워터마크·Grade)·승인 워크플로·ERP 이벤트 체인·Macro 엔진·Hierarchy·검색·모바일 1차 |
| **완전 미구현** | 7군 | U4 MRP·U9 QR/현장소통·U10 AI 학습·U11 셸 소품·U12 Digital Twin·U13 우측 공통 패널 체계·U7 일부(그래프 마법사·인터넷 검색·AI Q&A) |
| **부분 구현 (기획 대비 부족)** | 8군 | U1 Selection 캔버스·U2 파라메트릭 설계·U3 Work Process·U5 창고 심화·U6 Print Set-up·U7 Toolbox·U8 Duct·U14 Schedule 패널 |
| 시각 검증 추가 (소형) | U15 | Approval 툴바 표준화·Fan Direction/Installation Code·3D(STEP)·세부선정 폼·성능 곡선·BOM 가격·인쇄 다이얼로그 |

---

## U1. CPQ Selection 캔버스 인터랙션 (슬라이드 5·7·60·61) — 🔶 부분

기획: 이미지(모듈)를 **드래그하여 임의 배치 → 이동·삭제·분할·통합**, 치수 DB 연동 표시, 기준 치수 입력 시 하부 자료 반영, **화면-도면 비율 자동 조절**, **3각법 6면 보기**, 모듈 **더블클릭 → 제품 속성(기술·물성·치수) 세부선정 UI 창**, CAD식 명령 툴바(복사/이동/반전/연장/삭제/회전).

현재: C-1 캔버스는 블록 표시 + Add Item/Delete + BOM 하이라이트 + CommandLine(ZOOM/FIT/MEASURE/SELECT/RUN)까지. 드래그 재배치·분할통합·6면 전환·더블클릭 세부선정 창 없음 (9차 감사 G1 "뷰어는 충실하나 편집 부재"와 일치).

- [ ] 모듈 드래그 배치·이동 (좌표 영속)
- [ ] 더블클릭 → 모듈 세부선정 다이얼로그 (속성·치수 편집)
- [ ] 3각법 6면 뷰 전환
- [ ] 분할/통합·반전·회전 명령

## U2. PLM 파라메트릭 설계 편집기 심화 (슬라이드 40~42·63·67) — 🔶 부분

기획(슬라이드 63이 명세서 수준): 파트 선택 2단계(블록→끝점/중앙/모서리/중심 스냅), 사용자 원점·블록별 원점 좌표계, 드래그/좌표 이동·복사·대칭·회전·선형식, **Block 단위 저장(승인 후 상위 호출 시 Block)**, **치수선-부품 동기화(치수 변경 = Parametric Design 반영)**, 설계 우선순위·자료 우선순위 **순환 참조 자동 점검**, 관계값 계산식(`=A2.Table23_3*Var32_2`), Verification 경고, Simulation, 우측 판넬(코드 호출·하부 Item·파트관계·도면 Frame).

현재: Design Editor에 치수 Macro 평가·Simulation 재작도·조립순서·부품관계 패널·dwg_block 실데이터·Undo/Redo까지. 스냅 선택·좌표계·대칭/회전 편집·치수선 동기 파라메트릭 재작도(전체)·순환참조 점검은 없음.

- [ ] 파트 스냅 선택(끝점·중심 등) + 좌표 이동/대칭/회전 편집
- [ ] 치수선-부품 완전 동기(파라메트릭 즉시 재작도 전면화)
- [ ] 설계/자료 우선순위 순환 참조 자동 점검·경고
- [ ] Block 단위 저장·상위 호출 체계 완성

## U3. Work Process 공정 파라미터 (슬라이드 44~45) — 🔶 부분 (P2 잔여와 일치)

기획: 공정 DB — **작업장·기계 종류·작업 인원·필요 스킬 등급·작업 시간**(Person/Skill/W.Time/Work place), 자재 흐름(Item별 warehouse·Min Stock·공급자·제조/구매·Time), **설계우선순위 테이블**(Dim.별 설계우선순위·상위설계 우선자료·설계 기준점·설계 오류 체크).

- [x] 공정 파라미터 CRUD (작업장·인원·스킬·W.Time) ✅ v21.4 — 인라인 편집+F12 저장, erp_work_process 기존 컬럼 활용(스키마 무변경). 라이브 E2E: WS-UT/3/H2 저장→리로드 영속
- [x] Item별 자재 흐름 정의 (warehouse·min stock·공급처·비고) ✅ v21.4 — 동일 그리드에서 편집·영속
- [ ] 설계우선순위 테이블 (우선순위·기준점·오류체크 조건) — U2 파라메트릭 트랙과 통합 추진

## U4. 생산계획 MRP (슬라이드 46) — 🔶 1차 구현 (v22.0~22.1)

기획: **MRP(자재 소요량·시기 산출)**, 주문량+가용 자원 기반 **생산 Scheduling**, **생산능력(Capacity) 분석**, 공정별 데이터 실시간 수집.

현재: 백엔드에 MRP·capacity·scheduling 코드 없음(grep 0). BOM·재고·작업지시·마일스톤이 개별 존재하므로 연결 재료는 갖춰짐.

- [x] BOM×수주 → 자재 소요량/시기 산출 ✅ v22.0~22.1 — GET /erp/mrp(ORDERED 견적 자재 라인 × inv_stock, 부족·발주 권장일=납기-리드타임) + M-8-5 화면(리드타임 조정·발주 딥링크). 수주 0건 시 정직 빈 상태
- [ ] 작업지시-일정-작업장 부하 스케줄링 뷰
- [ ] Capacity 분석 (작업장·인원 기준)

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

## U8. 건축 설비 Duct 설계 심화 (슬라이드 68) — 🔶 부분 (P2 잔여와 일치)

기획: 건축도면 학습(램프·빔·소방구역·실 판독), **층별/대공간 복수 연결(XYZ Point)**, 실 용도별 설계 기준 DB(풍속·환기횟수), **자동배치 = 유체 흐름 고려 최단 경로**, Diffuser 자동배치+**수동 조정(Drag/Click)**, 블록화 설계(최대 size/길이 분할·합체), **기술자료(압력손실·Leak율·온도변화·결로·하중·풍량 비교)**, EDIM 연결(BOM·최소 스크랩 제조·구매·견적).

현재: Duct 화면 자동 배치 1차 + honest-write. 층 선택·수동 조정 도구·기술계산표·건축도 판독 없음.

- [ ] 층 선택·복수 층 연결
- [ ] 수동 조정 도구 (세그먼트 drag·분할/합체)
- [ ] 기술계산표 (압력손실·Leak·결로·하중·풍량 대비)
- [ ] Duct BOM → 구매/견적 연결
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

## U11. 셸 공통 소품 (슬라이드 57) — 🔶 부분 (v21.4)

- [ ] Head에 **사용자 회사 로고 배치** (테넌트 로고 업로드)
- [ ] 사용자 변경: Frame/canvas **색상 테마** (언어는 ✅)
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

## U14. 좌하단 Schedule management 상시 패널 (전 화면 공통, 시각 확인) — ✅ 핵심 구현 (v21.2)

기획: 전 화면 좌측 트리 하단에 **그리드형 개인 업무 패널** — To-do list(Item·Doc No.·Task·Remarks·Person·Status·Next 컬럼 그리드), Done items(동일 그리드), Schedule(달력), Approval Request List.

- [x] To-do 미니 그리드 — 승인 inbox 상위 3건(유형·대상, 클릭→승인함) + PL 지연 ✅ v21.2 (shellCounts inboxTop)
- [x] Schedule — 지연/임박 마일스톤 상위 3건(OVERDUE 적색, 클릭→마일스톤) ✅ v21.2 (shellCounts upcoming)
- [ ] Done items 축소 그리드·미니 달력 — 후속 (수요 확인 후)

## U15. 시각 검증 추가 발견 (소형·세부)

- [ ] **Approval 툴바 모듈** — 우상단 공통 아이콘 세트(승인 요청·송부·확인·저장·편집·삭제) 표준화 (슬라이드 전반)
- [ ] **Fan Direction 8방향 선택기**(L0~R270 아이콘) + **Installation Code**(Direct Driven/Belt In-Line/Belt Along) — Arrangement Set-up (38)
- [ ] **3D 지원** — 화면 곳곳의 3D/2D 토글 + H-1 "Drawing Control: **DXF & STEP**" — 현재 DXF 2D만, STEP/3D 뷰 없음 (18·38)
- [ ] **모듈 더블클릭 세부선정 폼** — C-2의 Impeller/Inlet cone/Casing/Motor 옵션 콤보 상세 폼 (7, U1 연계)
- [ ] **성능 곡선 인터랙티브 차트** — C-2·Print 미리보기 내 fan curve (7·8·50, 기존 P2 잔여 "성능 곡선 SVG"와 동일)
- [ ] **BOM 트리 가격 병기** — BOM 패널에 Price 컬럼(미확정 X 표시) (5)
- [ ] **인쇄 다이얼로그** — 프린터 선택·용지·방향·컬러 등 OS 인쇄 설정 UI 통합 (50, U6 연계)

---

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
