# -*- coding: utf-8 -*-
"""라이브 스위트 통합 러너 (B15) — 실서버(edim.seekerslab.com) 대상 전 스위트 순차 실행.

개별 실패해도 계속 진행, 마지막에 요약 + 실패 있으면 종료코드 1.
실행: PYTHONUTF8=1 py tests/live_all.py
"""
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
HEALTH = "https://edim.seekerslab.com/api/v1/health"


def wait_ready(stable=2, timeout=180):
    """C7 — 배포 중 스위트 충돌 방지: /health(db:true) 가 연속 stable 회 OK 될 때까지 대기.

    autodeploy 재기동/마이그레이션 창에 스위트가 물리면 오탐이 나므로, 시작 전 준비 확인.
    """
    oks = 0
    for _ in range(timeout // 3):
        try:
            with urllib.request.urlopen(HEALTH, timeout=5) as r:
                if b'"db":true' in r.read():
                    oks += 1
                    if oks >= stable:
                        return True
                    time.sleep(3)
                    continue
        except Exception:  # noqa: BLE001
            pass
        oks = 0
        time.sleep(3)
    print("WARN — /health 준비 대기 타임아웃 (배포 중일 수 있음)")
    return False

SUITES = [
    "live_b15_regression.py",   # 인증·RBAC 먼저 (다른 스위트의 전제)
    "live_c10_authz_sweep.py",  # authz 전수 스윕 (라우터 write 89개 자동 도출·403/401)
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
    "live_f8_sort.py",              # 그리드 정렬 — 헤더 토글·선택 무결성·서버 sort
    "live_g2_grid.py",              # 그리드 내 찾기(Ctrl+F)·공용 다중행 선택(전체·Shift 범위·선택 CSV)
    "live_g1_cad_view.py",          # CAD 뷰어 — 실시간 드로잉 좌표·그리드 오버레이 토글
    "live_g1_cad_edit.py",          # CAD 엔티티 편집 — 이동/삭제 라운드트립·DXF 재저장·영속(정리)
    "live_g1_cad_edit2.py",         # CAD 엔티티 편집 2차 — 복사(+1)·회전 90°·미러(길이 보존·반사 항등식)
    "live_g1_cad_marquee.py",       # CAD 마퀴 다중 선택 + 일괄 편집(박스 선택→🗑 일괄 삭제·다중 op 배열)
    "live_g1_cad_draw.py",          # CAD 자유 작도 — line/circle/rect 생성→DXF 추가·영속(UI 드래그)
    "live_g1_cad_plot.py",          # CAD 축척 인쇄 — 1:scale 벡터 PDF(A4/A3·가로세로·기본축척·404)
    "live_g1_cad_snap.py",          # CAD 객체 스냅 + Ortho — 끝점/중점 스냅 작도·Shift 축정렬(정확 좌표)
    "live_g1_cad_trim.py",          # CAD 트림/연장 — 경계선 교점으로 끝점 단축/연장·평행 422·영속
    "live_g3_atp.py",               # 재고 예약/할당(ATP) — 예약·가용 초과 409·목록·해제·pr-items available
    "live_g3_supplier_eval.py",     # 공급처 평가/등급 — 가중 총점·등급·upsert·마스터 반영(psql 정리)
    "live_g5_ui_overflow.py",       # UI 회귀 — 감사 이중 스크롤 제거·⚙ 컬럼 메뉴 fixed(클리핑 회피)
    "live_g3_xcode.py",             # X-code 검토 — PENDING 대기열·승인/반려·표준 제외·재검토 409·422
    "live_g3_product_master.py",    # 제품 코드 마스터 CRUD — 생성/중복 409/상태 전이/참조 삭제 409
    "live_g2_paging.py",            # 그리드 페이지네이션 — 100행/페이지·페이저·전체 다중선택·찾기 재페이지
    "live_g2_colprefs.py",          # 그리드 컬럼 리사이즈·순서 변경 영속(prefKey)·초기화
    "live_g3_report_center.py",     # Report Center — 카탈로그·PCR 보고서 PDF(RPT-07)·404
    "live_g1_design_edit.py",       # Design Editor CAD 명령 툴바 — 부품도 실체화·복사/삭제 편집·편집모드 활성
    "live_g1_dim_block.py",         # CAD 치수(DI)·블록(REG) 삽입 — 치수선+거리텍스트·라벨박스·레이어·영속
    "live_g3_calendar.py",          # 근무일/휴일 캘린더 — 공휴일 CRUD·영업일 계산·납기·마일스톤 workdaysLeft
    "live_g3_finance.py",           # 다통화/환율+세금엔진 — 환율 CRUD·세금코드·세액·KRW 환산·미등록 422
    "live_quote_tax.py",            # 견적 통화·세액 자동적재 — 견적 확정 통화 환산·세액·목록 breakdown·422
    "live_g3_bulk_import.py",       # 핵심 마스터 대량 import — 거래처/부품 xlsx 등록·중복 거부·헤더 422(psql 정리)
    "live_g3_roles.py",             # 역할 생성/삭제 — 커스텀 생성·예약/중복 409·내장/배정 삭제 409(edim 복원)
    "live_f9_escape.py",            # 다이얼로그 Escape 표준 — 5종 닫힘·전파 차단
    "live_f10_ux.py",               # 탭 오버플로·KPI 드릴다운·승인함 필터
    "live_security.py",
    "live_dev_requirements.py",   # 개발서버 전용 — 요구사항 접수 모달
]

env = {**os.environ, "PYTHONUTF8": "1", "BASE": "https://edim.seekerslab.com/"}
results: list[tuple[str, bool, str]] = []

# C7 — 배포-준비 대기 (배포 창 충돌 방지). SKIP_WAIT=1 로 생략 가능.
if os.getenv("SKIP_WAIT") != "1":
    print("배포-준비 확인 (/health db:true) …")
    wait_ready()


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
