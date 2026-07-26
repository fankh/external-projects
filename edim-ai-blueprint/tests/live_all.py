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


def quick_ready() -> None:
    """9.48 — 스위트별 배포창 가드: 1회 프로브로 건강하면 통과(~0.1s),
    아니면 wait_ready() 로 재기동 창이 닫힐 때까지 대기.

    9.46 플릿 실측: 시작 시 1회 확인만으로는 플릿 중간에 autodeploy 가 겹치면
    그 구간 스위트들이 503 으로 오탐(6종) — 재시도도 같은 창 안이라 무효였다.
    """
    try:
        with urllib.request.urlopen(HEALTH, timeout=5) as r:
            if b'"db":true' in r.read():
                return
    except Exception:  # noqa: BLE001
        pass
    print("배포창 감지 — /health 회복 대기 …")
    wait_ready(timeout=300)

RETRY_BACKOFF_SEC = 20   # 재시도 전 유휴 — 부하 구간을 벗어나기 위한 최소 간격

SUITES = [
    "live_pw_sweep.py",         # PW 통합 스윕 — 전 화면 로드·상호작용·쓰기/결재 왕복·명령줄 (2026-07-19)
    "live_b15_regression.py",   # 인증·RBAC 먼저 (다른 스위트의 전제)
    "live_password_recovery.py", # 해시 승격·비밀번호 복구 (9.96/9.97) — 인증 직후
    "live_u18_node_copy.py",    # Hierarchy 구조 복제 (10.0/10.1) — 트리 쓰기 연산
    "live_u18_node_move.py",    # Hierarchy 노드 이동 (10.4) — 하위 주소 연쇄·순환 가드
    "live_bom_cycle.py",        # BOM 간접 순환 차단·전개 무결성 정직 보고 (10.9)
    "live_structure_integrity.py",  # 계층 정합 상시 감시 (11.3) — 실데이터 손상 조기 발견
    "live_approval_policy.py",  # 요청자 본인 결정 금지 정책 (11.4) — 켰다가 반드시 되돌림
    "live_cost_basis.py",       # 원가 근거 완전성 (11.6) — 단가 미해결이 전 경로에 고지되는지
    "live_quote_basis.py",      # 견적 확정의 근거 스냅샷·정책 차단 (11.9)
    "live_business_date.py",    # 업무 날짜 기준 일치 (12.1) — UTC/KST 하루 밀림 감시
    "live_run_product_scope.py", # Run 이 견적안 제품을 따르는지 (12.6) — 제품 2종 검증
    "live_cpq_product_pick.py", # C-1 제품 선택 (12.8, 규격 CPQ-001) — 화면 고정 해소
    "live_doc_revision.py",     # 문서 개정 버전 자동 증가 (13.1, 규격 DOC-001)
    "live_approval_delegate.py", # 승인 위임·결정자 기록 (13.5, 규격 ADM-003)
    "live_audit_trail.py",      # 감사 추적·알림 도달 (13.8) — 쓰기가 이력에 남는지
    "live_session_notify.py",   # 세션 즉시 차단·알림 정직 보고 (15.3)
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
    "live_project_race.py",        # 프로젝트 PS 채번 경쟁 안전 (9.18) — 동시 생성 전량 성공·고유
    "live_numbering_race.py",      # ECO 채번 경쟁 안전 (9.19) — 5종 채번기 동형 회귀 방지
    "live_list_caps.py",           # 리스트 안전 상한 (9.20) — 트랜잭션 그리드 7종 회로차단
    "live_date_validation.py",     # 날짜 파라미터 검증 (9.32) — 오형식 500→422
    "live_export_caps.py",         # 내보내기 안전 상한 (9.21) — export OOM 회로차단·절단 고지
    "live_master_search.py",       # 마스터 대장 서버측 검색 (9.23) — /parts·/companies q 부분일치
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
    "live_ai_audit.py",            # Guide AI 질의 감사 (9.14) — 요구 #64 질문·답변 감사
    "live_ai_macro_draft.py",     # Macro AI Draft 무상태 (9.15) — 요구 #65 항상 Draft
    "live_security_anomaly.py",    # 보안 이상 승격 (9.3) — 로그인 실패·자동 잠금 → sys_anomaly
    "live_system_status.py",       # 운영 준비 상태 (9.6) — migrationHead·운영자 전용
    "live_security_headers.py",    # 보안 응답 헤더 (9.8) — HSTS·nosniff·X-Frame·Referrer·버전숨김
    "live_event_complete.py",      # 업무 이벤트 완료 권한·기록 (8.2) — 담당자 확인·감사
    "live_cost_masking.py",        # 원가·견적 열람 통제 일관성 (8.3) — 전 경로 마스킹·PDF 다운로드 차단
    "live_file_role.py",            # 산출물/원본 이원화 (3.3) — OUTPUT 불변·동명 저장 격리·역할 노출
    "live_security.py",
    "live_dev_requirements.py",   # 개발서버 전용 — 요구사항 접수 모달
    "live_assistant_thread.py",   # U28 대화 이력 UI (9.51) — 스레드 누적·후속 질의·새 대화
    "live_u17_error_check.py",    # U17 잔여 (9.55) — 설계 오류조건 판정·경고 연동 (자체 원복)
    "live_u19_pcr_compare.py",    # U19 잔여 (9.56) — PCR 사업유형 다열 비교 (조회 전용)
    "live_u6_u20_layout.py",      # U6·U20 잔여 (9.61~62) — 자리표시자 배치 영속·child 도면 연결 (자체 원복)
    "live_ai_degrade.py",         # AI 정직 열화 (9.67) — 크레딧 유무 무관: 화면 무손상·사유 병기
    "live_demo_scenario.py",      # 시연 시나리오 8단계 (9.75) — 고객 데모 경로 상시 보증 (조회 전용)
]

