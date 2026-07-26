# -*- coding: utf-8 -*-
"""API 표면 커버리지 실측 (18.9) — 검증이 실제로 두드린 엔드포인트를 센다.

왜 필요한가: 검증 파일에서 경로 문자열을 세는 방식은 **동적으로 조립한 URL 을 놓치고**,
반대로 주석·상수에 적힌 경로를 실행된 것으로 착각한다. 두 오차가 서로를 가려 수치가 그럴듯해
보인다. 백엔드는 요청마다 method·path 를 구조화 로그로 남기므로, 그것을 세면 추정이 아니라
실측이 된다.

주의(직접 겪은 것): 컨테이너가 재시작되면 **그때까지의 로그가 사라진다**. 측정 도중에
배포가 나가면 창이 통째로 날아가는데, 남은 로그만 세면 "커버리지가 낮다" 는 잘못된 결론이
나온다. 그래서 시작·종료 시점의 `/health.proc` 을 비교해 재시작을 감지하면 **수치를 내지
않고 실패**한다 — 못 잰 것을 낮은 값으로 보고하지 않는다.

사용:
  py tools/measure_api_coverage.py --since 90m     # 최근 창의 실 호출로 커버리지 산출
  py tools/measure_api_coverage.py --since 90m --save   # docs/api/coverage.json 갱신
"""
from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = ROOT / "docs" / "api" / "openapi_asbuilt.json"
OUT = ROOT / "docs" / "api" / "coverage.json"
HEALTH = "https://edim.seekerslab.com/api/v1/health"
METHODS = ("get", "post", "put", "patch", "delete")


def proc_id() -> str:
    try:
        with urllib.request.urlopen(HEALTH, timeout=10) as r:
            return str(json.loads(r.read() or b"{}").get("proc") or "")
    except Exception:  # noqa: BLE001
        return ""


def _ssh(cmd: str) -> str:
    r = subprocess.run(["ssh", "edim-server", cmd], capture_output=True, text=True,
                       timeout=300, encoding="utf-8", errors="replace")
    return r.stdout or ""


def hits(since: str) -> set[tuple[str, str]]:
    raw = _ssh("sudo docker logs edim-backend --since " + since +
               " 2>&1 | grep -o '\"method\": \"[A-Z]*\", \"path\": \"[^\"]*\"' | sort -u")
    out: set[tuple[str, str]] = set()
    for line in raw.splitlines():
        m = re.search(r'"method": "([A-Z]+)", "path": "([^"]+)"', line)
        if m:
            out.add((m.group(1), m.group(2)))
    return out


def routes() -> list[tuple[str, str, re.Pattern[str]]]:
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    out = []
    for p, v in spec["paths"].items():
        for m in METHODS:
            if m in v:
                rx = re.sub(r"\\\{[^}]+\\\}", r"[^/]+", re.escape(p))
                out.append((m.upper(), p, re.compile("^" + rx + "$")))
    return out


def main() -> int:
    since = "90m"
    if "--since" in sys.argv:
        since = sys.argv[sys.argv.index("--since") + 1]
    start = proc_id()
    seen = hits(since)
    end = proc_id()
    if not (start and end):
        print("FAIL — /health.proc 을 읽지 못해 재시작 여부를 확인할 수 없습니다. "
              "확인 없이 낸 커버리지는 근거가 되지 않으므로 중단합니다.")
        return 1
    if start != end:
        print(f"FAIL — 측정 중 백엔드가 재시작됐습니다 (proc {start} → {end}). "
              "재시작하면 이전 로그가 사라지므로 남은 로그만 세면 커버리지가 낮게 나옵니다. "
              "배포가 끝난 뒤 검증을 다시 돌리고 측정하십시오.")
        return 1
    if not seen:
        print(f"FAIL — 최근 {since} 창에 요청 로그가 없습니다. "
              "검증을 돌린 뒤(같은 컨테이너 수명 안에서) 측정하십시오.")
        return 1

    rs = routes()
    covered: set[tuple[str, str]] = set()
    for me, pa in seen:
        for rm, rp, rx in rs:
            if rm == me and rx.match(pa):
                covered.add((rm, rp))
                break
    allr = {(m, p) for m, p, _ in rs}
    un = sorted(f"{m} {p}" for m, p in allr - covered)
    pct = len(covered) * 100 // len(allr)
    print(f"as-built 오퍼레이션 {len(allr)} · 실제 호출 {len(covered)} ({pct}%) · 미호출 {len(un)}")
    from collections import Counter
    area = Counter(p.split(" ", 1)[1].replace("/api/v1", "").strip("/").split("/")[0] for p in un)
    print("미호출 상위 영역:", dict(area.most_common(10)))
    if "--save" in sys.argv:
        OUT.write_text(json.dumps(
            {"note": "플릿 실행 창의 백엔드 요청 로그에서 실측한 API 표면 커버리지. "
                     "검증 소스의 경로 문자열이 아니라 실제 호출을 센다(18.9).",
             "since": since, "proc": start, "total": len(allr), "covered": len(covered),
             "percent": pct, "uncovered": un}, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"저장 — {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
