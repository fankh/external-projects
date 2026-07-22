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
    "live_pw_sweep.py",         # PW 통합 스윕 — 전 화면 로드·상호작용·쓰기/결재 왕복·명령줄 (2026-07-19)
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
    "live_g1_cad_snap2.py",         # CAD 교차점 스냅 + Polar 45° — 교점 정확 스냅·Shift 45° 각도 정렬
    "live_g1_cad_trim.py",          # CAD 트림/연장 — 경계선 교점으로 끝점 단축/연장·평행 422·영속
    "live_g3_atp.py",               # 재고 예약/할당(ATP) — 예약·가용 초과 409·목록·해제·pr-items available
    "live_g3_supplier_eval.py",     # 공급처 평가/등급 — 가중 총점·등급·upsert·마스터 반영(psql 정리)
    "live_g5_ui_overflow.py",       # UI 회귀 — 감사 이중 스크롤 제거·⚙ 컬럼 메뉴 fixed(클리핑 회피)
    "live_g3_xcode.py",             # X-code 검토 — PENDING 대기열·승인/반려·표준 제외·재검토 409·422
    "live_g3_product_master.py",    # 제품 코드 마스터 CRUD — 생성/중복 409/상태 전이/참조 삭제 409
    "live_g2_paging.py",            # 그리드 페이지네이션 — 100행/페이지·페이저·전체 다중선택·찾기 재페이지
    "live_g2_colprefs.py",          # 그리드 컬럼 리사이즈·순서 변경 영속(prefKey)·초기화
    "live_g2_ctxmenu.py",           # 그리드 우클릭 컨텍스트 메뉴 — 셀/행 복사(클립보드)·rowActions
    "live_g2_inline_edit.py",       # 그리드 인라인 셀 편집 — 더블클릭 편집·Enter 영속·Esc 취소
    "live_g3_report_center.py",     # Report Center — 카탈로그·PCR 보고서 PDF(RPT-07)·404
    "live_g1_design_edit.py",       # Design Editor CAD 명령 툴바 — 부품도 실체화·복사/삭제 편집·편집모드 활성
    "live_g1_dim_block.py",         # CAD 치수(DI)·블록(REG) 삽입 — 치수선+거리텍스트·라벨박스·레이어·영속
    "live_g3_calendar.py",          # 근무일/휴일 캘린더 — 공휴일 CRUD·영업일 계산·납기·마일스톤 workdaysLeft
    "live_g3_finance.py",           # 다통화/환율+세금엔진 — 환율 CRUD·세금코드·세액·KRW 환산·미등록 422
    "live_quote_tax.py",            # 견적 통화·세액 자동적재 — 견적 확정 통화 환산·세액·목록 breakdown·422
    "live_quote_pdf_tax.py",        # 견적서 PDF 통화·세액 서식 — render.pdf 통화/공급가액/세액 표기
    "live_g3_bulk_import.py",       # 핵심 마스터 대량 import — 거래처/부품 xlsx 등록·중복 거부·헤더 422(psql 정리)
    "live_g3_roles.py",             # 역할 생성/삭제 — 커스텀 생성·예약/중복 409·내장/배정 삭제 409(edim 복원)
    "live_f9_escape.py",            # 다이얼로그 Escape 표준 — 5종 닫힘·전파 차단
    "live_f10_ux.py",               # 탭 오버플로·KPI 드릴다운·승인함 필터
    "live_shell_mdi_login.py",      # MDI 파라미터 다중 인스턴스·로그인 부가 요소
    "live_wiring_actions.py",       # 미배선 API 배선 (뮤테이션) — 삭제/회수/초대/batch/BOM 편집
    "live_wiring_views.py",         # 미배선 API 배선 (조회 뷰) — 이동원장/요약/계산기/상세/영향도/해석/Δ
    "live_menu_p2.py",              # 메뉴정의서 P2 — 공지 발송·번역 일괄 Export/Import
    "live_hardening.py",            # 재감사 완주 — Run is_test·패키지 워터마크·Table 낙관적 잠금
    "live_triage.py",               # 신규요구 트리아지 — Snapshot·Handoff 상태기계·Reset·dryRun·Package·export
    "live_multitenant.py",          # 멀티테넌시 격리 (1.2) — 세션 테넌트·데이터 격리·토큰 호환
    "live_tenant_isolation.py",     # 교차 테넌트 실증 (2.9) — 남의 자원 ID 직접 접근 전량 차단
    "live_platform_tenant.py",      # 고객사 프로비저닝 (1.3) — 온보딩·계약 게이트·플랫폼 2계층
    "live_info_access.py",          # 정보 접근 권한·마스킹 (1.5) — 역할 규칙·다운로드 차단·임시 열람
    "live_snapshot.py",             # Snapshot 체계 (1.7) — 고정·재현 검증·drift·Handoff 연결
    "live_process_nav.py",          # 좌측 프로세스 패널 (2.0) — 시드·편집·순서·권한
    "live_head_registry.py",        # Head Registry (4.0) — 권한 표시·상태기계·게시 게이트·System 가드
    "live_accordion_host.py",       # 우측 Accordion Template Host (4.1) — 개별 접기·상태 보존
    "live_product_builder.py",      # Product Code Builder (2.2) — 승인 조합 전용·해시·Rev drift
    "live_bom_basis.py",            # BOM 전개 근거 (2.7) — 관계 Revision 고정·이동 감지·순환/테넌트 가드
    "live_slot_map.py",             # 관계 슬롯 매핑 (4.6) — Mother→Child 전개 기준·XOR·전개 전파
    "live_rccs_setup.py",           # RCCS Set-up (4.8~5.0) — Item Head 자동·그룹 유형·Family Scope
    "live_action_verbs.py",         # 작업 권한 동사 (5.2) — 승인/배포 분리·미설정=허용 규약
    "live_std_tree.py",             # 표준/고객 트리 분리 (5.4) — 표준 노드 편집 409·하위 확장 허용
    "live_toolbox_package.py",      # Toolbox Package (5.6) — 상태기계·게시본 불변·새 버전·위험도
    "live_templet_library.py",      # Template Library (6.4) — 원본 읽기전용·복사 계보·부분 Lock·영향분석
    "live_binding_contract.py",     # Binding Contract (6.6) — DB 직접 참조 409·미등록 422·오탐 없음
    "live_command_binding.py",     # Command Binding (6.8) — 버튼=Command·Context ID 강제
    "live_macro_graph.py",         # Macro 5-View Graph (7.0) — 정본 Graph·stale 뷰 지목
    "live_support_access.py",      # Support 접근·이중 승인 (7.4) — 범위/기간 제한·감사·순서 강제
    "live_drawing_job.py",         # Drawing Run Job (7.6) — Snapshot 근거 재생성·결정성·바인딩 422
    "live_setup_lock.py",          # Set-up Lock·다중 사용자 세션 (7.8) — 게시/drift·자원 점유 409
    "live_erp_workflow.py",        # ERP Domain/Process/Workflow 선반영 (7.9) — 카탈로그·게시 그래프 강제
    "live_customer_logo.py",      # 고객 로고 참조 모델 (8.0) — 승인본만 표시·문서 참조
    "live_ai_prep.py",             # AI 학습·RCCS 정리 거버넌스 (9.0) — 교차 테넌트 차단·항상 Draft·역할 분리
    "live_security_anomaly.py",    # 보안 이상 승격 (9.3) — 로그인 실패·자동 잠금 → sys_anomaly
    "live_event_complete.py",      # 업무 이벤트 완료 권한·기록 (8.2) — 담당자 확인·감사
    "live_cost_masking.py",        # 원가·견적 열람 통제 일관성 (8.3) — 전 경로 마스킹·PDF 다운로드 차단
    "live_file_role.py",            # 산출물/원본 이원화 (3.3) — OUTPUT 불변·동명 저장 격리·역할 노출
    "live_security.py",
    "live_dev_requirements.py",   # 개발서버 전용 — 요구사항 접수 모달
]

