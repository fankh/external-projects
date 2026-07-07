# EDIM 요구사항 보완노트

> 발표자료(EDIM Tool System EP2, 78 슬라이드) **전 슬라이드 시각 재검토** 결과 —
> 기능정의서 v0.1(137기능)에서 누락된 요구사항 41건을 식별하여 **v0.2(178기능, 14모듈)**에 반영했다.
> 본 노트는 추가 근거와 후속 문서(DB·컴포넌트 정의서) 반영 필요 사항을 기록한다.

| 항목 | 내용 |
|---|---|
| 작성일 | 2026-07-07 |
| 검토 범위 | 슬라이드 1~78 전체 (v0.1은 28장만 시각 검토, 나머지 텍스트만 분석했음) |
| 결과 | 신규 모듈 2개(DOC·DUCT) 신설, 기존 모듈 보강 30건 |

---

## 1. 신규 발견 — 모듈 신설

### 1.1 DOC 문서 관리 (4기능) — 슬라이드 58

슬라이드 58 [System Set-Up]에서 **문서 통제(Document Control)** 요구가 별도 존재함을 확인:

- 문서 Progress 메타데이터: `Person / date / Released Status / Approver / App. Date / Version / DOC No.`
- **Management Grade(관리 등급, 예: S-2)** — 문서 보안 등급 콤보. 등급별 열람/출력 통제 함의
- `[Authorization Settings]` `[Security Solution]` 자리표시 — DRM·워터마크류 보안 솔루션 연계 예정 (요건 미정, 고객 협의 필요)
- Document Code 채번 체계 (`EU-3-2020-450-6-21-4-SR-7`) — Product Code 기반 규칙 채번

### 1.2 DUCT 건축 설비 설계 (7기능) — 슬라이드 68 (E-4-2)

v0.1에서 한 줄로 처리했던 **건축 설비(덕트) 자동 설계**가 실제로는 완결된 수직 모듈:

- 건축도면 AI 학습 (램프·빔·소방구역·실 판독 → 설치 불가 지역 구분)
- 층별·대공간 도면 호출 (연결 Point XYZ)
- Duct 자재 DB (종류/손실/무게/Size별 최대길이/Pitting/Hanger/Joint/Insulation)
- 설계 조건 (실별 풍량 계산·환기횟수, 공기 조건, 유속/Std, Duct Option)
- **자동 배치 — 유체 흐름 고려 최단 경로 탐색**, Diffuser 자동 배치
- 기술자료 계산 (압력손실/Leak율/온도변화/결로/하중)
- EDIM 연결 (BOM·Code / 최소 스크랩 / 구매 / 견적)

> 사업적 의미: EDIM이 제품 제조(Fan/AHU)를 넘어 **건축 설비 엔지니어링(ETO)**까지 확장하는 근거.

---

## 2. 기존 모듈 보강 — 주요 발견

### 2.1 PLM 표준 Viewer 기능 (DWG-026/027) — 슬라이드 5·7·60 Viewer 탭

CPQ/PLM 화면 Viewer에 탭 5종 확인: **`Variants | Viewer | Referencers | Supersedure | Attachment`**

- **Referencers = Where-used 역참조** (이 부품이 어느 상위 도면·Arrangement에 쓰이는지)
- **Supersedure = 대체 관계** (신규정이 구버전을 대체, 대체된 도면 사용 시 경고)
- Variants = 도면 변형 관리

→ PLM 업계 표준 기능으로 개발 난도·중요도 높음. DB 정의서에 supersedure 관계 테이블 추가 필요 (§4 참조).

### 2.2 CAD 명령 전체 사양 (DWG-025) — 슬라이드 61

CAD 명령 Toolbar의 상세 명세 확보 (명령/기능/단축키 표):

측정 DI(수평·수직·정렬·각도·호길이·면적·무게), 특성 CH(색상·투명도·선굵기·레이어),
팬/줌, 복사 CO, 회전 RO, 삭제 E, **자르기 TR(Trim)**, **그룹화 REG(Block)**·해제,
3각법·등각 View, 단면 보기, 선 입력(직선/폴리라인/원/원호) — "CAD와 동일한 형식" 명시.

→ Drawing Editor(FE-02)의 기능 수용 기준(Acceptance Criteria)으로 사용 가능.

### 2.3 ERP 자재·생산 상세 (ERP-017~030) — 슬라이드 46 ★표시

v0.1의 프로세스 수준 정의를 세부 업무 요건으로 확장 (별표 강조 슬라이드 = 발표자 강조):

