# 심의 조치결과 (2022–2024) — text extraction → single Excel

Pipeline that turns the Seoul construction-review **deliberation result reports**
(심의의결사항 조치결과보고서) into one Excel sheet for analysis/categorization.

Source archive: `3. 2024년 심의 조치결과.zip` (despite the name it holds 3 years).
**728 PDFs** total — 2022: 258, 2023: 288, 2024: 182.

Project folder in the `external-projects` repo (`external-projects/simui-2022-2024/`).

**Tracked in git:** the scripts, `requirements.txt`, this README, the output
`simui_2022-2024.xlsx`, and `text_overflow/`. **Not tracked** (see `.gitignore`):
`source/` (745 MB zip — exceeds GitHub's 100 MB limit), `pdfs/` (~958 MB), `tessdata/`
(re-downloadable OCR models), and `*.log`. Place the source zip in `source/` and run the
pipeline to regenerate `pdfs/` and the workbook; download `kor.traineddata` (tessdata_best)
into `tessdata/` alongside `eng`/`osd` for OCR.

## Folder layout
```
simui-2022-2024/
  source/            3. 2024년 심의 조치결과.zip   (original archive)
  pdfs/<year>/       728 extracted PDFs (correct Korean names)
  tessdata/          eng + kor (tessdata_best) + osd traineddata for OCR
  text_overflow/     full text for docs whose text exceeds Excel's 32,767-char cell limit
  simui_extract.py · category_patch.py · dept_patch.py · auditor_comments.py · patch_ocr.py · localize.py · style.py
  requirements.txt
  simui_2022-2024.xlsx   <-- OUTPUT (Korean): 4 sheets — 요약 / 발주기관요약 / 심의데이터 / 검토의견
```

## How to (re)run
Prereqs: Python with the packages in `requirements.txt`, and Tesseract OCR 5.x at
`C:\Program Files\Tesseract-OCR\` (the Korean model is already vendored in `./tessdata`).

```
set PYTHONUTF8=1
python simui_extract.py
```
The script reads PDFs from `pdfs/`, uses the embedded text layer where present and
runs Korean OCR (`kor+eng`) on any page without one (handles fully-scanned and mixed
PDFs), then writes `simui_2022-2024.xlsx`. Re-running overwrites the Excel.

The workbook has four sheets, all headers/labels in **Korean**: **`요약`** (분류 분포,
연도별 건수, 추출품질, 분류(자동) × 연도 pivot), **`발주기관요약`** (발주기관 건수 +
발주기관 × 분류 / × 연도 crosstabs), **`심의데이터`** (one row per PDF, below), and
**`검토의견`** (one row per 심의위원 per file — file columns merged per file).

Full build order — the pipeline/patch scripts use English column names internally,
and **`localize.py` runs LAST** to convert headers, sheet names, labels and TRUE/FALSE
flags (→ 예/아니오) to production Korean:
1. `python simui_extract.py`    — extract text + Korean OCR (→ 심의데이터)
2. `python category_patch.py`   — refine 분류(자동) + build 요약
3. `python dept_patch.py`       — 발주기관/발주부서 + build 발주기관요약
4. `python auditor_comments.py` — build 검토의견
5. `python localize.py`         — finalize to Korean (headers, sheet names, 예/아니오)
6. `python style.py`            — header fills, borders, category colors, warning highlights
(`localize.py`/`style.py` are the final presentation steps and rename/restyle by Korean
headers, so the patch scripts can't run against an already-localized workbook — to rebuild
any sheet, re-run the chain from `simui_extract.py`. The delivered `.xlsx` is the final
Korean, styled artifact.)

발주기관 is parsed from each document header (with a fallback) and validated against a
curated Seoul-agency fixed list (junk like "○○공사" fragments dropped); ~76% (555/728)
resolve, the rest show `(미상)` (unusual layouts / noisy OCR that don't name the agency).

## Columns (sheet `심의데이터`)
| 컬럼 | 의미 |
|---|---|
| `연도`, `회차`, `회차표기` | from filename (e.g. 제103차 → 회차 103) |
| `파일명`, `파일경로`, `파일크기(KB)`, `페이지수` | file metadata |
| `심의유형(원문)` | raw 심의-type segment from the filename |
| **`분류(자동)`** | normalized category (용역발주심의 / 설계심의 / 변경설계심의 / 건설사업관리계획심의 / 정밀안전진단심의 / 공사기간적정성심의 / 입찰안내서심의 / 사업수행능력평가기준심의 / 기타) — **best-effort suggestion** |
| **`분류(확정)`** | **blank — fill this in manually**; the authoritative category |
| `안건명`, `심의일시` | best-effort parsed from the document header (may be blank for messy/OCR docs) |
| `발주기관` / `발주부서` | ordering agency / its sub-department (~76% populated, validated against a curated Seoul-agency list; sub-department only when explicitly shown) |
| `본문텍스트유무` | PDF had an embedded text layer (예/아니오) |
| `OCR사용` | at least one page was OCR'd (예/아니오) |
| `글자수` | length of the extracted text |
| `본문잘림` | text exceeded the 32,767-char cell limit — full text in `text_overflow/` (예/아니오) |
| `검토필요` | almost no text even after OCR — inspect manually (예/아니오) |
| `추출오류` | non-empty if a PDF failed to open / OCR |
| `본문` | the extracted text (truncated in-cell if oversized) |

## Notes & known limitations
- `category_auto` is derived from the filename by ordered keyword match; treat it as a
  starting point and correct it in `category_final`.
- 197 of 728 PDFs were scanned and recovered via OCR (`patch_ocr.py` re-OCR'd the worst
  rotated/skewed scans with orientation auto-detect). OCR text can have recognition errors.
- **`검토필요 = 예` (10 rows)** marks the rows to eyeball: the 2 DRM files below plus
  ~8 low-confidence scans (several are number-dense 정밀안전진단 reports where a low Hangul
  ratio is normal, not necessarily an error).
- **2 files are unreadable — DRM-protected** (header `\x9b DRMONE`, a Korean enterprise DRM
  wrapper; not real PDFs): `2023-제190차-신이촌나들목 … 조치의견서` and
  `2024-제245-1-1차-증산3교 등 12개소 정밀안전진단 및 정밀안전점검`. Open/re-export them from the
  originating DRM client to add their text.
- **`검토의견` sheet** = one row per auditor (심의위원) per file (file columns merged).
  3,609 rows / 728 files; 77 files (mostly OCR/odd layouts with no `위원명:` markers)
  get a single `(미파싱)` placeholder row. The `검토의견` text is the auditor's full
  review block — it includes the 발주기관 responses mixed in, because splitting into
  individual comment/response/반영여부 triples isn't reliable (tables flatten when
  extracted, layouts vary, OCR has no spacing). 분야 + 채택/반영/미반영 counts are
  best-effort (blank where the 총괄표 didn't parse).
- To trade accuracy for speed on a re-run, swap `tessdata/kor.traineddata` for the
  `tessdata_fast` version.