env = {**os.environ, "PYTHONUTF8": "1", "BASE": "https://edim.seekerslab.com/"}
results: list[tuple[str, bool, str]] = []

# C7 — 배포-준비 대기 (배포 창 충돌 방지). SKIP_WAIT=1 로 생략 가능.
if os.getenv("SKIP_WAIT") != "1":
    print("배포-준비 확인 (/health db:true) …")
    wait_ready()

# 8.11 — 실행 전 실 데이터 지문을 떠 둔다. 스위트가 자기 자원만 만들고 지웠다면
# 끝난 뒤 지문이 같아야 한다(정리 문구가 아니라 DB 로 확인).
print("실 데이터 기준 지문 저장 …")
subprocess.run([sys.executable, os.path.join(HERE, "check_live_residue.py"), "--save"],
               env=env, capture_output=True, text=True, encoding="utf-8",
               errors="replace", timeout=300)


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

# check_tenant_scope — 정적 게이트 (서버 불요, CI 잡 tenant-scope 와 동일 검사)
print(f"\n{'=' * 60}\n▶ check_tenant_scope.py (static)\n{'=' * 60}")
p = subprocess.run([sys.executable, os.path.join(HERE, "check_tenant_scope.py")],
                   env=env, capture_output=True, text=True, encoding="utf-8",
                   errors="replace", timeout=120)