env = {**os.environ, "PYTHONUTF8": "1", "BASE": "https://edim.seekerslab.com/"}
results: list[tuple[str, bool, str]] = []

# 9.11 — 플릿 동시 실행 방지 락. 세션 재개 시 이전 플릿이 자동 재실행되며 새 플릿과 겹쳐
# 공유 서버·테스트 테넌트를 동시에 두드려 시드 데이터를 손상시킨 사고가 반복됐다(BOM 행·계정 유실).
# 다른 플릿이 도는 중이면(락 40분 이내) 시작을 거부한다. FORCE_FLEET=1 로 우회.
_LOCK = os.path.join(HERE, ".fleet_lock")
if os.getenv("FORCE_FLEET") != "1" and os.path.exists(_LOCK):
    age = time.time() - os.path.getmtime(_LOCK)
    if age < 40 * 60:
        try:
            who = open(_LOCK, encoding="utf-8").read().strip()
        except Exception:  # noqa: BLE001
            who = "?"
        print(f"ABORT — 다른 플릿이 실행 중 (락 {int(age)}s 전 · {who}). "
              "동시 실행은 데이터 충돌을 유발한다. 끝난 뒤 재시도하거나 FORCE_FLEET=1 로 우회.")
        raise SystemExit(2)
import atexit  # noqa: E402
with open(_LOCK, "w", encoding="utf-8") as _lf:
    _lf.write(f"pid={os.getpid()} at={time.strftime('%H:%M:%S')}")
atexit.register(lambda: os.path.exists(_LOCK) and os.remove(_LOCK))

# C7 — 배포-준비 대기 (배포 창 충돌 방지). SKIP_WAIT=1 로 생략 가능.
if os.getenv("SKIP_WAIT") != "1":
    print("배포-준비 확인 (/health db:true) …")
    wait_ready()

# 9.36 — 시드 무결성 자기치유: 이전 중단 플릿이 훼손한 핵심 시드(dwg_bom)를 지문 저장 전에
# 복원해, 항상 정상 시드에서 출발하고 기준 지문도 정상 상태로 뜬다(멱등 — 정상이면 0행).
print("시드 무결성 확인 …")
_heal = subprocess.run([sys.executable, os.path.join(HERE, "seed_heal.py")],
                       env=env, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=120)
print((_heal.stdout or "").strip() or "(seed_heal 무출력)", flush=True)

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
    quick_ready()   # 9.48 — 플릿 중간 배포창(재기동 503)과 스위트 충돌 방지
    passed, tail = run_suite(suite)
    # 순차 13개 브라우저 스위트 부하로 인한 산발 타임아웃 — 1회 재시도 (재시도 여부는 표기)
    if not passed:
        # 9.89 — 재시도 전에 서버가 한숨 돌리게 둔다.
        # 종전엔 곧바로 재시도해서 **같은 부하 구간 안**에 다시 걸렸다(2026-07-25 pw_sweep 실증:
        # 플릿 안 2회 연속 실패 → 단독 실행은 7/7 통과). quick_ready 는 배포창(503)만 보고
        # 부하는 못 보므로, 짧은 유휴를 둬야 재시도가 실제로 다른 조건이 된다.
        print(f"\n--- {suite} 재시도 (부하 플레이크 가능) — {RETRY_BACKOFF_SEC}s 후 ---")
        time.sleep(RETRY_BACKOFF_SEC)
        quick_ready()   # 503 기인 실패라면 창이 닫힌 뒤 재시도해야 유효
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

