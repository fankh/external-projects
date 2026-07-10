# -*- coding: utf-8 -*-
"""라이브 스위트 통합 러너 (B15) — 실서버(edim.seekerslab.com) 대상 전 스위트 순차 실행.

개별 실패해도 계속 진행, 마지막에 요약 + 실패 있으면 종료코드 1.
실행: PYTHONUTF8=1 py tests/live_all.py
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

SUITES = [
    "live_b15_regression.py",   # 인증·RBAC 먼저 (다른 스위트의 전제)
    "live_s3_macro_engine.py",
    "live_s4_rbac_notify.py",
    "live_s5_run_pipeline.py",
    "live_cad.py",
    "live_b1_approval_flow.py",
    "live_b2_persistence.py",
    "live_b7_drawings.py",
    "live_b16_drawing_detail.py",   # 도면 상세 탭·단계별 승인·Simulation
    "live_b17_parts.py",            # 부품 마스터·BOM·공급자 코드·슬롯 정의
    "live_b18_cost.py",             # 원가 상세·PCR 수익성·견적 lifecycle
    "live_b19_warehouse.py",        # 창고 계층·QCR·PO 문서
    "live_b20_macro.py",            # Macro 4-Way·CODING·역참조·함수 검색
    "live_b21_system.py",           # auth/me·다중 역할·Hierarchy 편집·문서 전이
    "live_f1_project.py",           # 프로젝트 대장·PS 채번·접수자료 실업로드·컨텍스트
    "live_f2_users.py",             # 사용자 등록·프로필 수정·삭제 보호 (ssh psql 정리)
    "live_f3_rbac_ui.py",           # 권한 기반 UI 게이팅 — 메뉴 숨김·403 안내·버튼 disabled
    "live_f4_noop.py",              # 무반응 일소 — 관계 승인·Export·PrintSetup 위젯·F8 표준
    "live_f5_updates.py",           # 마스터 수정 전면 — 왕복 수정·보호 게이트 (원복)
    "live_f6_search.py",            # 통합 검색 확장 — 6그룹·딥링크·SETUP 게이트
    "live_f7_diff.py",              # 이력 diff 모달 — before/after 하이라이트
    "live_security.py",
    "live_dev_requirements.py",   # 개발서버 전용 — 요구사항 접수 모달
]

env = {**os.environ, "PYTHONUTF8": "1", "BASE": "https://edim.seekerslab.com/"}
results: list[tuple[str, bool, str]] = []


def run_suite(suite: str) -> tuple[bool, str]:
    path = os.path.join(HERE, suite)
    p = subprocess.run([sys.executable, path], env=env, capture_output=True,
                       text=True, encoding="utf-8", errors="replace", timeout=900)
    out = (p.stdout or "") + (p.stderr or "")
    print(out[-2500:])
    tail = next((ln for ln in reversed(out.strip().splitlines()) if ln.strip()), "")
    return p.returncode == 0, tail[:110]


for suite in SUITES:
    print(f"\n{'=' * 60}\n▶ {suite}\n{'=' * 60}")
    passed, tail = run_suite(suite)
    # 순차 13개 브라우저 스위트 부하로 인한 산발 타임아웃 — 1회 재시도 (재시도 여부는 표기)
    if not passed:
        print(f"\n--- {suite} 재시도 (부하 플레이크 가능) ---")
        passed, tail = run_suite(suite)
        if passed:
            tail += " (retry)"
    results.append((suite, passed, tail))

# check_i18n_en — 라이브 대상 (BASE env 지원)
print(f"\n{'=' * 60}\n▶ check_i18n_en.py (live)\n{'=' * 60}")
p = subprocess.run([sys.executable, os.path.join(HERE, "check_i18n_en.py")],
                   env={**env, "BASE": "https://edim.seekerslab.com/cpq"},
                   capture_output=True, text=True, encoding="utf-8", errors="replace",
                   timeout=900)
print(((p.stdout or "") + (p.stderr or ""))[-1500:])
results.append(("check_i18n_en.py", p.returncode == 0, ""))

print(f"\n{'=' * 60}\n라이브 스위트 요약\n{'=' * 60}")
failed = 0
for name, passed, tail in results:
    mark = "✅" if passed else "❌"
    print(f"{mark} {name:32s} {tail}")
    if not passed:
        failed += 1
print(f"\n{len(results) - failed}/{len(results)} suites green")
sys.exit(1 if failed else 0)
