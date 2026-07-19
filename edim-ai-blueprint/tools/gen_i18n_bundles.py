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
# 메인 = Next (2026-07-15 컷오버). 레거시 SPA 번들은 존재할 때만 동기화.
OUT = ROOT / "edim-web-next" / "lib" / "i18n" / "bundles.ts"
OUT_LEGACY = ROOT / "edim-web-react" / "src" / "i18n" / "bundles.ts"

src = SEED.read_text(encoding="utf-8")


def is_translation_dict(d: object) -> bool:
    """번역 사전 판별 — 키가 문자열이고 값이 모두 (en, ja, zh) 3-문자열 튜플."""
    if not isinstance(d, dict) or not d:
        return False
    return all(
        isinstance(k, str) and isinstance(v, tuple) and len(v) == 3
        and all(isinstance(x, str) for x in v)
        for k, v in d.items()
    )


# 이름이 아닌 **형태**로 수집 — UI_TRANSLATIONS*·TAB_LABELS_V14 등 모든 번역 사전 수렴
# (F1 발견: 인라인 시드 키가 재생성 시 유실되던 문제 해소 — 단일 진실 보장)
merged: dict[str, tuple[str, str, str]] = {}
tree = ast.parse(src)
for node in tree.body:
    if not isinstance(node, (ast.Assign, ast.AnnAssign)):
        continue
    if not isinstance(node.value, ast.Dict):
        continue
    try:
        d = ast.literal_eval(node.value)
    except (ValueError, SyntaxError):
        continue
    if not is_translation_dict(d):
        continue
    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
    name = getattr(targets[0], "id", "?")
    dupes = set(merged) & set(d)
    merged.update(d)
    print(f"{name}: {len(d)} keys" + (f"  (덮어쓴 중복 {len(dupes)})" if dupes else ""))

if not merged:
    sys.exit("번역 사전을 찾지 못함")


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
body = "\n".join(lines) + "\n"
OUT.write_text(body, encoding="utf-8")
print(f"OK — {OUT.relative_to(ROOT)} ({len(merged)} keys x en/ja/zh)")
if OUT_LEGACY.exists():
    OUT_LEGACY.write_text(body, encoding="utf-8")
    print(f"OK — {OUT_LEGACY.relative_to(ROOT)} (레거시 동기화)")
