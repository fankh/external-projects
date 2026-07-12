# CUPIA AI 연구 과제 2026

**e-PASS AI 모델 상품화 + EWACS 복합 AI Agent 구축** — CUPIA(전자통관국제협력재단) × (주)시커스랩 공동 연구 과제

| 항목 | 내용 |
|---|---|
| 발주기관 | 전자통관국제협력재단 (CUPIA) AI연구개발본부 |
| 수행업체 | (주)시커스랩 (SeekersLab) |
| 과업 기간 | 2026년 4월 ~ 12월 (9개월) |
| 총 투입규모 | 31 M/M (과제 1: 9 M/M, 과제 2: 22 M/M) |
| 문서번호 | CUPIA-AI-2026-SOW-001 |

## 과제 구성

### 과제 1: e-PASS AI 모델 상품화 (4~7월, 9 M/M)
CUPIA가 자체 PoC(2025.11~12, 1인·2개월)로 만든 **OCR+vLLM 신고서 검증 시스템**을 상용 v1으로 고도화.
폐쇄망 온프레미스 (H200/RTX 5090, gpt-oss-120b, Tesseract·PaddleOCR·PP-Structure·LayoutLM·TAPAS).

- 4월: 서비스 수준 진단 → 최소/목표 사양(Minimum/Target Spec) 정의
- 4~5월: 프롬프트 엔지니어링 고도화 (Hallucination 억제, 신고서 유형별 프롬프트)
- 5~6월: 파이프라인 성능 최적화 (배치 추론, 양자화, Continuous Batching, 멀티 GPU)
- 6월: 시스템 패키징 (REST API, Docker/K8s, Helm, 운영 문서)
- **7월: v1 런칭** (해외 세관 e-PASS 배포 가능 수준)

### 과제 2: EWACS 복합 AI Agent 구축 (4~12월, 22 M/M)
룰 기반(고정 임계치) 전자통관 업무 모니터링 시스템 EWACS를 AI Agent 기반으로 전환.

- 핵심 모듈: 예측 엔진, 동적 임계치(시간대/요일/계절 학습), 원인 분석(RCA), LLM 인사이트 엔진, 알림 모듈(독립 박스화), 대응 추천(인력 재배치)
- 통합 계층: REST API / Event Bus / Webhook
- 일정: 요건(4~5월) → 설계(5월) → 모듈 개발(6~8월) → 알림 모듈화(8~9월) → 통합 테스트(9~10월) → **안정화·운영 전환(11~12월)**

## 참고 문서 (`docs/reference/`)

| 파일 | 내용 |
|---|---|
| `01_AI기술내재화_개념증명_PoC_2026-01.pdf` | CUPIA 내부 PoC 결과 보고 (8p, 2026-01-13). 신고서 무결성 검증 AI PoC — 선별단계는 신고건수 적은 국가만 적용 가능, 사후검증 단계는 충분히 활용 가능 판단. 한계: vLLM 의존도 ↔ 속도/정확도 트레이드오프 |
| `02_CUPIA_AI_연구과제_2026_SOW_v3.docx` | 과업지시서 초안 v0.1 (계약 별첨 문서). 과업 범위·일정·투입인력·산출물·검수 기준·IP(공동 소유)·하자보수 12개월. 텍스트 추출본: 같은 이름 `_텍스트추출.txt` |
| `03_RAG_Codex_고객시연자료_v2.0_2025-11.pdf` | "RAG Codex: Intelligent Customs Compliance" 시스템 소개 슬라이드 (15p, 이미지 기반, NotebookLM 생성). CUPIA v2.0 (2025-11) 기준 현행 시스템 상세 |

### RAG Codex (현행 시스템, 과제 1의 대상) 핵심 스펙
- **목적**: 신고서 ↔ 상업서류(Invoice, B/L, AWB, CO) 교차검증 — 5~10% 샘플링 감사 → 100% 전수 사전심사
- **파이프라인**: 추출(Extraction) → 매칭(Matching) → 로직 체크(Qty×Price=Total) → 위험 알림(JSON)
- **OCR**: Tesseract(영숫자) + PaddleOCR(복잡 레이아웃·CJK) 앙상블 — 신뢰도 68%→87%, 텍스트 복구율 73%→92%
- **문서 분류**: Doc_ID 패턴(BL_, INV_, AWB_) + 문서번호 변경 감지 스마트 분할 + 키워드 폴백
- **공간 이해**: PP-Structure 좌표 임베딩 (bounding box를 LLM에 직접 전달 → 행 매칭 hallucination 방지)
- **RAG**: Two-Track — TAPAS(테이블) + BGE-M3(텍스트) → PostgreSQL+pgvector 하이브리드 검색
- **아키텍처**: OpenWebUI/Customs Viewer → FastAPI Gateway/RAG Proxy → vLLM(GPT-OSS-120B)·Tesseract·Paddle Worker → PostgreSQL·pgvector (Docker Compose, NVIDIA GPU)
- **성능**: 5페이지 문서 15초, 수기입력 80% 절감, CUDA/PP-Structure 10배 속도 향상
- **보안**: 100% 온프레미스, 외부 API 호출 없음, Docker 네트워크 격리
- **성공 사례**: 차량 B/L VIN 추출 0%→100% (좌표 기반 행 매칭 + Few-shot) — "부품" 위장 완성차 적발
- **로드맵**: 필기체 VLM 폴백(<60% 신뢰도), 저품질 팩스 적응형 임계값, 37+ 문서유형 벤치마크, 감사관 피드백 루프

## 착수 전 협의 필요 사항 (SOW 별첨)
- 연구 과제 vs 개발 과제 — 산출물 완성도 기준
- 계약 형태: M/M 기반 vs 모듈별 정액 (CUPIA 예산 확인 후 확정)
- 4월 착수 가능 여부, 데이터 제공 범위·익명화 수준
- GPU 인프라 확보 방안, OCR+vLLM 코드·프롬프트 공유 범위
- EWACS 현행 문서·접근 권한, 과제 1 안정화 기간(8~12월) 유지보수 방식·비용

## 폴더 구조
```
cupia-ai-research/
├── README.md               ← 이 문서
└── docs/
    ├── 01_제안서/           ← PROPOSAL_..._v0.1.pptx (제안서 초안, 9슬라이드)
    ├── 02_요구사항/         ← REQUIREMENTS_..._v0.1.docx (기능/비기능/데이터 요구, REQ/NFR/DAT ID 체계)
    ├── 03_기능확인서_FVT/   ← FVT_..._v0.1.xlsx (검증 항목 18건, SOW 인수 기준 기반)
    ├── 04_WBS/             ← WBS_..._v0.1.xlsx (WBS+간트 4~12월, 투입인력 시트)
    └── reference/          ← 발주처 제공 원본 자료
```

※ 산출물 문서는 HTML이 아닌 Office 포맷(xlsx/docx/pptx)으로 작성한다.
