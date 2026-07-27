# -*- coding: utf-8 -*-
"""파일 반출 통제 게이트 (18.98) — 소스 정적 검사.

요구 #6 은 '조회 가능 ≠ Export 가능' 이다. 그래서 금액·거래처가 담긴 파일을 내주는 경로는
`_assert_downloadable()` 로 열람 모드를 보거나, 최소한 `_info_mode()`/`_mask_*` 로 민감 열을
가려야 한다. 문제는 **경로가 늘어난다는 것**이다 — 렌더 PDF 에만 걸었더니 같은 금액이 담긴
Run 산출물이 `/files/download` 로 나갔고(15.4), 그것을 막았더니 이번엔 `/files/zip` 으로
견적서 83건 1.9MB 가 그대로 나갔다(18.98 실증). 옆 함수인 `/files/export-package` 는 같은
사유를 docstring 에 적어 두고 게이트를 걸어 놨는데도 그랬다 — 사람의 주의로는 안 된다.

이 게이트는 **파일을 내주는 엔드포인트를 소스에서 전수로 찾아** 통제 호출이 없는 것을
목록과 대조한다. 새 반출 경로를 통제 없이 추가하면 실패한다. 목록의 각 항목에는
**그 경로가 왜 통제 밖인지**를 한 줄씩 적는다 — 한 줄짜리 사유를 목록 전체에 뭉뚱그리면
사유가 맞지 않는 항목이 섞여도 드러나지 않는다(18.94 에서 PCR 이 그랬다).

기준선 갱신(항목을 줄였을 때): py tests/check_download_guard.py --save
실행: py tests/check_download_guard.py
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "backend" / "app" / "routers" / "edim.py"
BASELINE = pathlib.Path(__file__).with_name("download_guard_allowlist.txt")

_ROUTE = re.compile(r'@router\.(get|post|put|patch|delete)\("([^"]+)"')
_DEF = re.compile(r"^(async )?def (\w+)")
# 파일을 내주는 표식 — 첨부/인라인 헤더, 공용 XLSX 헬퍼, ZIP 스트림.
_EMITS_FILE = re.compile(r"Content-Disposition|_xlsx_response\(|media_type=\"application/zip\"")
# 통제 표식 — 전체 차단이거나, 민감 열만 가리는 부분 통제거나.
_GUARDED = re.compile(r"_assert_downloadable\(|_info_mode\(|_mask_num\(|_mask_text\(")


def _ungated() -> list[str]:
    lines = SRC.read_text(encoding="utf-8").split("\n")
    out: list[str] = []
    for i, line in enumerate(lines):
        m = _ROUTE.match(line.strip())
        if not m:
            continue
        verb, path = m.group(1).upper(), m.group(2)
        j = i
        while j < len(lines) and not _DEF.match(lines[j]):
            j += 1
        if j >= len(lines):
            continue
        k = j + 1
        while k < len(lines) and not (
                lines[k].startswith("@router.") or _DEF.match(lines[k])
                or lines[k].startswith("class ")):
            k += 1
        body = "\n".join(lines[j:k])
        if not _EMITS_FILE.search(body):
            continue
        if _GUARDED.search(body):
            continue
        out.append(f"{verb} {path}")
    return sorted(set(out))


def _baseline() -> set[str]:
    if not BASELINE.exists():
        return set()
    return {ln.strip() for ln in BASELINE.read_text(encoding="utf-8").split("\n")
            if ln.strip() and not ln.startswith("#")}


def main() -> int:
    found = _ungated()
    if "--save" in sys.argv:
        keep = [ln for ln in BASELINE.read_text(encoding="utf-8").split("\n")
                if ln.startswith("#") or not ln.strip()] if BASELINE.exists() else []
        BASELINE.write_text("\n".join([*keep, *found]) + "\n", encoding="utf-8")
        print(f"기준선 저장 — {len(found)}건")
        return 0
    base = _baseline()
    new = sorted(set(found) - base)
    gone = sorted(base - set(found))
    if new:
        print("FAIL — 통제 없이 파일을 내주는 경로가 늘었습니다:")
        for p in new:
            print(f"  + {p}")
        print("\n금액·거래처가 담기면 _assert_downloadable() 을 부르십시오. "
              "담기지 않는다면 tests/download_guard_allowlist.txt 에 "
              "**그 경로가 왜 통제 밖인지 사유를 적어** 추가하십시오.")
        return 1
    if gone:
        print(f"참고 — 통제가 추가되어 목록에서 빠질 항목 {len(gone)}건: {', '.join(gone)}")
        print("  py tests/check_download_guard.py --save 로 기준선을 줄이십시오.")
    print(f"OK — 파일 반출 경로 통제 확인 (통제 밖 {len(found)}건, 기준선과 일치)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
