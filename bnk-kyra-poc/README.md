# BNK금융그룹 KYRA AI Guardrail PoC 제안 자료

## 산출물

| 파일 | 내용 |
|------|------|
| `KYRA 네트워크 구성도_BNK금융그룹.pdf` | 5페이지 — 표지 · 망분리 네트워크 구성도 · 시스템 아키텍처 · 도입 방식 비교(인라인 vs API) · PoC 구성 |
| `KYRA AI Guardrail 제품소개서.pdf` | 26페이지 — KITA판 소개서에서 고객 특정 문구를 중립화한 BNK 발송용 |
| `BNK 회신 이메일(안).md` | 자료 송부 회신 이메일 초안 |

## 소스 (`src/`)

- `bnk_network_diagram.html` — 네트워크 구성도 PDF 원본 (HTML/CSS/SVG)
- `render_pdf.js` — 구성도 HTML → PDF 렌더링 스크립트
- `render_intro_bnk.js` — 제품소개서 BNK판 생성 스크립트 (kita-ax 원본 HTML 치환 + 렌더링)

## 재생성 방법

```bash
npm install playwright-core
node src/render_pdf.js        # 네트워크 구성도 PDF
node src/render_intro_bnk.js  # 제품소개서 BNK판 PDF
```

- 스크립트는 `%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1228` 의 Chromium을 사용합니다 (버전이 다르면 스크립트 상단 `CHROME` 경로 수정).
- 로고·스크린샷은 `C:\repos\external-projects\kita-ax` 의 원본을 base64로 임베드합니다.
- 출력 경로는 스크립트 상단 `OUT`/`OUT_DIR` 에 지정되어 있습니다.