| 영역 | 세부 요건 |
|---|---|
| 구매 | 납품조건(EXW/FOB/CIP), 운송수단, 물품형식(물건/서비스/인력/협력사), 최소구매수량, 인증서, 단위(부피/체적/면적/수량) |
| **코드 매핑** | **사용자용 코드 ↔ 공급자용 코드 매핑** (발주 문서에 공급자 코드) |
| 창고 | 자재 물성 위험등급 — 액체(독극물 분류), 가스(폭발성), 고체(판/파이프/개); 저장위치 계층(지역/공장/창고/Storage/Sector) |
| 재고 단가 | 4종 산출: 최고/최저/평균/최근 |
| 생산 | MRP, Scheduling·Capacity Planning, 작업지시 양식+단계별 모니터링 |
| 공정 | 실시간 수집·분석 + 작업장/기계/인원/스킬/시간/전·후공정 DB |
| 외주 | 3rd party 제조 의뢰·재작업·인증서 (Partner 실시간 Code 연결) |

### 2.4 그 외 보강 (모듈별)

| 기능 ID | 발견 내용 | 근거 |
|---|---|---|
| SYS-018 | 좌측 하단 판넬 = 일반 업무·일정·**업무용 SNS** (데스크톱에도 Project 대화) | 슬라이드 57 |
| SYS-019/020 | Head 메뉴 편집(기업 사용자는 ERP 하부만)·Head-Templet 연결 설정 | 슬라이드 57 |
| CODE-015 | 모든 코드 화면 우측판넬 = 코드별 DWG(2D/3D)·Data Up-Load·Table **자산 연결** 공통 패턴 | 슬라이드 33~38 |
| CODE-016 | Registered Code Table의 Excel Import/Export | 슬라이드 32 |
| DWG-022 | 도면 Templet 호출 ("Free CAD" 개념 — 신규 도면은 Templet에서 시작) | 슬라이드 41 |
| DWG-023 | **CAD Mapping** — 도면 항목 ↔ 외부 CAD 파일 매핑 체크 | 슬라이드 44 |
| DWG-024 | 설계 Simulation (우측판넬) | 슬라이드 63 |
| CPQ-014/015 | Selection Toolbar 사용자 구성·Module 이미지 제작(그림 제작 Modul) | 슬라이드 60 |
| RUN-010 | **EBOM Run / EDIM Run / Export 구분** — BOM만 부분 재실행 | 슬라이드 70 |
| TBX-014/015 | 기능 찾기(자연어 함수 검색)·인터넷 검색·AI 질의응답 | 슬라이드 29, 27 노트 |

---

## 3. 후속 문서 반영 필요 사항

### 3.1 DB 정의서 v0.2 후보 테이블 — ✅ v0.2 반영 완료 (duct_*만 범위 확정 대기)

| 신규/변경 | 근거 기능 |
|---|---|
| `dwg_supersedure` (대체 관계: old_drawing_id, new_drawing_id, 사유, 일자) | DWG-027 |
| `doc_control` (문서 통제: released_status, version, doc_no, management_grade) | DOC-001/002 |
| `prt_supplier_code_map` (사용자↔공급자 코드 매핑) | ERP-018 |
| `mat_material`에 위험등급 컬럼(hazard_class) 또는 `mat_hazard` | ERP-020 |
| `erp_warehouse` (저장위치 계층: 지역/공장/창고/Storage/Sector) | ERP-020 |
| `duct_*` 영역 (자재 DB·설계 조건·배치 결과) — E-4-2 확정 시 | DUCT-003~005 |
| `tbx_ui_form`에 Head-Templet 연결 (head_key 컬럼) | SYS-020 |

### 3.2 컴포넌트 정의서 반영

- **FE-02 Set-up Studio**: Drawing Editor 수용 기준에 슬라이드 61 CAD 명령표 첨부
- **SVC-04 Drawing**: Referencers/Supersedure/Variants API 추가
- **SVC-11 Print**: Management Grade 통제 연동 (DOC-002)
- **신규 검토**: DUCT 모듈 → ENG-03 확장 vs 별도 ENG-04(Route Engine) — E-4-2 사업 범위 확정 후

### 3.3 확인 필요 (고객/발주처 협의)

1. **DOC-004 보안 솔루션** — Authorization Settings/Security Solution의 구체 범위 (DRM? 워터마크? 외부 솔루션?)
2. **DUCT 모듈 포함 여부** — v1 범위인지 후속 사업인지 (별도 견적 사안)
3. 슬라이드 46 자재/생산 상세 — EDIM 자체 구현 vs 기존 ERP 연계(INT-01) 경계
4. 슬라이드 61 CAD 명령표가 목표 사양인지 참고 이미지인지 (상용 CAD 스크린샷으로 보임)

---

## 4. 검토 방법 기록

- 1차(v0.1): 텍스트 추출(slide_text) + 발표자 노트 51장 분석, 슬라이드 28장 시각 검토
- 2차(v0.2, 본 노트): 잔여 슬라이드 시각 검토 — 19~24, 31~38, 41~46, 55~61, 64~70
- 도구: LibreOffice 변환 PDF(`reference/EDIM Tool System EP2.pdf`) 페이지 단위 판독
