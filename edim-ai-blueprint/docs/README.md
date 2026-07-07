# EDIM 문서 관리 요약

> **edim-ai-blueprint 프로젝트 문서 체계의 단일 진입점.**
> 무엇이 어디에 있고, 서로 어떻게 연결되며, 어떻게 수정·재생성하는지를 요약한다.
>
> 전체 산출물 현황·계획의 단일 기준: [`EDIM_산출물목록.xlsx`](EDIM_산출물목록.xlsx) (34종)

| 항목 | 내용 |
|---|---|
| 최종 갱신 | 2026-07-07 |
| 원천 자료 | `reference/EDIM Tool System EP2.pptx` (NOVA Solution, 78슬라이드) |
| 저장소 | https://github.com/fankh/external-projects (`edim-ai-blueprint/docs/`) |
| 온라인 열람 | 화면설계서: https://edim.seekerslab.com/design/ |

---

## 1. 문서 지도

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '14px' }, 'flowchart': { 'useMaxWidth': true }}}%%
flowchart TB
    subgraph SRC["원천"]
        direction LR
        PPT["발표자료 PPTX<br/>+ 추출 텍스트·노트"]
        OV["시스템 개요서<br/>EDIM_개요.md"]
    end

    subgraph DEF["정의 문서"]
        direction LR
        subgraph DEF1["요구·기능"]
            direction TB
            REQ["요구사항정의서<br/>REQ 80건"]
            FEAT["기능정의서<br/>178기능"]
        end
        subgraph DEF2["구조"]
            direction TB
            MENU["메뉴정의서 97"]
            SCR["화면설계서 16"]
        end
        subgraph DEF3["기술"]
            direction TB
            COMP["컴포넌트 39"]
            DB["DB 46테이블"]
        end
    end

    subgraph CTRL["관리·검증"]
        direction LR
        RTM["요구사항추적표<br/>(자동 조인·커버리지)"]
        REG["산출물목록<br/>(34종 레지스터)"]
    end

    SRC --> DEF
    DEF --> CTRL

    style SRC fill:#FFF8E7,stroke:#E6DDD0,stroke-width:1px
    style DEF fill:#E8F4FD,stroke:#B8D4ED,stroke-width:1px
    style DEF1 fill:#FFF8E7,stroke:#E6DDD0,stroke-width:1px
    style DEF2 fill:#F0FFF0,stroke:#D0E8D0,stroke-width:1px
    style DEF3 fill:#FFF0F5,stroke:#E8D0D8,stroke-width:1px
    style CTRL fill:#F5F0FF,stroke:#D8D0E8,stroke-width:1px
```

---

## 2. 문서 목록

### 작성 완료 (버전 관리 중)

| 문서 | 파일 | 버전 | 형식 | 역할 |
|---|---|---|---|---|
| 시스템 개요서 | [`EDIM_개요.md`](EDIM_개요.md) | v0.1 | MD (다이어그램 8) | 발표자료 분석 — 모든 문서의 기준. §13 기능 코드 맵, §14 로드맵 |
| 요구사항정의서 | [`02_요구사항/EDIM_요구사항정의서.xlsx`](02_요구사항/EDIM_요구사항정의서.xlsx) | v0.2 | Excel 6시트 | 기능 50 · 비기능 22 · 인터페이스 8 · 용어 16 |
| 기능정의서 | [`EDIM_기능정의서.xlsx`](EDIM_기능정의서.xlsx) | v0.2 | Excel 3시트 | 14모듈 178기능 — 기능코드·컴포넌트·DB·Phase 추적 |
| 메뉴정의서 | [`EDIM_메뉴정의서.xlsx`](EDIM_메뉴정의서.xlsx) | v0.3 | Excel 2시트 | 97메뉴 (PPT 3차 전수 대조) — 화면·기능·권한 매핑 |
| 화면설계서 | [`EDIM_화면설계서.html`](EDIM_화면설계서.html) | v0.2 | HTML (단일 파일) | 와이어프레임 16화면 (W-01~W-16) + 설계 노트 |
| 컴포넌트 정의서 | [`EDIM_컴포넌트_정의서.md`](EDIM_컴포넌트_정의서.md) / [`xlsx`](EDIM_컴포넌트정의서.xlsx) | v0.2 | MD + Excel | 39컴포넌트·API 68 — **구축 상태 열 포함** (개발 서버 현황) |
| DB 정의서 | [`EDIM_DB_정의서.md`](EDIM_DB_정의서.md) / [`xlsx`](EDIM_DB정의서.xlsx) | v0.1 | MD + Excel | 46테이블 398컬럼 — 설계 원칙·공통코드·미결정 8건 |
| 요구사항추적표 (RTM) | [`EDIM_요구사항추적표.xlsx`](EDIM_요구사항추적표.xlsx) | 자동 | Excel 3시트 | REQ→기능→메뉴→화면→컴포넌트→DB 179행, **커버리지 178/178** |
| 산출물목록 | [`EDIM_산출물목록.xlsx`](EDIM_산출물목록.xlsx) | v0.1 | Excel 2시트 | 34종 레지스터 — 상태·우선 권고. **신규 문서는 여기에 먼저 등록** |
| 요구사항 보완노트 | [`EDIM_요구사항_보완노트.md`](EDIM_요구사항_보완노트.md) | - | MD | PPT 재검토 발견 사항·고객 협의 필요 4건 |
| 아키텍처(프로토타입) | [`ARCHITECTURE.md`](ARCHITECTURE.md) / [`pdf`](ARCHITECTURE.pdf) | v1 | MD + PDF | 프로토타입 앱(현 배포본) 구조 |

### 템플릿 상태 (내용화 예정)

`01_제안서/PROPOSAL.html` · `03_기능확인서_FVT/FVT.html` · `04_WBS/WBS.html` — 계획은 [산출물목록](EDIM_산출물목록.xlsx) 참조 (미작성 20종 포함).

### 근거 자료 (`reference/`)

| 파일 | 내용 |
|---|---|
| `EDIM Tool System EP2.pptx` | 원본 발표자료 (78슬라이드, 35MB) |
| `EDIM Tool System EP2.pdf` | 렌더링본 — 슬라이드 시각 확인용 |
| `EDIM_EP2_slide_text.txt` | 전 슬라이드 텍스트 추출 |
| `EDIM_EP2_speaker_notes.txt` | 발표자 노트 51장 — **표준 워크플로우 원문** |

---

## 3. 추적 체계

모든 문서는 하나의 추적 체인으로 연결되며, RTM이 무결성을 자동 검증한다.

```
요구사항(REQ-F-xxx) → 기능(모듈-xxx) → 메뉴(M-x-x) → 화면(W-xx)
                                   ↘ 컴포넌트(FE/SVC/ENG…) → DB(테이블) → Phase(P1~P5)