# check_test_syntax — 검증 코드 문법 게이트 (14.2, 서버 불요)
print(f"\n{'=' * 60}\n▶ check_test_syntax.py (static)\n{'=' * 60}")
p = subprocess.run([sys.executable, os.path.join(HERE, "check_test_syntax.py")],
                   env=env, capture_output=True, text=True, encoding="utf-8",
                   errors="replace", timeout=120)
print(((p.stdout or "") + (p.stderr or ""))[-1500:])
results.append(("check_test_syntax.py", p.returncode == 0, ""))

# check_audit_coverage — 감사 기록 커버리지 게이트 (13.8, 서버 불요)
print(f"\n{'=' * 60}\n▶ check_audit_coverage.py (static)\n{'=' * 60}")
p = subprocess.run([sys.executable, os.path.join(HERE, "check_audit_coverage.py")],
                   env=env, capture_output=True, text=True, encoding="utf-8",
                   errors="replace", timeout=120)
print(((p.stdout or "") + (p.stderr or ""))[-1500:])
results.append(("check_audit_coverage.py", p.returncode == 0, ""))

# check_governance — 거버넌스 정의서 드리프트 게이트 (#71, 서버 불요)
print(f"\n{'=' * 60}\n▶ check_governance.py (static)\n{'=' * 60}")
p = subprocess.run([sys.executable, os.path.join(HERE, "check_governance.py")],
                   env=env, capture_output=True, text=True, encoding="utf-8",
                   errors="replace", timeout=120)
print(((p.stdout or "") + (p.stderr or ""))[-1500:])
results.append(("check_governance.py", p.returncode == 0, ""))

# check_i18n_en — 라이브 대상 (BASE env 지원)
print(f"\n{'=' * 60}\n▶ check_i18n_en.py (live)\n{'=' * 60}")
quick_ready()   # 9.48 — 라이브 브라우저 체크도 배포창 가드
p = subprocess.run([sys.executable, os.path.join(HERE, "check_i18n_en.py")],
                   env={**env, "BASE": "https://edim.seekerslab.com/cpq"},
                   capture_output=True, text=True, encoding="utf-8", errors="replace",
                   timeout=900)
print(((p.stdout or "") + (p.stderr or ""))[-1500:])
results.append(("check_i18n_en.py", p.returncode == 0, ""))

# check_a11y_names — 인터랙티브 접근가능 이름 (9.40, Playwright 62화면)
print(f"\n{'=' * 60}\n▶ check_a11y_names.py (live)\n{'=' * 60}")
quick_ready()   # 9.48 — 라이브 브라우저 체크도 배포창 가드
p = subprocess.run([sys.executable, os.path.join(HERE, "check_a11y_names.py")],
                   env=env, capture_output=True, text=True, encoding="utf-8",
                   errors="replace", timeout=900)
print(((p.stdout or "") + (p.stderr or ""))[-1500:])
results.append(("check_a11y_names.py", p.returncode == 0, ""))

print(f"\n{'=' * 60}\n라이브 스위트 요약\n{'=' * 60}")
failed = 0
for name, passed, tail in results:
    mark = "✅" if passed else "❌"
    print(f"{mark} {name:32s} {tail}")
    if not passed:
        failed += 1
print(f"\n{len(results) - failed}/{len(results)} suites green")
# 등록 대비 실행 수를 함께 보고한다 — 러너가 중간에 죽거나 스위트를 건너뛰면
# '실패 0건' 이 통과처럼 읽힌다(14.1 에서 실제로 그랬다). 결과가 없는 것은 통과가 아니다.
expected = len(SUITES)
executed = sum(1 for name, _, _ in results if name in SUITES)
if executed != expected:
    print(f"❌ 등록 {expected}개 중 {executed}개만 실행됨 — "
          f"누락 {expected - executed}개: "
          f"{[s for s in SUITES if s not in {n for n, _, _ in results}][:5]}")
    sys.exit(1)
sys.exit(1 if failed else 0)
