# edim-ai-blueprint — 아키텍처

AI 기반 2D 도면(블루프린트) 생성 시스템의 구조 문서. 모든 다이어그램은 Mermaid로 작성했다.

핵심 설계 원칙: **모든 입력(DXF · DWG · IFC · AI 프롬프트)은 하나의 정규화된 `DrawingDocument` JSON으로 수렴**하고, 프론트엔드는 이 형식만 SVG로 렌더링하며, DXF 익스포터는 이 형식만 소비한다.

---

## 1. 시스템 구성 (High-Level)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '14px' }, 'flowchart': { 'useMaxWidth': true }}}%%
flowchart TB
  subgraph client["Browser · Vite + React + TS"]
    ui["React UI Components"]
    canvas["SVG Blueprint Canvas"]
    apiClient["API Client · fetch"]
  end
  subgraph backend["Backend · FastAPI"]
    routers["API Routers"]
    services["Services Layer"]
    schema["DrawingDocument Schema"]
  end
  subgraph external["External"]
    anthropic["Anthropic Claude API"]
    oda["ODA File Converter · CLI"]
  end

  ui --> apiClient
  apiClient -->|"/api · HTTP + JSON"| routers
  routers --> services
  services --> schema
  schema -->|"JSON response"| apiClient
  apiClient --> canvas
  services -->|"AI generate"| anthropic
  services -->|"DWG to DXF"| oda

  classDef c1 fill:#dbeafe,stroke:#3a7bd5,color:#1e3a5f
  classDef c2 fill:#dcfce7,stroke:#2e8b57,color:#14532d
  classDef c3 fill:#fef3c7,stroke:#b7791f,color:#713f12
  class ui,canvas,apiClient c1
  class routers,services,schema c2
  class anthropic,oda c3
```

---

## 2. 백엔드 모듈 구조 (Routers → Services → Schema)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '14px' }, 'flowchart': { 'useMaxWidth': true }}}%%
flowchart LR
  subgraph metaR["Meta Routers"]
    health["health"]
    models["models"]
  end
  subgraph ioR["I/O Routers"]
    upload["upload"]
    generate["generate"]
    export["export"]
  end
  subgraph imp["Importers"]
    dxfImp["dxf_importer · ezdxf"]
    dwgConv["dwg_converter · ODA"]
    ifcImp["ifc_importer · ifcopenshell"]
  end
  subgraph genExp["Generate / Export"]
    aiGen["ai_generator · Anthropic"]
    dxfExp["dxf_exporter · ezdxf"]
  end
  subgraph sup["Support"]
    catalog["model_catalog"]
    cfg["config · settings"]
  end
  schema["DrawingDocument"]

  upload --> dwgConv
  dwgConv --> dxfImp
  upload --> dxfImp
  upload --> ifcImp
  generate --> aiGen
  generate --> catalog
  models --> catalog
  export --> dxfExp
  aiGen --> cfg
  dxfImp --> schema
  ifcImp --> schema
  aiGen --> schema
  schema --> dxfExp

  classDef r1 fill:#ede9fe,stroke:#7c3aed,color:#3b0764
  classDef r2 fill:#dbeafe,stroke:#3a7bd5,color:#1e3a5f
  classDef s1 fill:#dcfce7,stroke:#2e8b57,color:#14532d
  classDef s2 fill:#ffe4e6,stroke:#be123c,color:#4c0519
  classDef s3 fill:#fef3c7,stroke:#b7791f,color:#713f12
  classDef sc fill:#e2e8f0,stroke:#475569,color:#1e293b
  class health,models r1
  class upload,generate,export r2
  class dxfImp,dwgConv,ifcImp s1
  class aiGen,dxfExp s2
  class catalog,cfg s3
  class schema sc
```

---

## 3. 정규화 데이터 흐름 (모든 입력 → DrawingDocument)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '14px' }, 'flowchart': { 'useMaxWidth': true }}}%%
flowchart LR
  subgraph inputs["Inputs"]
    dxf["DXF file"]
    dwg["DWG file"]
    ifc["IFC file"]
    prompt["AI Prompt"]
  end
  doc["DrawingDocument · normalized JSON"]
  subgraph outputs["Outputs"]
    svg["SVG Render · frontend"]
    exp["DXF Export · R2010"]
  end

  dxf --> doc
  dwg -->|"ODA to DXF"| doc
  ifc -->|"2D 투영"| doc
  prompt -->|"Claude · 키 없으면 stub"| doc
  doc --> svg
  doc --> exp

  classDef ci fill:#dbeafe,stroke:#3a7bd5,color:#1e3a5f
  classDef cd fill:#dcfce7,stroke:#2e8b57,color:#14532d
  classDef co fill:#fef3c7,stroke:#b7791f,color:#713f12
  class dxf,dwg,ifc,prompt ci
  class doc cd
  class svg,exp co
