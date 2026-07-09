# EDIM 검증 스위트

| 파일 | 대상 | 실행 |
|---|---|---|
| `e2e_fallback.py` | edim-web 전 화면 50체크 (mock 폴백 경로) | `npm run preview` 후 `PYTHONUTF8=1 py tests/e2e_fallback.py` |
| `live_s3_macro_engine.py` | Macro 엔진 실평가 (라이브 서버) | `py tests/live_s3_macro_engine.py` |
| `live_s4_rbac_notify.py` | RBAC 403 · 알림 흐름 (라이브) | `py tests/live_s4_rbac_notify.py` |
| `live_s5_run_pipeline.py` | Run 파이프라인 산출물 바이트 검증 (라이브) | `py tests/live_s5_run_pipeline.py` |

요구: Python 3.12+, `playwright`(chromium), `openpyxl`. 라이브 스위트는
https://edim.seekerslab.com 의 시드 데이터(edim/edim, kim01)를 전제한다.
