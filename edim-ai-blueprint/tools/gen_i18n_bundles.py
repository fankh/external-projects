# -*- coding: utf-8 -*-
"""backend edim_seed.py 의 UI_TRANSLATIONS* 딕셔너리에서 edim-web OFFLINE_BUNDLES 생성.

용법: PYTHONUTF8=1 py tools/gen_i18n_bundles.py   (저장소 루트에서)
원천 = 시드(단일 진실) → bundles.ts 는 생성물 (직접 편집 금지).
"""
import ast
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEED = ROOT / "backend" / "app" / "services" / "edim_seed.py"
OUT = ROOT / "edim-web" / "src" / "i18n" / "bundles.ts"

src = SEED.read_text(encoding="utf-8")

merged: dict[str, tuple[str, str, str]] = {}
for m in re.finditer(r"^(UI_TRANSLATIONS\w*)\s*:[^=]*=\s*(\{.*?^\})", src, re.S | re.M):
    d = ast.literal_eval(m.group(2))
    merged.update(d)
    print(f"{m.group(1)}: {len(d)} keys")

if not merged:
    sys.exit("UI_TRANSLATIONS 딕셔너리를 찾지 못함")


def ts_str(s: str) -> str:
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


lines = [
    "/** 내장 번역 사전 — 백엔드 sys_translation 시드와 동일 내용, 오프라인 폴백.",
    " *  생성물: tools/gen_i18n_bundles.py (원천 = backend/app/services/edim_seed.py — 직접 편집 금지). */",
    "export const OFFLINE_BUNDLES: Record<string, Record<string, string>> = {",
]
for i, loc in enumerate(("en", "ja", "zh")):
    lines.append(f"  {loc}: {{")
    for key in merged:
        lines.append(f"    {ts_str(key)}: {ts_str(merged[key][i])},")
    lines.append("  },")
lines.append("}")
OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"OK — {OUT.relative_to(ROOT)} ({len(merged)} keys x en/ja/zh)")