print(((p.stdout or "") + (p.stderr or ""))[-1500:])
results.append(("check_tenant_scope.py", p.returncode == 0, ""))

# check_fk_indexes — 인덱스 없는 FK 게이트 (9.1, 서버 대상)
print(f"\n{'=' * 60}\n▶ check_fk_indexes.py (live)\n{'=' * 60}")
p = subprocess.run([sys.executable, os.path.join(HERE, "check_fk_indexes.py")],
                   env=env, capture_output=True, text=True, encoding="utf-8",
                   errors="replace", timeout=120)
print(((p.stdout or "") + (p.stderr or ""))[-1500:])
results.append(("check_fk_indexes.py", p.returncode == 0, ""))

# check_live_residue — 실 데이터 잔재 (8.11): 스위트가 남긴 변화가 있으면 실패
print(f"\n{'=' * 60}\n▶ check_live_residue.py (live)\n{'=' * 60}")
p = subprocess.run([sys.executable, os.path.join(HERE, "check_live_residue.py")],
                   env=env, capture_output=True, text=True, encoding="utf-8",
                   errors="replace", timeout=300)
print(((p.stdout or "") + (p.stderr or ""))[-2000:])
results.append(("check_live_residue.py", p.returncode == 0, ""))

# check_verb_guard — 승인·배포 동사 강제 정적 게이트 (8.10, 서버 불요)
print(f"\n{'=' * 60}\n▶ check_verb_guard.py (static)\n{'=' * 60}")
p = subprocess.run([sys.executable, os.path.join(HERE, "check_verb_guard.py")],
                   env=env, capture_output=True, text=True, encoding="utf-8",
                   errors="replace", timeout=120)
print(((p.stdout or "") + (p.stderr or ""))[-1500:])
results.append(("check_verb_guard.py", p.returncode == 0, ""))

# check_cursor_reuse — 커서 결과셋 무효화 정적 게이트 (8.6, 서버 불요)
print(f"\n{'=' * 60}\n▶ check_cursor_reuse.py (static)\n{'=' * 60}")
p = subprocess.run([sys.executable, os.path.join(HERE, "check_cursor_reuse.py")],
                   env=env, capture_output=True, text=True, encoding="utf-8",
                   errors="replace", timeout=120)
print(((p.stdout or "") + (p.stderr or ""))[-1500:])
results.append(("check_cursor_reuse.py", p.returncode == 0, ""))

# check_governance — 거버넌스 정의서 드리프트 게이트 (#71, 서버 불요)
print(f"\n{'=' * 60}\n▶ check_governance.py (static)\n{'=' * 60}")
p = subprocess.run([sys.executable, os.path.join(HERE, "check_governance.py")],
                   env=env, capture_output=True, text=True, encoding="utf-8",
                   errors="replace", timeout=120)
print(((p.stdout or "") + (p.stderr or ""))[-1500:])
results.append(("check_governance.py", p.returncode == 0, ""))

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
