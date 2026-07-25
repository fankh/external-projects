# -*- coding: utf-8 -*-
"""C9 — AI 활성화 스모크 (ANTHROPIC_API_KEY + 크레딧 충전 시).

목적: 샘플 모드와의 분기 검증 — 키·크레딧이 준비되면 3종 엔드포인트가 mode='live' 로
실합성을 반환하는지, 산출물이 계약(수식/위젯/근거)을 지키는지, 질의 감사가 남는지 확인.

판정:
  PASS  — 3종 모두 mode='live' + 산출물 검증 + AI_QUERY 감사
  FAIL(크레딧) — mode='error' 에 credit 문구: 크레딧 미반영/소진 (exit 2, 원인 명시)
  FAIL — 그 외 (구현 회귀)

실행: PYTHONUTF8=1 py tests/live_c9_ai_smoke.py
비용: Claude API 3콜 (경량 프롬프트). 라이브 플릿(live_all)에는 미편입 — 크레딧 소진 시
플릿 전체가 적색이 되는 것을 피하기 위해 수동/nightly 별도 실행.
"""
import json
import sys
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def call(path: str, data: dict, tok: str | None = None, timeout: int = 120) -> dict:
    req = urllib.request.Request(
        API + path, data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json",
                 **({"Authorization": f"Bearer {tok}"} if tok else {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def get(path: str, tok: str) -> list | dict:
    req = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {tok}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


tok = call("/auth/login", {"userId": "edim", "password": "edim"})["token"]

# ── 1. Macro AI Draft (#65) — 실합성 수식 ──
r = call("/ai/macro-generate", {
    "prompt": "풍량이 900을 넘으면 FanTechData 의 rpm 에 1.1을 곱하고, 아니면 rpm 그대로 반환하는 식"}, tok)
if r.get("mode") == "error" and "credit" in str(r.get("error", "")).lower():
    print(f"FAIL(크레딧) — API 크레딧 미반영/소진: {r['error'][:120]}")
    sys.exit(2)
ok("macro-generate mode=live", r.get("mode") == "live")
ok("수식 비어있지 않음", bool(str(r.get("formula", "")).strip()))
# 샘플 고정 수식이 아닌 실합성 (프롬프트의 FanTechData 참조가 반영되는지는 모델 재량 — 수식 상이만 확인)
SAMPLE_FORMULA = "IF(MC>500, Table12(E,560:800,Cos2)+Var(FES,15), Table12(E,560:800,Cos1)+Var(FES,15))*PreC(1)"
ok("샘플 수식과 상이 (실합성)", r["formula"].strip() != SAMPLE_FORMULA)
ok("설명 동봉", bool(str(r.get("description", "")).strip()))

# ── 2. UI Draft 제안 — 실합성 위젯 ──
KINDS = {"PushButton", "ComboBox", "LineEdit", "TableView", "Canvas", "GroupBox"}
r = call("/ai/ui-suggest", {
    "description": "창고 재고 실사 입력 화면 — 위치 선택, 실사 수량 입력, 차이 목록 표, 확정 버튼"}, tok)
ok("ui-suggest mode=live", r.get("mode") == "live")
ws = r.get("widgets", [])
ok("위젯 1개 이상", len(ws) >= 1)
ok("위젯 kind 어휘 준수", all(w.get("kind") in KINDS for w in ws))
ok("notes 동봉", bool(str(r.get("notes", "")).strip()))

# ── 3. Guide AI 질의응답 (#64/U28) — 검색 근거 + 실합성 답변 ──
r = call("/ai/chat", {"question": "KDCR 도면과 연결된 부품이 뭐야?"}, tok)
ok("ai/chat mode=live", r.get("mode") == "live")
ok("근거(refs) 존재", len(r.get("refs", [])) >= 1)
ok("합성 답변 비어있지 않음", bool(str(r.get("answer", "")).strip())
   and "크레딧" not in r.get("answer", "") and "키 설정" not in r.get("answer", ""))

# 질의 감사 (9.14 — 요구 #64 '질문·답변 감사')
hist = get("/history?limit=20", tok)
ok("AI_QUERY 감사 행 기록", any(h.get("action") == "AI_QUERY" for h in hist))

print(f"\nlive_c9_ai_smoke: {n}/{n} PASS — AI 3종 라이브 활성 확인")
