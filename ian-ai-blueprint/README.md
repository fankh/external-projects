# ian-ai-blueprint

AI 기반 2D 제품 도면 생성 시스템 — 제품·산업 디자인(스마트폰·버튼·가젯·인클로저·포트 등)의 2D 외형도를 대상으로, 웹에서 기존 CAD 파일(DXF · DWG · IFC)을 업로드해 2D로 렌더링하고, AI 프롬프트로 도면을 생성하며, 결과를 DXF로 내보내는 경량 웹 CAD 스캐폴드입니다.

> AI 생성은 서버에 `ANTHROPIC_API_KEY`가 설정된 경우에만 프롬프트 기반으로 동작합니다. 키가 없으면 프롬프트와 무관한 **샘플 제품 도면(스마트폰 외형)**을 반환합니다(UI에 "샘플 모드" 표시).

## 아키텍처

```
frontend (Vite + React + TS, SVG 렌더러)
   │  /api 프록시
   ▼
backend (FastAPI)
   ├─ dxf_importer  (ezdxf)          ┐
   ├─ dwg_converter (ODA CLI, 플러그블) ├─→ 정규화된 DrawingDocument JSON
   ├─ ifc_importer  (ifcopenshell)   ┘      (line/polyline/circle/arc/text + layers)
   ├─ ai_generator  (Anthropic API, 키 없으면 스텁)
   └─ dxf_exporter  (ezdxf, R2010)
```

모든 임포터와 AI 생성기는 하나의 정규화된 `DrawingDocument` JSON을 생성하고
(`backend/app/schemas/drawing.py` ↔ `frontend/src/types/drawing.ts`),
프론트엔드는 이 형식만 SVG로 렌더링합니다.

## 실행 방법 (Windows PowerShell)

### 백엔드

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python scripts\make_sample_dxf.py          # 샘플 도면 생성
uvicorn app.main:app --reload --port 8000
```

### 프론트엔드 (별도 터미널)

```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173
```

## 환경 변수 (`backend/.env`, `.env.example` 참고)

| 변수 | 설명 |
|---|---|
| `ANTHROPIC_API_KEY` | AI 도면 생성용. 비어 있으면 프롬프트와 무관한 내장 샘플 제품 도면 반환 |
| `ANTHROPIC_MODEL_ID` | 기본 모델 ID (기본값 `claude-opus-4-8`). UI 모델 선택 시 요청별로 덮어씀. 허용: `claude-opus-4-8` · `claude-opus-4-7` · `claude-sonnet-4-6` · `claude-haiku-4-5` |
| `ODA_FILE_CONVERTER_PATH` | DWG→DXF 변환용 ODA File Converter 실행 파일 경로. 미설정 시 DWG 업로드는 501 반환 (DXF/IFC는 무관) |

## API

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/health` | 상태 확인 |
| `GET /api/models` | 선택 가능한 모델 목록 + 기본 모델 ID |
| `POST /api/drawings/upload` | multipart 업로드 (`uploadedFile`), `?storeyIndex=` IFC 층 선택 |
| `POST /api/drawings/generate` | `{"promptText": "...", "modelId": "claude-opus-4-8"}` → AI 생성 도면 (`modelId` 생략 시 기본 모델) |
| `POST /api/drawings/export/dxf` | DrawingDocument JSON → DXF 다운로드 |

## 설계 노트

- **SVG 렌더링**: 스캐폴드 규모(수백~수천 엔티티)에서는 SVG가 충분하며, 엔티티가 DOM 요소와 1:1 대응되어 향후 선택/편집 기능 구현이 쉽습니다. 약 1만 엔티티 이상이면 Canvas/WebGL 마이그레이션을 권장합니다.
- **IFC 임포트**: 스캐폴드 수준의 단순 2D 투영(진짜 단면 절단 아님)으로 대상 객체의 외곽선을 폴리라인으로 추출합니다. (IFC는 건축 BIM 포맷으로, 제품 도면 작업에는 주로 DXF·DWG를 사용합니다.)
- **DWG**: 사유 포맷이므로 `DwgToDxfConverter` 프로토콜 뒤에 ODA File Converter 구현을 두었고, LibreDWG 등 다른 변환기를 추가할 수 있습니다.

## v1 범위 제외

DB, 인증, 도면 영속화, IFC 단면 절단, 엔티티 편집 도구, 자동화 테스트.

## 문서

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 시스템 아키텍처 (Mermaid 다이어그램: 구성도 · 모듈 구조 · 데이터 흐름 · 시퀀스 · 데이터 모델)
- [`docs/ARCHITECTURE.pdf`](docs/ARCHITECTURE.pdf) — 위 문서를 다이어그램까지 렌더링한 인쇄용 PDF (A4)
- `docs/` 폴더에 제안서 · 요구사항 정의서 · 기능확인서(FVT) · WBS(HTML)가 있습니다.