```

- **ID 체계**: REQ-F/N/I(요구) · 14모듈 접두어(기능) · M-x-x(메뉴) · W-xx(화면) · FE/GW/SVC/ENG/AI/INT/INF(컴포넌트) · 도메인 접두어 snake_case(DB) · S/C/E/D/H(발표자료 기능코드)
- **검증 실적**: 메뉴 — PPT 3차 전수 대조(브레드크럼·Head Tab·프로세스 코드 41종 closure) / RTM — 기능 커버리지 178/178

---

## 4. 관리 규칙

### 수정 절차 (순서 중요)

1. **MD가 원본인 문서** (DB 정의서): MD 수정 → `make_db_xlsx.py` 재생성
2. **스크립트가 원본인 문서** (기능·메뉴·요구사항·컴포넌트·산출물): `docs/tools/make_*.py`의 데이터 수정 → 재생성. **xlsx 직접 편집 금지** (재생성 시 소실)
3. **RTM**: 요구사항·기능·메뉴 중 하나라도 바뀌면 `make_rtm_xlsx.py` 재실행 → 커버리지 시트 확인 (미연결/해석불가 0이어야 함)
4. 신규 문서 작성 시: 산출물목록에 등록 → 개요 §14 갱신

### 재생성 명령

```powershell
# docs/ 기준, PYTHONUTF8=1 권장
py docs/tools/make_feature_xlsx.py        # 기능정의서
py docs/tools/make_menu_xlsx.py           # 메뉴정의서
py docs/tools/make_requirements_xlsx.py   # 요구사항정의서
py docs/tools/make_rtm_xlsx.py            # RTM (위 3종 수정 후 필수)
py docs/tools/make_db_xlsx.py             # DB정의서 (MD 파싱)
py docs/tools/make_component_xlsx.py      # 컴포넌트정의서
py docs/tools/make_doclist_xlsx.py        # 산출물목록
```

### 표기·품질 규칙

- 버전: `v0.x` 초안 반복 → 고객 승인 시 `v1.0`. 변경 시 각 문서의 문서정보(이력)에 사유 기록
- Mermaid 다이어그램: 저장소 스타일 가이드 준수 (init 블록 필수·행당 3개·서브그래프당 4개·형제 색상 구분), `mermaid-cli`로 렌더 검증
- Excel: 헤더 네이비(#1A1A40)·맑은 고딕 10pt·자동필터·틀고정 — 생성 스크립트가 보장
- 커밋 메시지: `edim-ai-blueprint: <내용>` — 저장소 관례
- 문서 내 상호 참조는 상대 링크 사용 (GitHub 렌더 호환)

### 배포·동기화

| 위치 | 용도 | 갱신 |
|---|---|---|
| `C:\repos\new-research\external-projects` | 주 작업 클론 | 커밋·푸시 원점 |
| `C:\repos\external-projects` | 보조 클론 | `git pull` |
| 서버 `~/apps/external-projects` | 배포 소스 | `git pull` |
| https://edim.seekerslab.com/design/ | 화면설계서 열람 | 화면설계서 변경 시 `sudo cp docs/EDIM_화면설계서.html /var/www/edim/design/index.html` |

---

## 5. 다음 작성 우선순위

산출물목록 v0.1 기준 (상세는 [`EDIM_산출물목록.xlsx`](EDIM_산출물목록.xlsx)):

1. **권한·승인 정의서** — 역할 × 97메뉴 매트릭스 (기존 데이터에서 도출 가능)
2. **개발 표준 정의서** — P1 착수 전 필수
3. **데이터 이행 계획서** — 고객 기존 자료 이관 + AI 학습 연계 (조기 협의)
4. WBS 내용화 (P1~P5) · FVT 내용화 (기능 178건 → 확인 항목)
5. 고객 협의 대기: 보안 솔루션 범위 · DUCT 사업 범위 · ERP 자체구현/연계 경계 (보완노트 §3.3)