```

---

## 4. 흐름: 파일 업로드 (`POST /api/drawings/upload`)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '14px' }, 'flowchart': { 'useMaxWidth': true }}}%%
sequenceDiagram
  autonumber
  actor U as Browser
  participant R as upload router
  participant DC as dwg_converter
  participant IM as importer · dxf/ifc
  U->>R: POST /upload · file, storeyIndex
  alt 미지원 확장자 / 크기 초과
    R-->>U: 415 / 413 error
  else DWG
    R->>DC: convert(dwg)
    DC-->>R: dxf path · 미설정 501 / 실패 422
    R->>IM: convert_dxf_to_drawing_document
    IM-->>R: DrawingDocument
  else DXF / IFC
    R->>IM: import · dxf 또는 ifc(storeyIndex)
    IM-->>R: DrawingDocument
  end
  R-->>U: 200 DrawingDocument · JSON
```

---

## 5. 흐름: AI 도면 생성 + 모델 선택

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '14px' }, 'flowchart': { 'useMaxWidth': true }}}%%
sequenceDiagram
  autonumber
  actor U as Browser
  participant M as models router
  participant G as generate router
  participant CAT as model_catalog
  participant AI as ai_generator
  participant CL as Claude API
  U->>M: GET /api/models
  M->>CAT: AVAILABLE_MODELS · default
  M-->>U: models, defaultModelId
  Note over U: 사용자가 드롭다운에서 모델 선택
  U->>G: POST /generate · promptText, modelId
  G->>CAT: is_allowed(modelId)
  alt modelId 미허용 / prompt 공백
    G-->>U: 422 error
  else 유효
    G->>AI: generate(promptText, modelId)
    alt API 키 있음
      AI->>CL: messages.create · model, prompt, schema
      CL-->>AI: JSON drawing
    else API 키 없음
      AI->>AI: 내장 샘플 제품 도면
    end
    AI-->>G: DrawingDocument
    G-->>U: 200 DrawingDocument
  end
```

---

## 6. 흐름: DXF 내보내기 (`POST /api/drawings/export/dxf`)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '14px' }, 'flowchart': { 'useMaxWidth': true }}}%%
sequenceDiagram
  autonumber
  actor U as Browser
  participant E as export router
  participant X as dxf_exporter · ezdxf
  U->>E: POST /export/dxf · DrawingDocument
  E->>X: convert_drawing_document_to_dxf_bytes(doc)
  X-->>E: DXF bytes · ACAD R2010
  E-->>U: 200 StreamingResponse · application/dxf attachment
```

---

## 7. 데이터 모델: DrawingDocument

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '14px' }, 'flowchart': { 'useMaxWidth': true }}}%%
classDiagram
  class DrawingDocument {
    +str drawingName
    +str sourceFormat
    +str units
    +DrawingBounds bounds
    +List~LayerInfo~ layers
    +List~DrawingEntity~ entities
    +dict skippedEntityCounts
  }
  class DrawingBounds {
    +float minX
    +float minY
    +float maxX
    +float maxY
  }
  class LayerInfo {
    +str layerName
    +str colorHex
    +bool isVisible
  }
  class Point2D {
    +float x
    +float y
  }
  class DrawingEntity {
    <<union · discriminator entityType>>
  }
  class LineEntity {
    +Point2D startPoint
    +Point2D endPoint
  }
  class PolylineEntity {
    +List~Point2D~ vertexPoints
    +bool isClosed
  }
  class CircleEntity {
    +Point2D centerPoint
    +float radius
  }
  class ArcEntity {
    +Point2D centerPoint
    +float radius
    +float startAngleDegrees
    +float endAngleDegrees
  }
  class TextEntity {
    +Point2D insertionPoint
    +str textContent
    +float textHeight
  }

  DrawingDocument o-- DrawingBounds
  DrawingDocument o-- LayerInfo
  DrawingDocument o-- DrawingEntity
  DrawingEntity <|-- LineEntity
  DrawingEntity <|-- PolylineEntity
  DrawingEntity <|-- CircleEntity
  DrawingEntity <|-- ArcEntity
  DrawingEntity <|-- TextEntity
```

---

## 모듈 책임 요약

| 계층 | 모듈 | 책임 |
|------|------|------|
| Router | `health` | 상태 확인 |
| Router | `models` | 선택 가능한 모델 목록 + 기본 모델 ID 반환 |
| Router | `upload` | 확장자별 임포터 디스패치 (DXF/DWG/IFC), 크기·형식 검증 |
| Router | `generate` | 프롬프트·모델 검증 후 AI 생성 위임 |
| Router | `export` | DrawingDocument → DXF 스트리밍 응답 |
| Service | `dxf_importer` | ezdxf로 DXF → DrawingDocument |
| Service | `dwg_converter` | ODA CLI로 DWG → DXF (플러그블 `Protocol`) |
| Service | `ifc_importer` | ifcopenshell로 IFC 2D 투영 → DrawingDocument |
| Service | `ai_generator` | Claude로 프롬프트 → DrawingDocument (키 없으면 stub) |
| Service | `dxf_exporter` | DrawingDocument → DXF(R2010) bytes |
| Support | `model_catalog` | 선택 가능 모델 정의 + allow-list 검증 |
| Support | `config` | 환경변수 설정 (API 키·모델·ODA 경로·업로드 한도) |
| Schema | `DrawingDocument` | 전 계층 공용 정규화 도면 형식 |
