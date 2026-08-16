"""E2E 스위트 — 실제 브라우저로 핵심 폐쇄 루프를 검증한다 (Playwright).
smoke(SSR)·client_health(크래시)가 못 보는 '동작'을 본다: 결재 전파, 어댑터 채널의 업무 영향,
파일 업로드, 양식 개정 재산출, 재상신 생명주기, 스케줄러 자동 발화, 런타임 복구.

각 시나리오는 독립 서버(시드 초기화)에서 돌아 순서 간섭이 없다.
사용:  npm run build  후  python scripts/e2e_suite.py  (특정만: python scripts/e2e_suite.py sr settle)
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE_PORT = 3700  # 시나리오별 포트 = BASE_PORT + idx. 중단된 과거 실행이 남긴 유령 next 서버가 35xx·36xx 대를
                  # 점유(종료 불가·세션 격리)해 뒤쪽 시나리오가 바인드 타임아웃 나던 것을 회피 — 여유 대역으로 이동.
UPLOAD = ROOT / 'scripts' / '.e2e-upload.txt'
DATA = ROOT / 'scripts' / '.e2e-data.json'
EDU_DATA = ROOT / 'scripts' / '.e2e-edu-data.json'  # 교육 이수율 퇴사자 이력 회귀용 (v1.5.24)
FIN_DATA = ROOT / 'scripts' / '.e2e-fin-data.json'  # 집행률 확정 스코프 회귀용 (v1.5.25)
FYEAR_DATA = ROOT / 'scripts' / '.e2e-fyear-data.json'  # 일반 서약 year 필터 회귀용 (v1.5.32)
XKIND_DATA = ROOT / 'scripts' / '.e2e-xkind-data.json'  # export 크로스-kind 회귀용 (v1.5.25)
RREASON_DATA = ROOT / 'scripts' / '.e2e-rreason-data.json'  # 재상신 할일 사유텍스트 오마감 회귀용 (v1.5.47)
BACKUP_DATA = ROOT / 'scripts' / '.e2e-backup-data.json'  # 수동 배치 백업(스케줄러 off) 회귀용 (v1.5.48)
CHORPHAN_DATA = ROOT / 'scripts' / '.e2e-chorphan-data.json'  # 변경 재상신 교차-담당 고아 할일 회귀용 (v1.5.50)
EDUTGT_DATA = ROOT / 'scripts' / '.e2e-edutgt-data.json'  # 교육 이수율 대상(target) 스코프 회귀용 (v1.5.51)
RSPAN_DATA = ROOT / 'scripts' / '.e2e-rspan-data.json'  # 재택 경계월 인접 기간 이중 집계 회귀용 (v1.5.53)
RHIST_DATA = ROOT / 'scripts' / '.e2e-rhist-data.json'  # 결재 회전 이력 신원 게이트 회귀용 (v1.5.54)
DEDU_DATA = ROOT / 'scripts' / '.e2e-dedu-data.json'  # 대시보드 교육 미이수 대상 스코프 회귀용 (v1.5.55)
DPLG_DATA = ROOT / 'scripts' / '.e2e-dplg-data.json'  # 대시보드 일반 서약 타일 단일 원천 회귀용 (v1.5.55)
SMOV_DATA = ROOT / 'scripts' / '.e2e-smov-data.json'  # 통합 검색 런타임 메뉴권한 정합 회귀용 (v1.5.56)
ATDUP_DATA = ROOT / 'scripts' / '.e2e-atdup-data.json'  # 자동첨부 교차일 중복 방지 회귀용 (v1.5.57)
NCRASH_DATA = ROOT / 'scripts' / '.e2e-ncrash-data.json'  # 알림 배치 손상 title 할일 내성 회귀용 (v1.5.58)
APPLY_DATA = ROOT / 'scripts' / '.e2e-apply-data.json'  # 적용요청 상신 교차-기안자 고아 할일 회귀용 (v1.5.60)
INSP_ORPHAN_DATA = ROOT / 'scripts' / '.e2e-insporphan-data.json'  # 점검결과 재상신 교차-상신자 고아 할일 회귀용 (v1.5.79)
CHST_DATA = ROOT / 'scripts' / '.e2e-chst-data.json'  # channelStates 비불리언 값 검증 회귀용 (v1.5.80)
PROFISO_DATA = ROOT / 'scripts' / '.e2e-profiso-data.json'  # 프로필 스탬프 데이터 격리 회귀용 (v1.5.188)
ROT_ORPHAN_DATA = ROOT / 'scripts' / '.e2e-rotorphan-data.json'  # 회전 문서 교차-재상신자 고아 할일 회귀용 (v1.5.81)
SECBAD_DATA = ROOT / 'scripts' / '.e2e-secbad-data.json'  # secdata 이관 dept/pages 객체값 렌더 회귀용 (v1.5.83)
DPLGRESIGN_DATA = ROOT / 'scripts' / '.e2e-dplgresign-data.json'  # 부서서약 fresh 상신 과다마감 회귀용 (v1.5.84 AP3-3)
APPLYROUTE_DATA = ROOT / 'scripts' / '.e2e-applyroute-data.json'  # 적용요청 재상신 할일 라우팅 회귀용 (v1.5.85)
OPSSCOPE_DATA = ROOT / 'scripts' / '.e2e-opsscope-data.json'  # 대시보드 전사 스냅샷 런타임 메뉴권한 정합 회귀용 (v1.5.86)
SYSINC_DATA = ROOT / 'scripts' / '.e2e-sysinc-data.json'  # 시스템화면 장애 교차도메인 게이트 회귀용 (v1.5.87)
NOTICESCOPE_DATA = ROOT / 'scripts' / '.e2e-noticescope-data.json'  # 대시보드 공지 교차도메인 게이트 회귀용 (v1.5.87)
ROT_FRESH_DATA = ROOT / 'scripts' / '.e2e-rotfresh-data.json'  # 회전문서 신규 상신 과다마감 방지 회귀용 (v1.5.88 AP3-3)
PJDONE_DATA = ROOT / 'scripts' / '.e2e-pjdone-data.json'  # 프로젝트 완료 시 재서약 할일 정리 회귀용 (v1.5.89)
PJMEMB_DATA = ROOT / 'scripts' / '.e2e-pjmemb-data.json'  # 빈 명단 프로젝트 참여서약 집계 회귀용 (v1.5.89)
RMGHOST_DATA = ROOT / 'scripts' / '.e2e-rmghost-data.json'  # 인사연동 퇴사 재택 대상자 유령 미제출 회귀용 (v1.5.90)
AFDEFEAT_DATA = ROOT / 'scripts' / '.e2e-afdefeat-data.json'  # 필수 자동양식 파일명충돌 우회 회귀용 (v1.5.91)
QNAROLE_DATA = ROOT / 'scripts' / '.e2e-qnarole-data.json'  # QnA 담당 지정 역할 정합 회귀용 (v1.5.92)
DTNAN_DATA = ROOT / 'scripts' / '.e2e-dtnan-data.json'  # 손상 날짜 일수계산 NaN 렌더 방지 회귀용 (v1.5.93)
SRSUSP_DATA = ROOT / 'scripts' / '.e2e-srsusp-data.json'  # SR 중지(BA030014) 지연 제외 회귀용 (v1.5.96)


def login(pg, base, name):
    pg.goto(f'{base}/login', wait_until='networkidle')
    pg.click(f'.acct:has-text("{name}")')
    pg.wait_for_url('**/dashboard')


def approve_first(pg, base, needle):
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    row = pg.locator('tr', has_text=needle).first
    assert row.count() > 0, f'결재 수신 없음: {needle}'
    row.locator('button:has-text("승인")').click()
    pg.wait_for_load_state('networkidle')


# ── 시나리오 정의 ─────────────────────────────────────────────

def sc_pledge(pg, base, check):
    """서약 제출 → 할일 마감 → 대시보드 갱신"""
    login(pg, base, '김현우')
    stat = pg.locator('.stat', has_text='보안서약서')
    check('미제출' in stat.inner_text(), '대시보드 서약 미제출')
    pg.goto(f'{base}/pledge/my', wait_until='networkidle')
    pg.check('input[name=agree]')
    pg.click('button:has-text("서약서 제출")')
    pg.wait_for_selector('text=제출 완료', timeout=10000)
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    check('완료' in pg.locator('.stat', has_text='보안서약서').inner_text(), '제출 → 서약 스탯 완료')
    check('2026년 일반 보안서약서 제출' not in pg.locator('.card', has_text='나의 할일').inner_text(), '할일 자동 마감')

    # 요구사항 45행 — 재택근무 보안서약서 추가 제출 (일반과 구분된 서약 4종 중 하나)
    pg.goto(f'{base}/pledge/my', wait_until='networkidle')
    card = pg.locator('.card', has_text='재택근무 보안서약서')
    card.locator('input[name=agree]').check()
    card.locator('button:has-text("재택근무 서약 제출")').click()
    pg.wait_for_selector('.card:has-text("재택근무 보안서약서") >> text=제출 완료', timeout=10000)
    check('재택근무' in pg.locator('.card', has_text='내 서약 이력').inner_text(), '재택근무 서약 → 이력 반영')

    # 요구사항 46행 — 특별서약서(프로젝트): 참여 프로젝트 지정 동의 → 프로젝트 현황 서약 수 집계
    pj_card = pg.locator('.card', has_text='특별서약서 — 프로젝트 참여')
    pj_card.locator('select[name=projectRef]').select_option('PJ-2026-01')
    pj_card.locator('input[name=agree]').check()
    pj_card.locator('button:has-text("프로젝트 서약 제출")').click()
    pg.wait_for_selector('.card:has-text("프로젝트 참여") >> text=ERP 리포트 모듈 구축', timeout=10000)
    check('프로젝트' in pg.locator('.card', has_text='내 서약 이력').inner_text(), '프로젝트 서약 → 이력 반영')

    # 결재 시트 11번 — 부서담당이 부서 서약 현황 전체를 결재상신하고 결재선(박정호)이 승인한다
    login(pg, base, '이수진')
    pg.goto(f'{base}/pledge/dept', wait_until='networkidle')
    pg.click('button:has-text("현황 결재상신")')
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    check('[보안서약서] 경영지원팀' in pg.locator('.card', has_text='상신함').inner_text(), '부서 서약 현황 상신 (DPS 묶음)')
    login(pg, base, '박정호')
    approve_first(pg, base, '[보안서약서] 경영지원팀')
    # 프로젝트 현황 — 김현우의 참여 서약이 집계된다 (요구사항 46행)
    pg.goto(f'{base}/projects/status', wait_until='networkidle')
    check('1건' in pg.locator('tr', has_text='ERP 리포트 모듈 구축').inner_text(), '프로젝트 참여 서약 수 집계')
    login(pg, base, '이수진')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    row = pg.locator('.card', has_text='상신함').locator('tr', has_text='[보안서약서] 경영지원팀')
    check('승인' in row.inner_text(), '부서 서약 현황 결재 승인')


def sc_sr(pg, base, check):
    """SR 신청(첨부) → 승인 → CI 배정 → 반려 재상신 생명주기"""
    login(pg, base, '김현우')
    pg.goto(f'{base}/sr/new', wait_until='networkidle')
    pg.select_option('select[name=kind]', '데이터')
    pg.fill('input[name=system]', 'ERP')
    pg.fill('input[name=title]', 'E2E 데이터 추출')
    pg.set_input_files('input[name=file]', str(UPLOAD))
    pg.click('button:has-text("결재 상신")')
    pg.wait_for_url('**/sr/requests**')
    check('📎1' in pg.locator('tr', has_text='E2E 데이터 추출').inner_text(), '신청 첨부 뱃지')

    login(pg, base, '박정호')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    row = pg.locator('tr', has_text='E2E 데이터 추출')
    check('📎1' in row.inner_text(), '결재함 첨부 표시')
    row.locator('input[name=reason]').fill('근거 보완 필요')
    row.locator('button:has-text("반려")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '김현우')
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    check('보완 후 재상신' in pg.content(), '반려 → 재상신 할일')
    pg.goto(f'{base}/sr/requests', wait_until='networkidle')
    pg.locator('tr', has_text='E2E 데이터 추출').locator('button:has-text("재상신")').click()
    pg.wait_for_load_state('networkidle')

    # 재상신 문서 상세 — 이전 회차(반려) 이력과 사유가 함께 보이고, 상세에서 승인한다
    login(pg, base, '박정호')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    pg.locator('a', has_text='[재상신] E2E 데이터 추출').first.click()
    pg.wait_for_selector('text=문서 상세', timeout=10000)
    detail = pg.locator('.card', has_text='문서 상세')
    check('이전 회차 결재' in detail.inner_text(), '재상신 상세에 이전 회차 이력')
    check('근거 보완 필요' in detail.inner_text(), '이전 회차 반려 사유 표시')
    detail.locator('button:has-text("승인")').click()
    pg.wait_for_load_state('networkidle')
    # SR 승인 → 업무담당(박정호)에게 'SR 처리'(CI 배정) 할일 생성 (반쪽 루프 복원 — v1.5.31)
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    ci_after_approve = pg.locator('.card', has_text='미처리 할일').locator('tr', has_text='CI 배정').count()
    pg.goto(f'{base}/sr/ci', wait_until='networkidle')
    check('E2E 데이터 추출' in pg.content(), '재상신 승인 → CI배정')

    # BA 배정 시 검토 증적 첨부 — SR 번호(pk) 하나로 신청·BA 첨부가 합쳐진다 (첨부 시트)
    row = pg.locator('tr', has_text='E2E 데이터 추출')
    row.locator('input[type=file]').set_input_files(str(UPLOAD))
    row.locator('button:has-text("배정 · 착수")').click()
    pg.wait_for_load_state('networkidle')
    # assignCi 가 'SR 처리' 할일을 배정과 함께 닫는다 — 승인 생성분이 1건 줄어야(생성→마감 루프 완성)
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    ci_after_assign = pg.locator('.card', has_text='미처리 할일').locator('tr', has_text='CI 배정').count()
    check(ci_after_assign == ci_after_approve - 1, f'SR 처리 할일 생성→assignCi 마감 루프 (CI배정 {ci_after_approve}→{ci_after_assign})')
    pg.goto(f'{base}/sr/manage', wait_until='networkidle')
    check('📎2' in pg.locator('tr', has_text='E2E 데이터 추출').inner_text(), 'BA 첨부 → SR pk 공유 뱃지(📎2)')

    # 결재 없는 CI 직접 접수 (요구사항 25행) — 접수 → 처리중 → 완료(처리 내용) 이력
    pg.goto(f'{base}/sr/ci', wait_until='networkidle')
    intake = pg.locator('.card', has_text='CI SR 접수')
    intake.locator('select[name=category]').select_option('보안')
    intake.locator('input[name=title]').fill('E2E 무결재 접수 건')
    intake.locator('input[name=requester]').fill('관제센터')
    intake.locator('button:has-text("접수")').click()
    pg.wait_for_selector('tr:has-text("E2E 무결재 접수 건")', timeout=10000)
    row = pg.locator('tr', has_text='E2E 무결재 접수 건')
    row.locator('button:has-text("처리 시작")').click()
    pg.wait_for_selector('tr:has-text("E2E 무결재 접수 건"):has-text("처리중")', timeout=10000)
    row = pg.locator('tr', has_text='E2E 무결재 접수 건')
    row.locator('input[name=result]').fill('예외 등록 완료')
    row.locator('button:has-text("완료")').click()
    pg.wait_for_selector('tr:has-text("E2E 무결재 접수 건"):has-text("예외 등록 완료")', timeout=10000)
    check('완료' in pg.locator('tr', has_text='E2E 무결재 접수 건').inner_text(), 'CI 직접 접수 → 처리 이력 완료')

    # 임시저장 (제품안내서 II장) — 상신 없이 작성중 보관, '상신' 버튼으로 이어진다
    login(pg, base, '김현우')
    pg.goto(f'{base}/sr/new', wait_until='networkidle')
    pg.select_option('select[name=kind]', '데이터')
    pg.fill('input[name=system]', 'ERP')
    pg.fill('input[name=title]', 'E2E 임시저장 건')
    pg.click('button:has-text("임시저장")')
    pg.wait_for_url('**/sr/requests**')
    row = pg.locator('tr', has_text='E2E 임시저장 건')
    check('작성중' in row.inner_text() and row.locator('button:has-text("상신")').count() == 1, '임시저장 → 작성중 보관 + 상신 버튼')


def sc_withdraw(pg, base, check):
    """상신취소(회수) — 기안자 회수 → SR 작성중 복원 → 결재자 대기·할일 제외 → 재상신 → 승인"""
    import re
    login(pg, base, '김현우')
    pg.goto(f'{base}/sr/new', wait_until='networkidle')
    pg.select_option('select[name=kind]', '데이터')
    pg.fill('input[name=system]', 'ERP')
    pg.fill('input[name=title]', 'E2E 상신취소 검증')
    pg.click('button:has-text("결재 상신")')
    pg.wait_for_url('**/sr/requests**')

    # 상신함 상세에서 상신취소 — 결재번호(AP)를 상세 제목에서 캡처해 할일 마감 검증에 쓴다
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    pg.locator('.card', has_text='상신함').locator('a', has_text='E2E 상신취소 검증').first.click()
    pg.wait_for_selector('text=문서 상세', timeout=10000)
    detail = pg.locator('.card', has_text='문서 상세')
    m = re.search(r'문서 상세 — (AP-\d+-\d+)', detail.inner_text())
    apid = m.group(1) if m else ''
    detail.locator('button:has-text("상신취소")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    row = pg.locator('.card', has_text='상신함').locator('tr', has_text='E2E 상신취소 검증')
    check('회수' in row.inner_text(), '상신취소 → 문서 상태 회수')

    # SR 은 임시저장(작성중)으로 복원된다 — 반려와 달리 재상신 할일 없이 업무 화면에서 다시 상신
    pg.goto(f'{base}/sr/requests', wait_until='networkidle')
    check('작성중' in pg.locator('tr', has_text='E2E 상신취소 검증').inner_text(), '회수 → SR 작성중(임시저장) 복원')

    # 결재자 쪽 — 수신 대기에서 빠지고 '결재' 할일도 닫힌다
    login(pg, base, '박정호')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    check('E2E 상신취소 검증' not in pg.locator('.card', has_text='수신함 — 결재 대기').inner_text(), '회수 → 결재 대기 제외')
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    check(bool(apid) and f'{apid} 결재 처리' not in pg.locator('.card', has_text='미처리 할일').inner_text(), '회수 → 결재 할일 마감')

    # 감사 이력 — 회수가 결재 생명주기 추적에 남는다
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/settings/audit', wait_until='networkidle')
    check('결재 회수' in pg.content(), '감사 이력에 결재 회수 기록')

    # 회수 후 재상신은 처음 상신과 동일 경로 — [재상신] 접두 없이 상신되고 승인 → CI배정
    login(pg, base, '김현우')
    pg.goto(f'{base}/sr/requests', wait_until='networkidle')
    pg.locator('tr', has_text='E2E 상신취소 검증').locator('button:has-text("상신")').click()
    # 서버 액션 재렌더를 기다린다 — networkidle 은 POST 전에 통과할 수 있다
    pg.wait_for_selector('tr:has-text("E2E 상신취소 검증"):has-text("결재중")', timeout=10000)
    check('결재중' in pg.locator('tr', has_text='E2E 상신취소 검증').inner_text(), '회수 → 재상신 (결재중)')
    login(pg, base, '박정호')
    approve_first(pg, base, 'E2E 상신취소 검증')
    pg.goto(f'{base}/sr/ci', wait_until='networkidle')
    check('E2E 상신취소 검증' in pg.content(), '재상신 승인 → CI배정')


def sc_devchain(pg, base, check):
    """시스템개발 SR 전체 사슬 — 신청→승인→CI→개발→테스트→적용요청→변경 편입→
    계획 상신취소(복원)→재상신→승인→결과 승인→최종완료→SR 완료 전파 (결재 시트 4·5·10번 연계)"""
    login(pg, base, '김현우')
    pg.goto(f'{base}/sr/new', wait_until='networkidle')
    pg.select_option('select[name=kind]', '시스템개발')
    pg.fill('input[name=system]', 'ERP')
    pg.fill('input[name=title]', 'E2E 개발변경 사슬')
    pg.click('button:has-text("결재 상신")')
    pg.wait_for_url('**/sr/requests**')

    login(pg, base, '박정호')
    approve_first(pg, base, 'E2E 개발변경 사슬')

    # CI 배정·착수 → 개발중 → 테스트 (공수 5 — 요구사항 26행)
    pg.goto(f'{base}/sr/ci', wait_until='networkidle')
    pg.locator('tr', has_text='E2E 개발변경 사슬').locator('button:has-text("배정 · 착수")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/sr/manage', wait_until='networkidle')
    row = pg.locator('tr', has_text='E2E 개발변경 사슬')
    row.locator('input[name=manHours]').fill('5')
    row.locator('button:has-text("처리 →")').click()
    # 개발중 행의 '테스트 처리 →' 버튼 텍스트와 겹치지 않는 후행 상태 시그널로 기다린다
    pg.wait_for_selector('tr:has-text("E2E 개발변경 사슬"):has-text("적용요청서 상신")', timeout=10000)
    row = pg.locator('tr', has_text='E2E 개발변경 사슬')
    check(row.locator('td').nth(6).inner_text().strip() == '5', '공수(MD) 입력')

    # 결재 시트 5번 — 적용요청서는 신청 상신과 별개의 2차 결재 (승인 → 적용요청)
    row.locator('button:has-text("적용요청서 상신")').click()
    pg.wait_for_selector('tr:has-text("E2E 개발변경 사슬"):has-text("적용요청결재중")', timeout=10000)
    login(pg, base, '시스템관리자')
    approve_first(pg, base, '[SR적용요청서] E2E 개발변경 사슬')
    login(pg, base, '박정호')
    pg.goto(f'{base}/sr/manage', wait_until='networkidle')
    txt = pg.locator('tr', has_text='E2E 개발변경 사슬').inner_text()
    check('적용요청결재중' not in txt and '적용요청' in txt, '적용요청서 승인 → 적용요청')

    # 변경관리 편입 — 적용요청 SR 이 시스템개발변경 목록에 추가된다
    pg.goto(f'{base}/infra/changes', wait_until='networkidle')
    pg.select_option('select[name=srNo]', index=0)
    pg.click('button:has-text("변경 작업 편입")')
    pg.wait_for_selector('tr:has-text("E2E 개발변경 사슬")', timeout=10000)

    # 계획 상신 → 상신취소 → 작업등록 복원 (변경계획 회수 전이 — 결재 시트 9·10번 상신취소)
    pg.locator('tr', has_text='E2E 개발변경 사슬').locator('button:has-text("계획 상신")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    pg.locator('.card', has_text='상신함').locator('a', has_text='E2E 개발변경 사슬 — 작업계획').first.click()
    pg.wait_for_selector('text=문서 상세', timeout=10000)
    pg.locator('.card', has_text='문서 상세').locator('button:has-text("상신취소")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/infra/changes', wait_until='networkidle')
    row = pg.locator('tr', has_text='E2E 개발변경 사슬')
    check('작업등록' in row.inner_text() and '계획결재중' not in row.inner_text(), '계획 상신취소 → 작업등록 복원')

    # 재상신 → 승인. 엑셀양식 자동첨부는 회수·재상신에도 같은 참조·양식이라 1건 유지(중복 방지)
    row.locator('button:has-text("계획 상신")').click()
    pg.wait_for_load_state('networkidle')
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    inbox_row = pg.locator('tr', has_text='E2E 개발변경 사슬 — 작업계획').first
    check('📎1' in inbox_row.inner_text(), '변경계획 자동첨부 1건 유지 (회수 재상신 중복 방지)')
    inbox_row.locator('button:has-text("승인")').click()
    pg.wait_for_load_state('networkidle')

    # 결과 상신 → 승인 → 최종완료 + SR 완료 전파
    login(pg, base, '박정호')
    pg.goto(f'{base}/infra/changes', wait_until='networkidle')
    row = pg.locator('tr', has_text='E2E 개발변경 사슬')
    row.locator('input[name=result]').fill('운영계 반영 완료')
    row.locator('button:has-text("결과 상신")').click()
    pg.wait_for_load_state('networkidle')
    login(pg, base, '시스템관리자')
    approve_first(pg, base, 'E2E 개발변경 사슬 — 작업결과')
    pg.goto(f'{base}/infra/changes', wait_until='networkidle')
    check('최종완료' in pg.locator('tr', has_text='E2E 개발변경 사슬').inner_text(), '결과 승인 → 최종완료')
    login(pg, base, '김현우')
    pg.goto(f'{base}/sr/requests', wait_until='networkidle')
    check('완료' in pg.locator('tr', has_text='E2E 개발변경 사슬').inner_text(), '변경 최종완료 → SR 완료 전파')


def sc_settle(pg, base, check):
    """정산품의 반려 → 재상신 → 승인 → 지급완료"""
    login(pg, base, '이수진')
    pg.goto(f'{base}/finance/expense', wait_until='networkidle')
    card = pg.locator('.card', has_text='정산품의')
    card.locator('select[name=contractId]').select_option('CT-2026-03')
    card.locator('input[name=amount]').fill('2000')
    card.locator('input[type=file]').set_input_files(str(UPLOAD))
    card.locator('button:has-text("정산품의 상신")').click()
    pg.wait_for_selector('text=ST-2026-0003', timeout=10000)

    login(pg, base, '박정호')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    row = pg.locator('tr', has_text='정산품의-비용').first
    check('📎1' in row.inner_text(), '정산 증빙 첨부 → 결재함 뱃지')
    row.locator('input[name=reason]').fill('증빙 누락')
    row.locator('button:has-text("반려")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '이수진')
    pg.goto(f'{base}/finance/expense', wait_until='networkidle')
    pg.locator('tr', has_text='ST-2026-0003').locator('button:has-text("재상신")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '박정호')
    approve_first(pg, base, '[재상신] [정산품의-비용]')
    pg.goto(f'{base}/finance/expense', wait_until='networkidle')
    check('지급완료' in pg.locator('tr', has_text='ST-2026-0003').inner_text(), '재상신 승인 → 지급완료')

    # 정산 임시저장 (제품안내서 II장) — 작성중 보관 → '상신' 버튼으로 결재 시작
    login(pg, base, '이수진')
    pg.goto(f'{base}/finance/expense', wait_until='networkidle')
    card = pg.locator('.card', has_text='정산품의')
    card.locator('select[name=contractId]').select_option('CT-2026-03')
    card.locator('input[name=amount]').fill('500')
    card.locator('button:has-text("임시저장")').click()
    pg.wait_for_selector('tr:has-text("ST-2026-0004"):has-text("작성중")', timeout=10000)
    pg.locator('tr', has_text='ST-2026-0004').get_by_role('button', name='상신', exact=True).click()
    pg.wait_for_selector('tr:has-text("ST-2026-0004"):has-text("결재중")', timeout=10000)
    check('결재중' in pg.locator('tr', has_text='ST-2026-0004').inner_text(), '정산 임시저장 → 상신 (결재중)')

    # 경영계획 단계 (제품안내서 III장) — 작성중 → 취합 제출(본인) → 효율화(담당 금액 조정) → 확정
    plan_card = pg.locator('.card', has_text='경영계획')
    plan_card.locator('input[name=title]').fill('E2E 단계 검증 계획')
    plan_card.locator('input[name=amount]').fill('1000')
    plan_card.get_by_role('button', name='항목 등록', exact=True).click()
    pg.wait_for_selector('tr:has-text("E2E 단계 검증 계획")', timeout=10000)
    pg.locator('tr', has_text='E2E 단계 검증 계획').locator('button:has-text("취합 제출")').click()
    pg.wait_for_selector('tr:has-text("E2E 단계 검증 계획"):has-text("취합")', timeout=10000)

    login(pg, base, '박정호')
    pg.goto(f'{base}/finance/expense', wait_until='networkidle')
    row = pg.locator('tr', has_text='E2E 단계 검증 계획')
    row.locator('input[name=amount]').fill('900')
    row.locator('button:has-text("효율화")').click()
    pg.wait_for_selector('tr:has-text("E2E 단계 검증 계획"):has-text("효율화")', timeout=10000)
    pg.locator('tr', has_text='E2E 단계 검증 계획').locator('button:has-text("계획 확정")').click()
    pg.wait_for_selector('tr:has-text("E2E 단계 검증 계획"):has-text("확정")', timeout=10000)
    row_txt = pg.locator('.card', has_text='경영계획').locator('tr', has_text='E2E 단계 검증 계획').inner_text()
    check('900' in row_txt and '확정' in row_txt, '취합 → 효율화(조정 900) → 확정')


def sc_adapter(pg, base, check):
    """채널 토글 → 발송 실패/성공, secdata 이관 → 출력물 폐기 결재"""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    pg.locator('tr', has_text='그룹웨어 메일').locator('button:has-text("중지")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '박정호')
    pg.goto(f'{base}/pledge/dept', wait_until='networkidle')
    pg.locator('form:has(input[value="개발1팀"]) button').first.click()
    pg.wait_for_load_state('networkidle')
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    check('실패' in pg.locator('.card', has_text='발송 이력').inner_text(), '채널 중지 → 발송 실패 기록')
    # 어댑터 계약 자가진단 — 전 프로필 바인딩·계약 적합 (프레임워크 무결성)
    conf = pg.locator('.card', has_text='어댑터 계약 자가진단')
    check('전 프로필 적합' in conf.inner_text() and '부적합' not in conf.locator('.chip').first.inner_text(), '어댑터 자가진단 전 적합')

    pg.locator('tr', has_text='그룹웨어 메일').locator('button:has-text("가동")').click()
    pg.wait_for_load_state('networkidle')
    pg.locator('tr', has_text='보안·출력물 시스템').locator('button:has-text("가동")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '박정호')
    pg.goto(f'{base}/awareness/prints', wait_until='networkidle')
    pg.click('button:has-text("전일자 이관 실행")')
    pg.wait_for_selector('text=PR-2026-0001', timeout=10000)
    check('고객사 정산 내역서' in pg.content(), 'secdata 이관 5건')

    login(pg, base, '김현우')
    pg.goto(f'{base}/awareness/prints', wait_until='networkidle')
    for _ in range(2):
        form = pg.locator('form:has(select[name=method])').first
        if form.count() == 0:
            break
        form.locator('button:has-text("폐기 등록")').click()
        pg.wait_for_load_state('networkidle')
        pg.goto(f'{base}/awareness/prints', wait_until='networkidle')
    pg.click('button:has-text("내 폐기현황 결재상신")')
    pg.wait_for_load_state('networkidle')
    login(pg, base, '박정호')
    approve_first(pg, base, '출력물폐기')
    pg.goto(f'{base}/awareness/prints', wait_until='networkidle')
    check('폐기확정' in pg.content(), '폐기 결재 승인 → 폐기확정')


def sc_remote(pg, base, check):
    """재택 대상자 명단 (요구사항 54행) — 명단 스코핑·제출·CSV 업로드·기간별 조회·종료 처리"""
    # 대상자(김현우)는 체크리스트를 제출할 수 있다
    login(pg, base, '김현우')
    pg.goto(f'{base}/awareness/remote', wait_until='networkidle')
    for i in range(5):
        pg.check(f'input[name=item{i}]')
    pg.click('button:has-text("동의하고 제출")')
    pg.wait_for_selector('text=제출 완료', timeout=10000)

    # 사용자 통계 스코프 — 재택 통계 stat 행이 본인 범위만 집계해야 한다(전사 집계 누출 금지).
    # 김현우는 당월 대상 1인(본인)이므로 '대상 1명' — 버그 시 전사 대상(4명)이 노출됐다.
    check('대상 1명' in pg.locator('.stat-row').inner_text(), '사용자 재택 통계는 본인 범위만 (전사 집계 누출 없음)')

    login(pg, base, '박정호')
    pg.goto(f'{base}/awareness/remote', wait_until='networkidle')
    status = pg.locator('.card', has_text='전사 제출 현황')
    check('김현우' in status.inner_text(), '제출 → 명단 기준 현황 반영')

    # CSV 업로드 — '이름,시작일자' 행 반영 (잘못된 줄은 건너뛴다)
    csv_path = UPLOAD.parent / '.e2e-remote.csv'
    # 첫 행은 실재하지 않는 달력 날짜(정규식은 통과) — realDate 가드 없으면 dayBefore toISOString 이 RangeError 로
    # 업로드 액션 전체를 500 내 강도윤도 반영 안 된다(v1.5.x). 가드 있으면 무효 행만 건너뛰고 강도윤 반영.
    csv_path.write_text('한지원,2026-13-45\n강도윤,2026-08-10\n무명인,2026-08-10\n', encoding='utf-8')
    mgmt = pg.locator('.card', has_text='대상자 관리')
    mgmt.locator('input[type=file]').set_input_files(str(csv_path))
    mgmt.locator('button:has-text("업로드 반영")').click()
    # 서버 액션 재렌더를 기다린다 — 즉시 이동하면 POST 가 유실될 수 있다
    pg.wait_for_selector('.card:has-text("전사 제출 현황") >> text=강도윤', timeout=10000)
    check('강도윤' in pg.locator('.card', has_text='전사 제출 현황').inner_text(), 'CSV 업로드 → 명단 추가')
    try:
        csv_path.unlink(missing_ok=True)  # Windows 는 브라우저가 핸들을 놓은 뒤에만 지워진다
    except OSError:
        pass

    # 기간별 조회 — 2026-06 은 그 달의 명단(강도윤 6월 이력)만
    pg.goto(f'{base}/awareness/remote?period=2026-06', wait_until='networkidle')
    june = pg.locator('.card', has_text='제출 현황')
    check('강도윤' in june.inner_text() and '한지원' not in june.inner_text(), '기간별 조회 (2026-06 명단)')

    # 종료 처리 — 종료일만 입력하면 진행중 대상이 마감된다
    pg.goto(f'{base}/awareness/remote', wait_until='networkidle')
    mgmt = pg.locator('.card', has_text='대상자 관리')
    mgmt.locator('select[name=name]').select_option('김현우')
    mgmt.locator('input[name=endDate]').fill('2026-07-31')
    mgmt.get_by_role('button', name='반영', exact=True).click()
    # 사라짐 검증은 재렌더 완료를 폴링으로 기다린다
    gone = False
    for _ in range(20):
        pg.goto(f'{base}/awareness/remote', wait_until='networkidle')
        if '김현우' not in pg.locator('.card', has_text='전사 제출 현황').inner_text():
            gone = True
            break
        time.sleep(0.5)
    check(gone, '종료 처리 → 당월 명단 제외')

    # 명단 밖 사용자는 제출 대상이 아니다
    login(pg, base, '김현우')
    pg.goto(f'{base}/awareness/remote', wait_until='networkidle')
    check('재택 대상 아님' in pg.content(), '명단 제외 → 대상 아님 안내')


def sc_remote_overlap(pg, base, check):
    """재택 명단 경계월 이중 집계 — 한 사람이 인접한 두 재택 기간을 가져도 당월 명단·통계는 1회만.
    구 기간을 신규 시작 '전일'로 마감(off-by-one)해도 경계월(전환 달)엔 두 기간이 함께 걸리므로
    이름 기준 중복 제거로 방어(v1.5.53). 크래프트 데이터로 한지원의 인접 두 기간을 주입한다."""
    login(pg, base, '박정호')  # 전사 제출 현황 조회 권한(담당)
    pg.goto(f'{base}/awareness/remote', wait_until='networkidle')
    status = pg.locator('.card', has_text='전사 제출 현황')
    rows = status.locator('tbody tr', has_text='한지원').count()
    check(rows == 1, f'인접 재택 기간(경계월) → 당월 명단 1회 (이중 집계면 2행; 실제 {rows}행)')
    # 통계 stat 도 같은 인원을 둘로 세면 안 된다 — 당월 대상은 한지원 1명뿐
    check('대상 1명' in pg.locator('.stat-row').inner_text(), '대상 통계도 1명 (경계월 중복 제거)')


def sc_apply_resign_orphan(pg, base, check):
    """적용요청 상신 교차-기안자 고아 할일(v1.5.60) — /sr/manage 공유 워크스페이스에서 재상신자(ADMIN)가 원
    기안자(박정호)와 달라도 반려 재상신 할일이 소유자 무관하게 닫혀야 한다(변경 closeChangeResignTodo 동일 결함).
    과거 반려 재상신 할일(owner 박정호) + 테스트 상태 SR 주입 → ADMIN 이 적용요청 상신 → 고아 마감 확인."""
    login(pg, base, '시스템관리자')  # ADMIN — 원 기안자(박정호)와 다른 재상신자
    pg.goto(f'{base}/sr/manage', wait_until='networkidle')
    pg.locator('tr', has_text='적용요청고아테스트').locator('button:has-text("적용요청서 상신")').click()
    pg.wait_for_load_state('networkidle')
    login(pg, base, '박정호')  # 원 기안자 — 고아 할일 소유자
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    open_card = pg.locator('.card', has_text='미처리 할일')
    check('SR-2026-9001' not in open_card.inner_text(), '교차 재상신자 적용요청 상신 → 원 기안자 재상신 고아 할일 마감')


def sc_inspection_resign_orphan(pg, base, check):
    """점검결과 교차-상신자 고아 할일(v1.5.79) — /compliance/inspection 공유 워크스페이스(BIZ_MGR·ADMIN)에서
    반려된 계획을 원 상신자(박정호)와 다른 관리자(ADMIN)가 재상신해도 반려 재상신 할일이 소유자 무관하게
    닫혀야 한다(SR·변경 동일 결함). 결과미등록 계획 + 과거 반려 재상신 할일(owner 박정호) 주입 →
    ADMIN 이 결과 결재상신 → 원 상신자의 고아 재상신 할일 마감 확인."""
    login(pg, base, '시스템관리자')  # ADMIN — 원 상신자(박정호)와 다른 재상신자
    pg.goto(f'{base}/compliance/inspection', wait_until='networkidle')
    row = pg.locator('tr', has_text='IS-2026-9001')
    row.locator('input[name=result]').fill('재점검 완료')
    row.locator('button:has-text("결과 결재상신")').click()
    pg.wait_for_load_state('networkidle')
    login(pg, base, '박정호')  # 원 상신자 — 고아 할일 소유자
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    open_card = pg.locator('.card', has_text='미처리 할일')
    check('IS-2026-9001' not in open_card.inner_text(), '교차 재상신자 점검결과 상신 → 원 상신자 재상신 고아 할일 마감')


def sc_channelstate_corrupt(pg, base, check):
    """channelStates 값 검증(v1.5.80) — 손상/구버전 파일의 비불리언 채널상태({})가 isEnabled 의 `st[id] ?? default`
    를 통과해(?? 는 null 만 폴백) 중지 채널(security-db, 기본 off)을 truthy 로 오판·가동시키면 안 된다. 머지가
    비불리언 값을 걸러 기본값(off)으로 폴백 → 활성 채널 4/5 유지(오판 시 security-db 포함 5/5).
    PORTAL_DATA_FILE 로 {channelStates:{security-db:{}}} 주입."""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    stats = pg.locator('.stat-row').first.inner_text()
    check('4/5' in stats and '5/5' not in stats, '비불리언 channelStates 값 무시 → 중지 채널 오활성 방지(활성 4/5)')


def sc_profile_data_isolation(pg, base, check):
    """프로필 데이터 격리(v1.5.188, AD-7) — 한 PORTAL_DATA_FILE 을 PORTAL_PROFILE 전환에 재사용해도 프로필
    스코프 런타임 설정(채널 가동상태·메뉴권한 오버레이)이 새지 않는다. 파일이 'manufacturer' 스탬프 +
    security-db 강제 가동(true)인데 default 프로필로 기동하면, 스탬프 불일치라 채널상태를 default 시드로
    리셋해 security-db 는 기본(off)으로 돌아간다(활성 4/5). 도메인 데이터는 보존."""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    stats = pg.locator('.stat-row').first.inner_text()
    check('4/5' in stats and '5/5' not in stats,
          f'프로필 스탬프 불일치 → 채널상태 시드 리셋(security-db 강제가동 무시, 활성 4/5) (실제 {stats.strip()[:32]})')


def sc_remote_cycle_config(pg, base, check):
    """재택 등록 주기 변경(v1.5.95, 요구사항 54행 '등록 주기 변경 - 반기, 분기, 매일') — s.remoteCycle 단일
    원천을 바꾸면 제출·대상·통계·알림 기간 키가 해당 주기로 전환. 기본 월에서 매일로 변경 후 화면 반영 확인."""
    login(pg, base, '박정호')  # BIZ_MGR — 등록 주기 변경 권한
    pg.goto(f'{base}/awareness/remote', wait_until='networkidle')
    check('등록 주기: 월' in pg.content(), '전제: 기본 등록 주기 월')
    pg.locator('select[name=cycle]').select_option('매일')
    pg.locator('button:has-text("주기 변경")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/awareness/remote', wait_until='networkidle')
    check('등록 주기: 매일' in pg.content(),
          '재택 등록 주기 매일 변경 → 화면·기간 키 반영 (요구사항 54행 주기 변경)')


def sc_secprint_system_registered(pg, base, check):
    """보안·출력물 시스템 정식 등록(v1.5.94) — 출력물 이관 배치(BJ-02)·수신 인터페이스(IF-04)·secdata
    어댑터의 원천 '보안·출력물 시스템'이 s.systems 에 미등록이라, 이름-기준 토폴로지 조인에서 BJ-02 가
    매핑 실패로 누락돼 배치 수가 과소 집계됐다(v1.5.88 IO-3). SYS-05 로 정식 등록해 시스템 목록·토폴로지에
    나타나고 BJ-02 가 배치 사슬에 포함되게 한다. 시스템 화면에 '보안·출력물 시스템' 등록 확인."""
    login(pg, base, '박정호')  # BIZ_MGR — 시스템 현황 열람
    pg.goto(f'{base}/infra/systems', wait_until='networkidle')
    check('보안·출력물 시스템' in pg.locator('.card', has_text='시스템 현황').inner_text(),
          '보안·출력물 시스템이 정식 등록돼 시스템 목록에 노출(BJ-02 토폴로지 매핑 복원, 과소집계 해소)')


def sc_sr_suspend(pg, base, check):
    """SR 중지(BA030014, 결재 시트 rows 4·6·7 '진행상태가 SR중지인 경우 반영 안함') — 활성 진행 SR 을 보류하면
    진행 처리·지연 집계·SR지연 알림에서 빠지고, 재개 시 직전 상태로 복원. 개발중·과거 dueDate SR 을 중지 →
    상태 중지·재개 버튼, 지연 목록에서 제외 확인."""
    login(pg, base, '박정호')  # BIZ_MGR — SR 관리 권한
    pg.goto(f'{base}/sr/delayed', wait_until='networkidle')
    check('중지테스트SR' in pg.content(), '전제: 활성 개발중 SR 이 지연 목록에 있음')
    pg.goto(f'{base}/sr/manage', wait_until='networkidle')
    pg.locator('tr', has_text='중지테스트SR').locator('button:has-text("중지")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/sr/manage', wait_until='networkidle')
    txt = pg.locator('tr', has_text='중지테스트SR').inner_text()
    check('중지' in txt and '재개' in txt, f'SR 중지 → 상태 중지·재개 버튼 (실제 …{txt[-24:]})')
    pg.goto(f'{base}/sr/delayed', wait_until='networkidle')
    check('중지테스트SR' not in pg.content(), '중지 SR 은 지연 목록에서 제외(BA030014 반영 안함)')


def sc_sr_suspend_strand(pg, base, check):
    """SR 중지-변경 고착 방어(v1.5.179) — 적용요청 SR 이 진행 중 변경(비-최종완료)에 편입되면 중지 금지.
    편입 SR 을 중지하면 변경결과 승인 전파(sr.status==='적용요청' 요구)가 '중지' 때문에 누락돼 SR 이 적용요청에
    영구 고착되고 변경만 최종완료로 남는 결함이 있었다(변경 approval 은 cw.id 로 키잉돼 srNo 대기 가드에 안
    걸림). 시드 SR-2026-0132(시스템개발·적용요청) → 변경 편입 → 중지 시도 차단 검증."""
    login(pg, base, '박정호')  # BIZ_MGR — SR·변경 관리 권한
    title = '구매 발주 승인 프로세스 변경'
    # 적용요청 SR 을 변경 작업으로 편입(비-최종완료 변경 생성)
    pg.goto(f'{base}/infra/changes', wait_until='networkidle')
    pg.select_option('select[name=srNo]', value='SR-2026-0132')
    pg.click('button:has-text("변경 작업 편입")')
    pg.wait_for_load_state('networkidle')
    check(title in pg.content(), '전제: 적용요청 SR 이 변경 작업으로 편입됨(비-최종완료)')
    # SR 관리에서 중지 시도 → 차단(적용요청 유지, 재개 버튼 없음)
    pg.goto(f'{base}/sr/manage', wait_until='networkidle')
    row = pg.locator('tr', has_text=title).first
    check('중지' in row.inner_text(), '전제: 적용요청 SR 은 SUSPENDABLE 이라 중지 버튼 노출')
    row.locator('button:has-text("중지")').first.click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/sr/manage', wait_until='networkidle')
    txt = pg.locator('tr', has_text=title).first.inner_text()
    check('적용요청' in txt and '재개' not in txt,
          f'진행 중 변경 편입 SR 중지 차단 — 적용요청 유지·재개 버튼 없음 (실제 …{txt[-24:]})')


def sc_security_review(pg, base, check):
    """보안성 검토(VI장) + 심각도 등급(v1.5.127~) — 등급별(심각/높음/보통/낮음) 발견·조치를 기록하고, 발견 전건
    조치 후에만 완료 확정(미조치 잔여 시 완료 가드·감사 무결성). 고위험(심각+높음) 미조치가 우선 신호.
    시드 SEC-2026-02(그룹웨어·조치중, 심각1/0·높음2/1·보통1/1·낮음1/0 = 발견5·조치2, 고위험 미조치 2) →
    고위험 마커 확인 → 완료 차단 → 등급별 전건 조치 후 고위험 소거·완료."""
    login(pg, base, '박정호')  # BIZ_MGR — 보안성 검토 권한(BIZ)
    pg.goto(f'{base}/compliance/security-review', wait_until='networkidle')
    row_txt = pg.locator('tr', has_text='그룹웨어 웹 취약점 점검').inner_text()
    check('그룹웨어 웹 취약점 점검' in pg.content(), '전제: 조치중 검토(발견5·조치2)가 목록에 있음')
    check('고위험 2' in row_txt, f'고위험(심각+높음) 미조치 2 마커 표시 (실제 …{row_txt[-24:]})')
    # 미조치 잔여에서 완료 시도 → 가드로 차단(상태 조치중 유지)
    pg.locator('tr', has_text='그룹웨어 웹 취약점 점검').locator('button:has-text("완료")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/compliance/security-review', wait_until='networkidle')
    txt = pg.locator('tr', has_text='그룹웨어 웹 취약점 점검').inner_text()
    check('조치중' in txt, f'미조치 잔여 시 완료 차단 — 상태 조치중 유지 (실제 …{txt[-20:]})')
    # 등급별 전건 조치 기록 (각 등급 조치 = 그 등급 발견: 심각1·높음2·보통1·낮음1)
    row = pg.locator('tr', has_text='그룹웨어 웹 취약점 점검')
    for grade, n in [('심각', '1'), ('높음', '2'), ('보통', '1'), ('낮음', '1')]:
        row.locator(f'input[aria-label="{grade} 조치"]').fill(n)
    row.locator('button:has-text("기록")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/compliance/security-review', wait_until='networkidle')
    row2 = pg.locator('tr', has_text='그룹웨어 웹 취약점 점검').inner_text()
    check('고위험' not in row2, f'등급별 전건 조치 후 고위험 미조치 마커 소거 (실제 …{row2[-24:]})')
    pg.locator('tr', has_text='그룹웨어 웹 취약점 점검').locator('button:has-text("완료")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/compliance/security-review', wait_until='networkidle')
    txt = pg.locator('tr', has_text='그룹웨어 웹 취약점 점검').inner_text()
    check('완료' in txt and '조치중' not in txt, f'전건 조치(5/5) 후 완료 확정 (실제 …{txt[-20:]})')


def sc_compliance_trend(pg, base, check):
    """컴플라이언스 추세 스냅샷(v1.5.135~) — 주기별 KPI 스냅샷으로 전기 대비 개선 추이(ISMS 감사 근거).
    시드 2026-06·07 추세 카드 확인(서약률 50→62 개선 델타 +12), '현황 스냅샷 기록' → 감사 이력 기록 확인."""
    login(pg, base, '시스템관리자')  # ADMIN — 추세 열람·기록·감사 확인
    pg.goto(f'{base}/compliance/inspection', wait_until='networkidle')
    card = pg.locator('.card', has_text='컴플라이언스 추세').inner_text()
    check('2026-06' in card and '2026-07' in card, '전제: 추세 카드에 시드 스냅샷 2건')
    check('+12' in card, '서약률 개선 델타(+12, 50→62) 전기 대비 표시')
    # 포스처 점수(v1.5.144~) — 현재 점수 배너 + 추세 점수 열 개선 델타(56→65 = +9)
    check('현재 포스처 점수' in card, '현재 포스처 점수 배너 표시')
    check('+9' in card, '포스처 점수 개선 델타(+9, 56→65) 전기 대비 표시')
    # 축 분해(v1.5.149~) — 점수를 이루는 5축을 각각 보이고 최약 축을 개선 우선순위로 지목(점수=축 평균 단일원천)
    check('리스크 관리' in card and '취약점 조치율' in card and '점검 완료율' in card,
          '포스처 축 분해 패널 표시(리스크 관리·취약점 조치율·점검 완료율 등 5축)')
    check('개선 우선순위' in card, '최약 축을 개선 우선순위로 지목(행동 안내 포함)')
    pg.locator('.card', has_text='컴플라이언스 추세').locator('button:has-text("현황 스냅샷 기록")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/settings/audit', wait_until='networkidle')
    check('컴플라이언스 스냅샷' in pg.content(), '스냅샷 기록이 감사 이력에 남음')
    # 대시보드 운영 스냅샷에 컴플라이언스 점수 신호
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    check('컴플라이언스 점수' in pg.locator('.card', has_text='전사 운영 스냅샷').inner_text(), '대시보드에 컴플라이언스 점수 신호')


def sc_delayed_corrupt_date(pg, base, check):
    """손상 날짜 일수계산 NaN 렌더 방지(v1.5.93) — strField 정규화는 날짜를 문자열로만 보장하고 유효성은
    검증 안 하므로, 손상 파일의 파싱 불가 dueDate('0000-00-00')가 지연목록에 들어가면 daysBetween 의
    Date.parse 가 NaN 을 내 'D+NaN'·'최대 지연일수 NaN'으로 렌더됐다(손상파일 게이트는 크래시만 잡아 통과).
    daysBetween 유한값 가드(비유한→null→'-'·0 폴백)로 NaN 렌더 제거. 손상 dueDate SR 주입 → NaN 미표기."""
    login(pg, base, '박정호')  # BIZ_MGR — 지연내역 열람
    pg.goto(f'{base}/sr/delayed', wait_until='networkidle')
    check('NaN' not in pg.content(),
          "손상 날짜(0000-00-00) 지연 SR 도 화면에 NaN 미표기 (daysBetween 유한 가드 → 'D+-'·0 폴백)")


def sc_qna_assign_role(pg, base, check):
    """QnA 담당 지정 역할 정합(v1.5.92) — 담당 지정 대상은 실제 답변 가능한 역할(BIZ_MGR·ADMIN)이어야 한다.
    role !== 'USER' 로 두면 DEPT_MGR 도 지정되나 DEPT_MGR 은 답변 폼이 없어(answer·canAnswer 게이트 제외)
    지정이 막다른 길이 된다(assign·answer 게이트 불일치). 미답변 문의 주입 → 담당 드롭다운에 DEPT_MGR
    이수진 미포함, BIZ_MGR/ADMIN 포함 확인."""
    login(pg, base, '박정호')  # BIZ_MGR — 담당 지정 가능
    pg.goto(f'{base}/board/qna', wait_until='networkidle')
    names = pg.locator('select[name=assignee]').first.locator('option').all_inner_texts()
    check('이수진' not in names, f'담당 지정 대상은 답변 가능 역할만 — DEPT_MGR 이수진 제외 (실제 {names})')
    check('박정호' in names or '시스템관리자' in names, '답변 가능 역할(BIZ_MGR/ADMIN)은 지정 대상 포함(거짓통과 방지)')


def sc_qna_loop(pg, base, check):
    """QnA 폐쇄 루프(v1.5.184~) — 담당 지정 시 답변 할일 생성, 답변 완료 시 마감(그간 유일하게 폐쇄 루프가
    없던 워크플로). 김현우(USER) 문의 등록 → 박정호(BIZ_MGR) 자기 담당 지정 → 박정호 My Work 미처리에
    QnA 답변 할일 → 답변 → 할일 마감(미처리에서 제거)."""
    title = 'E2E 폐쇄루프 문의'
    # 1) USER 문의 등록
    login(pg, base, '김현우')
    pg.goto(f'{base}/board/qna', wait_until='networkidle')
    pg.locator('input[name=title]').first.fill(title)
    pg.locator('select[name=domain]').first.select_option(index=0)
    pg.locator('button:has-text("등록")').first.click()
    pg.wait_for_selector(f'tr:has-text("{title}")', timeout=10000)
    # 2) BIZ_MGR 담당 지정(박정호 자기 자신)
    login(pg, base, '박정호')
    pg.goto(f'{base}/board/qna', wait_until='networkidle')
    row = pg.locator('tr', has_text=title).first
    row.locator('select[name=assignee]').select_option('박정호')
    row.locator('button:has-text("담당 지정")').click()
    pg.wait_for_load_state('networkidle')
    # 3) My Work 미처리에 QnA 답변 할일
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    check('QnA' in pg.locator('.card', has_text='미처리 할일').inner_text(),
          '담당 지정 → QnA 답변 할일 미처리에 생성')
    # 4) 답변 → 할일 마감
    pg.goto(f'{base}/board/qna', wait_until='networkidle')
    row = pg.locator('tr', has_text=title).first
    row.locator('input[name=answer]').fill('E2E 답변 내용')
    row.locator('button:has-text("답변")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    check('QnA' not in pg.locator('.card', has_text='미처리 할일').inner_text(),
          '답변 완료 → QnA 할일 미처리에서 마감(폐쇄 루프)')


def sc_autoform_upload_defeat(pg, base, check):
    """필수 자동양식 파일명충돌 우회(v1.5.91) — registerGenerated 중복판정이 '양식이름_v버전_' 접두 startsWith
    로만 비교해, 사용자 업로드(registerUpload)가 우연/고의로 같은 접두 파일명을 가지면(submitResult 는 업로드
    후 자동생성 순서) 필수 자동양식 생성을 가로막았다(첨부파일자동생성 통제 우회). gen 플래그로 '이전 생성
    양식'만 중복대상화. 접두충돌 업로드가 미리 붙은 변경 결과상신 → 업로드+생성 2건(📎2) 확인."""
    login(pg, base, '박정호')  # BIZ_MGR — 변경 결과 상신 권한
    pg.goto(f'{base}/infra/changes', wait_until='networkidle')
    row = pg.locator('tr', has_text='자동양식우회테스트변경')
    row.locator('input[name=result]').fill('작업 완료')
    row.locator('button:has-text("결과 상신")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/infra/changes', wait_until='networkidle')
    txt = pg.locator('tr', has_text='자동양식우회테스트변경').inner_text()
    check('📎2' in txt,
          f"양식 접두와 같은 파일명 업로드가 필수 자동양식 생성을 못 막음 (업로드+생성=📎2; 버그면 📎1; 실제 …{txt[-24:]})")


def sc_remote_departed_ghost(pg, base, check):
    """인사연동 퇴사 재택 대상자 유령 미제출(v1.5.90) — remoteTargets 는 s.people 과 별개 명단이고 syncHr 는
    s.people 만 교체하므로, 종료일 없는 재택 대상자가 퇴사해 s.people 에서 빠져도 remoteTargets 엔 남아 매월
    '미제출' 유령으로 집계됐다(제출·종료 경로 없어 해소 불가). 재직 명단 교집합으로 화면·통계·export 에서
    제거한다. s.people 에 없는 '퇴사자A' 를 재택 대상자로 주입 → 전사 현황에 미노출 확인."""
    login(pg, base, '박정호')  # BIZ_MGR — 전사 재택 현황
    pg.goto(f'{base}/awareness/remote', wait_until='networkidle')
    check('퇴사자A' not in pg.content(),
          '인사연동으로 s.people 에서 빠진 퇴사 재택 대상자는 미제출 현황에서 제외 (유령 미제출 방지)')


def sc_project_complete_resign_cleanup(pg, base, check):
    """프로젝트 완료 시 재서약 할일 정리(v1.5.89) — 프로젝트 재서약 할일은 signProject(진행중 프로젝트 서명)로만
    닫히는데, 멤버의 유일 참여 프로젝트가 서명 전 완료되면 서명할 진행중 프로젝트가 없어 할일이 영구 방치되고
    notify 재서약 안내가 매 배치 재발송됐다. 완료 확정 시 서명 대상 진행중 프로젝트가 더 없는 멤버의 재서약
    할일을 닫는다. PM(박정호)이 이수진 단독 참여 프로젝트를 100% 완료 → 이수진 재서약 할일 마감 확인."""
    # 사전: 이수진의 프로젝트 재서약 할일이 열려 있음
    login(pg, base, '이수진')
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    open_before = pg.locator('.card', has_text='미처리 할일')
    check('프로젝트 보안서약서' in open_before.inner_text(), '전제: 이수진 프로젝트 재서약 할일 열림')
    # PM(박정호)이 이수진 단독 참여 프로젝트를 100% 완료
    login(pg, base, '박정호')
    pg.goto(f'{base}/projects/status', wait_until='networkidle')
    row = pg.locator('tr', has_text='완료정리테스트')
    row.locator('input[name=progress]').fill('100')
    row.locator('button:has-text("갱신")').click()
    pg.wait_for_load_state('networkidle')
    # 이수진 재서약 할일이 닫혀야 한다 (버그면 영구 방치)
    login(pg, base, '이수진')
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    open_after = pg.locator('.card', has_text='미처리 할일')
    check('프로젝트 보안서약서' not in open_after.inner_text(),
          '유일 참여 프로젝트 완료 → 서명 불가능한 재서약 할일 마감 (버그면 영구 방치·유령 독촉)')


def sc_project_emptymembers_signcount(pg, base, check):
    """빈 명단 프로젝트 참여서약 집계(v1.5.89) — 옵셔널 members 가 파일 영속화·재로딩에서 undefined→[] 로
    정규화되면(빈 배열은 truthy) signedCount 가 [].filter=0 을 반환해 참여서약이 0 으로 떨어졌다. 빈 명단은
    미지정과 동일 취급(참여자 전원 집계)해야 한다. members=[] 프로젝트에 서약 1건 주입 → '1건' 표기 확인."""
    login(pg, base, '박정호')
    pg.goto(f'{base}/projects/status', wait_until='networkidle')
    txt = pg.locator('tr', has_text='빈명단집계테스트').inner_text()
    check('1건' in txt and '0건' not in txt,
          f"빈 명단 프로젝트도 참여서약 전원 집계 ([]를 미지정과 동일 취급; 버그면 0건; 실제 …{txt[-30:]})")


def sc_rotating_fresh_no_overclose(pg, base, check):
    """회전문서 신규 상신 과다마감 방지(v1.5.88 AP3-3) — 회전참조 묶음(장애보고)은 재상신마다 ref 가 바뀌어
    docType 만으로 닫으면, 반려와 무관한 '신규' 묶음 상신이 오래된 재상신 할일까지 마감해 '반려 방치' 알림이
    영구 소실됐다. v1.5.88: 재상신 할일의 반려 묶음 항목(batchItems)을 현재 상신 항목이 재포함할 때만 닫는다.
    과거 반려 할일(batchItems=FL-2026-96)이 있는데 무관한 신규 장애(FL-2026-95)만 상신 → 할일 유지 확인."""
    login(pg, base, '박정호')  # BIZ_MGR — 장애보고 상신 권한
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    before = pg.locator('.card', has_text='미처리 할일').locator('tr', has_text='[장애보고 상신]').count()
    check(before >= 1, f'전제: 과거 반려 재상신 할일 존재 (실제 {before})')
    # 무관한 신규 장애만 상신 (항목 재포함 아님)
    pg.goto(f'{base}/infra/incidents', wait_until='networkidle')
    pg.check('input[name=ids][value="FL-2026-95"]')
    pg.click('button:has-text("선택 건 장애보고 상신")')
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    after = pg.locator('.card', has_text='미처리 할일').locator('tr', has_text='[장애보고 상신]').count()
    check(after == before,
          f'무관한 신규 묶음 상신은 과거 재상신 할일을 안 닫음 (전 {before} → 후 {after}, 버그면 {before - 1})')


def sc_rotating_resign_orphan(pg, base, check):
    """회전 문서 교차-재상신자 고아 할일(v1.5.81) — 공유 관리자 워크스페이스(장애보고 등 회전참조 문서)에서
    반려된 묶음을 원 기안자(박정호)와 다른 관리자(ADMIN)가 재상신하면, draftApproval 의 회전 닫기가 owner
    게이트에 막혀 원 기안자 '재상신' 할일을 못 닫아 '반려 방치' 알림이 무한 반복되던 결함(SR·변경·점검 비회전
    사각의 회전판). 회전 닫기 소유자무관화로 마감. 미상신 인시던트 + 과거 박정호 장애보고 재상신 할일 주입 →
    ADMIN 이 재상신 → 박정호 고아 재상신 할일 마감 확인."""
    login(pg, base, '시스템관리자')  # ADMIN — 원 기안자(박정호)와 다른 재상신자
    pg.goto(f'{base}/infra/incidents', wait_until='networkidle')
    pg.check('input[name=ids][value="FL-2026-91"]')
    pg.click('button:has-text("선택 건 장애보고 상신")')
    pg.wait_for_load_state('networkidle')
    login(pg, base, '박정호')  # 원 기안자 — 고아 할일 소유자
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    open_card = pg.locator('.card', has_text='미처리 할일')
    check('[장애보고 상신]' not in open_card.inner_text(),
          '교차 재상신자(ADMIN) 회전 문서 재상신 → 원 기안자 재상신 고아 할일 마감')


def sc_notify_corrupt_todo(pg, base, check):
    """알림 배치 손상 데이터 내성(v1.5.58) — title 누락 서약 할일이 있어도 배치가 크래시 없이 완료·기록돼야
    한다. 기존엔 x.title.includes 가 undefined 에 TypeError → 배치 전체 중단·후속 유형 누락·기록 없음."""
    login(pg, base, '시스템관리자')  # ADMIN — 수동 배치 실행
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    pg.locator('button:has-text("알림 배치 실행")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    check('일일 알림 배치' in pg.content(), '손상 title 할일에도 알림 배치 완료·기록 (크래시 없음)')


def sc_attach_generated_dedup(pg, base, check):
    """자동첨부 교차일 중복 방지(v1.5.57) — 반려·회수 후 다른 날 재상신해도 같은 양식(이름+버전) 자동첨부가
    중복 누적되면 안 된다. registerGenerated 이 날짜 뺀 접두로 dedup. 과거일자 자동첨부 주입 후 오늘 계획
    상신 → 첨부 1건 유지(기존엔 파일명 날짜가 달라 dedup 실패 → 2건 누적)."""
    login(pg, base, '시스템관리자')  # ADMIN — 변경 계획 상신 권한
    pg.goto(f'{base}/infra/changes', wait_until='networkidle')
    pg.locator('tr', has_text='크로스데이중복테스트변경').locator('button:has-text("계획 상신")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/infra/changes', wait_until='networkidle')
    txt = pg.locator('tr', has_text='크로스데이중복테스트변경').inner_text()
    check('📎1' in txt and '📎2' not in txt, f'교차일 재상신에도 자동첨부 1건 유지 (중복이면 📎2; 실제 …{txt[-40:]})')


def sc_search_menu_override(pg, base, check):
    """통합 검색 런타임 권한 정합(v1.5.56) — 메뉴권한(menuOverrides)으로 화면에서 차단된 역할은 검색에서도
    해당 도메인이 안 나와야 한다. me.role 리터럴 게이트면 메뉴 제한을 우회해 검색이 데이터 열람 경로가 된다.
    /projects/status 를 ADMIN 전용으로 제한 → BIZ_MGR 은 검색 미노출, ADMIN(제한 예외)은 정상 노출."""
    # 검색어는 헤더 desc 에 그대로 반향되므로, 결과 행에만 나오는 프로젝트 코드(PJ-9001)로 판별한다
    # (검색어 문자열로 판별하면 반향 때문에 항상 매칭돼 거짓 결과가 난다).
    login(pg, base, '박정호')  # BIZ_MGR — 제한으로 프로젝트 도메인 차단됨
    pg.goto(f'{base}/search?q=격리테스트프로젝트XYZ', wait_until='networkidle')
    check('PJ-9001' not in pg.content(), '메뉴 제한된 프로젝트 도메인은 검색에서도 미노출 (런타임 권한 정합)')
    login(pg, base, '시스템관리자')  # ADMIN — 제한 예외라 정상 노출(레코드가 실제 검색 가능함을 확인 = 거짓통과 방지)
    pg.goto(f'{base}/search?q=격리테스트프로젝트XYZ', wait_until='networkidle')
    check('PJ-9001' in pg.content(), 'ADMIN 은 제한 예외 — 검색 정상 노출(게이트가 역할별로 동작)')


def sc_dashboard_edu_scope(pg, base, check):
    """대시보드 '보안교육 미이수' 대상 스코프(v1.5.55) — 개발자 전용 완료 과정이 비개발자 대시보드에
    '미이수'로 오표기되면 안 된다(v1.5.51 이수율 단일 원천 eligibleForCourse 를 대시보드 포틀릿에도 적용).
    교육 화면은 v1.5.51 에서 이미 대상 스코프됐으나 대시보드 포틀릿은 누락됐던 정합 결함."""
    # 이수진(경영지원팀=비개발) — 개발자 대상 완료 과정 ED-DEV 는 이수 의무자가 아니므로 미이수 0
    login(pg, base, '이수진')
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    edu = pg.locator('.stat', has_text='보안교육 미이수')
    val = edu.locator('.v').inner_text().strip()
    check(val == '0', f'개발자 전용 과정은 비개발자 대시보드 미이수 미집계 (대상 무시면 1; 실제 {val})')


def sc_dashboard_pledge_general(pg, base, check):
    """대시보드 '일반 서약' 타일 단일 원천(v1.5.55) — 일반 서약이 유효한 사람은 무관한 유형(관리책임자 등)
    재서약 할일이 있어도 '완료'여야 한다. '보안서약서' 할일 유무(모든 유형 공통 kind)가 아니라 일반 서약
    유효성(validSign: kind '일반'+개정본 이후 서명) 기준. 교차 신호면 타 유형 개정 때 유효자가 '미제출' 오표기."""
    # 박정호(시드 일반 서약 유효)에게 관리책임자 재서약 할일만 주입 → 일반 타일은 여전히 '완료'
    login(pg, base, '박정호')
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    pledge = pg.locator('.stat', has_text='일반 서약')
    val = pledge.locator('.v').inner_text().strip()
    check(val == '완료', f"일반 서약 유효자는 타 유형 재서약 할일이 있어도 '완료' (교차 신호면 미제출; 실제 {val})")


def sc_infra_systems_incident_scope(pg, base, check):
    """시스템 화면 장애 교차도메인 게이트(v1.5.87) — 시스템·서버 현황 화면은 자기 메뉴로만 게이트되나
    '조치중 장애' 집계·'장애 이력' 열은 장애관리(/infra/incidents) 도메인 신호다. ADMIN 이 장애관리를
    ADMIN 전용으로 제한해 담당자를 그 화면에서 리다이렉트시켜도, 시스템 화면 집계·연계로 같은 수치가
    새어 나가면 안 된다(대시보드 v1.5.86·검색 v1.5.56 과 동일 클래스). 출처 effectiveRoles 로 가드."""
    # BIZ_MGR(박정호) — /infra/incidents 제한 대상 → 시스템 화면의 '조치중 장애' 타일·'장애 이력' 열 미노출
    login(pg, base, '박정호')
    pg.goto(f'{base}/infra/systems', wait_until='networkidle')
    check(pg.locator('.stat', has_text='조치중 장애').count() == 0,
          '메뉴 제한된 장애 도메인 집계는 시스템 화면 타일에서도 미노출 (런타임 권한 정합)')
    check(pg.locator('th', has_text='장애 이력').count() == 0, "제한 시 '장애 이력' 열 미노출")
    check(pg.locator('th', has_text='시스템').count() >= 1, '시스템 화면 자체는 정상 렌더(거짓통과 방지)')
    # ADMIN(시스템관리자) — 제한 예외라 '조치중 장애' 타일·'장애 이력' 열 정상 노출
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/infra/systems', wait_until='networkidle')
    check(pg.locator('.stat', has_text='조치중 장애').count() >= 1 and pg.locator('th', has_text='장애 이력').count() >= 1,
          'ADMIN 은 제한 예외 — 장애 타일·열 정상 노출(게이트 역할별 동작)')


def sc_dashboard_notices_scope(pg, base, check):
    """대시보드 공지 교차도메인 게이트(v1.5.87) — 공지사항 카드는 /board/notices 도메인 신호다. ADMIN 이
    공지 메뉴를 USER 에서 제한해 USER 를 게시판에서 리다이렉트시켜도 대시보드 미리보기로 공지가 새어
    나가면 안 된다(v1.5.86 opsVis 가 놓친 같은 페이지의 형제 결함). 출처 effectiveRoles 로 가드."""
    # USER(김현우) — /board/notices 제한 대상 → 대시보드 공지사항 카드 미노출('게시일' 헤더는 공지 카드 고유)
    login(pg, base, '김현우')
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    check(pg.locator('th', has_text='게시일').count() == 0,
          '메뉴 제한된 공지 도메인은 대시보드 미리보기에서도 미노출 (런타임 권한 정합)')
    # BIZ_MGR(박정호) — 비제한 → 공지사항 카드 정상 노출(카드가 전역 제거된 게 아님)
    login(pg, base, '박정호')
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    check(pg.locator('th', has_text='게시일').count() >= 1,
          '비제한 역할은 공지사항 카드 정상 노출(게이트 역할별 동작)')


def sc_dashboard_ops_scope(pg, base, check):
    """대시보드 '전사 운영 스냅샷' 런타임 메뉴권한 정합(v1.5.86) — 각 타일은 신호 출처 화면과 같은
    유효권한(effectiveRoles = menus ∩ menuOverrides)으로 노출한다. 정적 role 게이트면 ADMIN 이
    /infra/incidents 를 ADMIN 전용으로 제한해 담당자를 장애관리 화면에서 리다이렉트시켜도, 대시보드
    스냅샷에 '조치중 장애' 집계가 그대로 새어 나간다(출처 화면과 게이트 불일치). 제한된 타일만 숨고
    비제한 타일(미서약 인원)은 유지되며, 제한 예외인 ADMIN 은 정상 노출돼야 한다."""
    # BIZ_MGR(박정호) — /infra/incidents 제한 대상 → '조치중 장애' 타일 미노출, '미서약 인원' 타일은 유지
    login(pg, base, '박정호')
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    inc = pg.locator('.stat', has_text='조치중 장애')
    uns = pg.locator('.stat', has_text='미서약 인원')
    check(inc.count() == 0, '메뉴 제한된 장애 도메인은 대시보드 스냅샷 타일에서도 미노출 (런타임 권한 정합)')
    check(uns.count() >= 1, '비제한 타일(미서약 인원)은 유지 — 카드 자체가 사라지지 않음(거짓통과 방지)')
    # ADMIN(시스템관리자) — 제한 예외라 '조치중 장애' 타일 정상 노출(타일이 전역 제거된 게 아님을 확인)
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    check(pg.locator('.stat', has_text='조치중 장애').count() >= 1,
          'ADMIN 은 제한 예외 — 장애 타일 정상 노출(게이트가 역할별로 동작)')


def sc_approval_history_identity(pg, base, check):
    """결재 '이전 회차 이력' 신원 게이트(v1.5.54) — 회전 문서(출력물폐기 등)는 회차마다 ref 가 바뀌어
    유형·기안자로 이력을 잇는데, 그 매칭만으론 같은 기안자의 '별개 묶음'(내가 결재자·기안자가 아닌
    타 관리자 심사 건)까지 끌려와 반려사유가 노출된다. 이력 행도 본인 관여분(결재자/기안자)만 노출."""
    # 이수진 = 신규 묶음(AP-2026-9002)의 결재자. 구 묶음(9001)은 결재자 박정호라 이수진과 무관.
    login(pg, base, '이수진')
    pg.goto(f'{base}/work/approvals?sel=AP-2026-9002', wait_until='networkidle')
    body = pg.content()
    check('타관리자심사반려사유XYZ' not in body,
          '회전 이력에 타인 결재 묶음 반려사유 미노출 (신원 게이트 재적용)')
    check('AP-2026-9001' not in body, '무관 이전 묶음 결재번호 미노출')


def sc_revision(pg, base, check):
    """서약양식 개정(현재 시각) — 같은 날 개정 이전 서명도 무효화 → 전원 재서약 → 스캔본 등록.
    signedAt/revisedAt 시각(초) 단위 정밀도 검증(v1.5.33): 당일 개정 전 서명이 유효로 남으면 안 됨."""
    # 김현우가 오늘 일반 서약 (같은 날 개정 이전 서명)
    login(pg, base, '김현우')
    pg.goto(f'{base}/pledge/my', wait_until='networkidle')
    form = pg.locator('form:has(button:has-text("서약서 제출"))')
    form.locator('input[name=agree]').check()
    form.locator('button:has-text("서약서 제출")').click()
    pg.wait_for_selector('text=제출 완료', timeout=10000)
    check('제출 완료' in pg.content(), '오늘 일반 서약 완료')

    # 박정호가 지금(현재 시각) 개정 — 방금 김현우 서명 직후. 날짜 입력 없이 즉시 개정.
    login(pg, base, '박정호')
    pg.goto(f'{base}/pledge/manage', wait_until='networkidle')
    pg.locator('tr', has_text='일반 보안서약서').locator('button:has-text("개정")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/pledge/manage', wait_until='networkidle')
    # 당일 개정 이전 서명(김현우 포함)이 전부 무효화돼야 8명 — 시각 미보정(날짜 단위)이면 김현우가
    # 유효로 남아 7명이 된다. 이 검사가 곧 same-day 무효화 회귀 테스트다.
    check('8' in pg.locator('.stat', has_text='미서약').inner_text(), '같은 날 개정 → 당일 서명 포함 전원(8명) 재서약 대상')

    pg.locator('tr', has_text='강도윤').locator('button:has-text("스캔본 업로드")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/pledge/manage', wait_until='networkidle')
    check('7' in pg.locator('.stat', has_text='미서약').inner_text(), '스캔본 등록 → 미서약 감소')


def sc_project_pledge(pg, base, check):
    """프로젝트 참여 서약 — 양식 개정 후 현 개정본 재서명분만 집계(stale 과다계수 방지, v1.5.24).
    시각 타임스탬프(v1.5.33) 덕에 당일 개정으로 개정 전 서명을 무효화해 재현 가능."""
    def sign_project(member):
        login(pg, base, member)
        pg.goto(f'{base}/pledge/my', wait_until='networkidle')
        form = pg.locator('form:has(button:has-text("프로젝트 서약 제출"))')
        form.locator('select[name=projectRef]').select_option('PJ-2026-01')
        form.locator('input[name=agree]').check()
        form.locator('button:has-text("프로젝트 서약 제출")').click()
        pg.wait_for_load_state('networkidle')

    # PJ-2026-01 멤버 2명(김현우·박정호)이 프로젝트 서약
    sign_project('김현우')
    sign_project('박정호')
    pg.goto(f'{base}/projects/status', wait_until='networkidle')  # 박정호 로그인 상태
    check('2건' in pg.locator('tr', has_text='ERP 리포트 모듈 구축').inner_text(), '프로젝트 서약 2건 (2 멤버)')

    # ADMIN 이 프로젝트 양식을 지금 개정 — 두 서명 모두 개정 이전이 된다
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/pledge/manage', wait_until='networkidle')
    pg.locator('tr', has_text='프로젝트 보안서약서').locator('button:has-text("개정")').click()
    pg.wait_for_load_state('networkidle')

    # 1명(김현우)만 재서명
    sign_project('김현우')

    # 재서명분만 집계돼야 1건 — stale(개정 전) 2건 + 재서명 1건을 다 세면 3건(수정 전 결함)
    login(pg, base, '박정호')
    pg.goto(f'{base}/projects/status', wait_until='networkidle')
    check('1건' in pg.locator('tr', has_text='ERP 리포트 모듈 구축').inner_text(),
          '개정 후 재서명 1건만 집계 (stale 과다계수 방지; 수정 전이면 3건)')


def sc_pledge_multikind(pg, base, check):
    """비-일반 양식 개정도 재서약 할일·안내 생성 + 유형별 마감(교차마감 방지) — 후속조치 #4."""
    # 관리책임자·일반 양식을 모두 개정 → 박정호(비-USER)는 두 유형 재서약 할일을 갖는다
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/pledge/manage', wait_until='networkidle')
    pg.locator('tr', has_text='관리책임자 보안서약서').locator('button:has-text("개정")').click()
    pg.wait_for_load_state('networkidle')
    pg.locator('tr', has_text='일반 보안서약서').locator('button:has-text("개정")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '박정호')
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    card = pg.locator('.card', has_text='미처리 할일')
    check('관리책임자 보안서약서 재서약' in card.inner_text(), '관리책임자 개정 → 재서약 할일 생성 (비-일반 통지)')
    check('일반 보안서약서 재서약' in card.inner_text(), '일반 개정 → 재서약 할일 생성')

    # 관리책임자만 서약 → 관리책임자 재서약 할일만 닫히고 일반 재서약 할일은 유지돼야(교차마감 방지)
    pg.goto(f'{base}/pledge/my', wait_until='networkidle')
    mgr = pg.locator('.card', has_text='관리책임자 보안서약서')
    mgr.locator('input[name=agree]').check()
    mgr.locator('button:has-text("관리책임자 서약 제출")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    card = pg.locator('.card', has_text='미처리 할일')
    check('관리책임자 보안서약서 재서약' not in card.inner_text(), '관리책임자 서약 → 해당 유형 할일만 마감')
    check('일반 보안서약서 재서약' in card.inner_text(), '일반 재서약 할일은 유지 (유형 교차마감 방지)')


def sc_education_orphan(pg, base, check):
    """전사 이수율 — 퇴사자(people 밖) 교육 이력을 제외하고 재직자 기준 집계 (v1.5.24 orphan 수정).
    데이터 파일: 재직자A(이력 없음) 1명 + 퇴사자B 이력 1건 → 재직자 기준이면 0%,
    퇴사자 이력 산입(수정 전 결함)이면 100%(퇴사자 이력이 재직자 미이수를 상쇄)."""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/compliance/education', wait_until='networkidle')
    rate = pg.locator('.stat', has_text='전사 이수율').locator('.v').inner_text().strip()
    check(rate == '0%', f'퇴사자 이력 제외 → 재직자 기준 0% (수정 전이면 100%; 실제 {rate})')
    # 연간계획 '이수 인원' 열도 재직자 기준 — ED-90 은 재직자A 미이수라 0/1 (퇴사자B 이력이 분자에
    # 들어가면 1/1 로 부풀어 이수 인원>대상 처럼 보인다). v1.5.51 per-course 이수 인원 재직자 스코프.
    plan_card = pg.locator('.card', has_text='연간계획 — 교육 과정').inner_text()
    check('0 / 1' in plan_card, 'ED-90 이수 인원 재직자 기준 0/1 (퇴사자 분자 제외; 수정 전이면 1/1)')


def sc_finance_exec_rate(pg, base, check):
    """계획대비 집행률 — 분자(집행)를 확정 계획 계약에 스코프 정합 (v1.5.25). 계획외 지급은
    분모(확정 계획) 밖인데 분자에 산입되면 100%를 넘는다. 데이터: 확정계획 1000·계획내 지급
    1000 + 계획외 지급 500 → 확정 스코프면 100%, 전체 산입(수정 전)이면 150%."""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/finance/invest', wait_until='networkidle')
    rate = pg.locator('.stat', has_text='집행률').locator('.v').inner_text().strip()
    check(rate == '100%', f'집행률 확정 계획 스코프 = 100% (수정 전 계획외 산입이면 150%; 실제 {rate})')


def sc_year_filter(pg, base, check):
    """일반 서약 집계 year 필터 (v1.5.32) — 대시보드가 개정본 유효 판정에 year 를 반영해야
    레거시 데이터(year≠2026 서약)를 서명으로 오인하지 않는다. 데이터: 재직자C 가 2025 서약만
    보유 → year 필터면 2026 미서약 1명, 미필터(수정 전)면 0명."""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    n = pg.locator('.stat', has_text='미서약 인원').locator('.v').inner_text().strip()
    check(n == '1', f'2025(레거시) 서약은 2026 미서약으로 집계 (year 필터; 수정 전이면 0; 실제 {n})')


def sc_education_target(pg, base, check):
    """교육 이수율 대상(target) 스코프 (v1.5.51, 컴플라이언스/ISMS 재감사 finding) — 개발자 전용
    과정을 개발자가 이수하면 전사 이수율 100%. 대상 무시(수정 전)면 비개발자도 분모에 넣어 50%로
    왜곡하고 이수현황에서 비개발자를 미이수로 오표기(0/1). 대상 스코프면 비대상자는 0/0."""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/compliance/education', wait_until='networkidle')
    rate = pg.locator('.stat', has_text='전사 이수율').locator('.v').inner_text().strip()
    check(rate == '100%', f'개발자 과정 대상 스코프 → 100% (대상 무시면 50%; 실제 {rate})')
    table = pg.locator('.card', has_text='이수현황 — 전 임직원').inner_text()
    check('0 / 0' in table, '비개발자(일반E)는 개발자 과정 미대상 — 0/0 (대상 무시면 0/1 미이수 오표기)')


def sc_change_resign_orphan(pg, base, check):
    """변경 재상신 교차-담당 고아 할일 (v1.5.50, SR/변경 재감사 finding #1) — 변경결과 반려로 생긴
    박정호 소유 재상신 할일을, 시스템관리자(교차 담당)가 결과를 재상신할 때 닫아야 한다. 소유자
    무관 닫기(closeChangeResignTodo)가 없으면 draftApproval 의 기안자-매칭이 놓쳐 박정호 할일이
    고아로 남고 방치 알림이 무한 반복된다."""
    # 시스템관리자(박정호 아님)가 CW-2026-9001 결과를 재상신
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/infra/changes', wait_until='networkidle')
    row = pg.locator('tr', has_text='CW-2026-9001')
    row.locator('input[name=result]').fill('보완 완료 — 재상신')
    row.locator('button:has-text("결과 상신")').click()
    pg.wait_for_load_state('networkidle')
    # 박정호 할일함에서 그 재상신 할일이 닫혔는지 — 미처리 카드에 없어야 한다
    login(pg, base, '박정호')
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    open_card = pg.locator('.card', has_text='미처리 할일').inner_text()
    check('변경결과 상신] CW-2026-9001 반려' not in open_card,
          '교차-담당 재상신이 원 기안자 재상신 할일을 닫음 (수정 전이면 고아로 잔류)')


def sc_manual_backup(pg, base, check):
    """수동 배치 백업 (v1.5.48, notify/scheduler 재감사 finding #3) — 백업은 스케줄러 틱에서만
    돌아, 외부 스케줄러 사용(NOTIFY_INTERVAL 미설정)+영속화 켬 배포에선 스냅샷이 안 생겼다.
    수동 '알림 배치 실행'도 백업을 남겨야 그 모드에 복구 지점이 생긴다(스케줄러 off 로 부팅)."""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    pg.click('button:has-text("알림 배치 실행")')
    pg.wait_for_load_state('networkidle')
    pg.reload(wait_until='networkidle')  # 서버 액션(RSC) 후 최신 배치 이력 재조회
    hist = pg.locator('.card', has_text='배치 실행 이력').inner_text()
    check('수동 배치' in hist and '백업' in hist, '수동 배치가 데이터 파일 백업 기록을 남김 (스케줄러 off 복구지점)')
    # 실제 .bak 스냅샷 파일도 생성됐는지 확인
    import pathlib
    baks = list(pathlib.Path(BACKUP_DATA).parent.glob(pathlib.Path(BACKUP_DATA).name + '.*.bak'))
    check(len(baks) > 0, '.bak 스냅샷 파일 생성 확인')


def sc_reject_reason_collision(pg, base, check):
    """재상신 할일 닫기 앵커 매칭 (v1.5.47, 최대정밀 재감사 finding #5) — 반려 SR 2건 중 SR-B 의
    재상신 할일 사유에 SR-A 번호가 인용돼 있다. SR-A 재상신 시, 앵커(유형+ref 선두) 매칭이면
    SR-A 할일만 닫히고 SR-B 할일은 유지된다. 부분문자열 매칭(수정 전)이면 SR-B 사유의 SR-A
    토큰에 걸려 SR-B 재상신 할일까지 오마감돼 보완 의무가 사라진다."""
    login(pg, base, '김현우')
    pg.goto(f'{base}/sr/requests', wait_until='networkidle')
    # SR-A(9001) 재상신 버튼 클릭
    pg.locator('tr', has_text='SR-2026-9001').locator('button:has-text("재상신")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    # '미처리' 재상신 할일 수로 판정(데이터 파일이 todos 배열을 대체하므로 초기 2건: SR-A·SR-B).
    # SR-A 재상신 후 — 앵커 매칭이면 1건(SR-B 유지), 부분문자열 매칭(수정 전)이면 0건(SR-B 오마감),
    # 재상신 미실행(셋업 오류)이면 2건. 셋 다 구분해 오마감·거짓통과를 함께 잡는다.
    n = pg.locator('.stat', has_text='미처리').locator('.v').inner_text().strip()
    check(n == '1', f'SR-A 재상신 후 미처리 재상신 1건(SR-B 유지) — 수정 전이면 0(SR-B 오마감), 미실행이면 2 (실제 {n})')
    open_card = pg.locator('.card', has_text='미처리 할일').inner_text()
    check('SR-2026-9002' in open_card, 'SR-B 재상신 할일이 미처리로 유지')


def sc_export_kind_scope(pg, base, check):
    """export invest-actual 집계를 kind 로 스코프 (v1.5.25) — 비용 계약이 투자 계획을 참조하는
    크로스-kind 오염을 심어도 투자 export 에 산입되면 안 된다. 데이터: 투자계획 1000·투자 지급
    1000 + 비용계약(투자계획 참조) 지급 500 → 투자 집행률 100%, kind 미필터(수정 전)면 150%."""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/finance/invest', wait_until='networkidle')  # 세션 쿠키 확보
    csv = pg.request.get(f'{base}/api/export?type=invest-actual').text()
    # P1 행: 수정 시 계약/집행/집행률 1000·1000·100, 미수정 시 크로스 비용 산입으로 1500·1500·150
    check('150' not in csv, '투자 export 가 크로스-kind 비용 지급을 제외 (수정 전이면 150 등장)')


def sc_adapter_fault(pg, base, check):
    """어댑터 결함 내성 (v1.5.16 throw·v1.5.17 hang→timeout) — 인사 어댑터가 예외·무응답이어도
    수동 동기화가 화면을 죽이지 않고(200·무크래시) 실패로 기록한다. PORTAL_FAULT_HR 로 주입."""
    login(pg, base, '시스템관리자')
    # 페이지 로드가 성공하는 것 자체가 hang 내성 검증 — 자가진단(conformance)도 withTimeout 로
    # 감싸져 무응답 어댑터에 매달리지 않는다(예전엔 여기서 goto 가 무한 대기).
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    pg.click('button:has-text("인사정보 즉시 동기화")')
    # 서버 액션 재렌더 대기 — networkidle 은 POST 전에 통과할 수 있어 실패 기록 셀렉터로 기다린다
    pg.wait_for_selector('text=연동 예외', timeout=15000)
    body = pg.content()
    check('연동 예외' in body, '어댑터 결함 → 동기화 실패로 기록 (연동 예외)')
    check('문제가 발생' not in body and 'Application error' not in body, '어댑터 결함에도 화면 정상 렌더(무크래시)')


def sc_adapter_malformed(pg, base, check):
    """어댑터 계약 위반 내성(v1.5.69) — 인사 어댑터가 resolve 된 오형(비배열 {data,total})을 반환해도 syncHr 이
    형태 검증으로 거부해 s.people 오염을 막는다(withTimeout·try/catch 는 throw·hang 만 잡음). 스토어 보존 →
    s.people.filter/.map 쓰는 후속 화면이 500 나지 않는다. PORTAL_FAULT_HR=malformed 주입."""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    pg.click('button:has-text("인사정보 즉시 동기화")')
    pg.wait_for_selector('text=계약 위반', timeout=15000)
    check('계약 위반' in pg.content(), '계약 위반(오형) 응답 → 동기화 실패로 기록')
    # 핵심 — s.people 이 {data,total} 로 오염됐다면 s.people.map 을 쓰는 /pledge/dept 가 500. 기존 명단 보존 확인.
    resp = pg.goto(f'{base}/pledge/dept', wait_until='networkidle')
    check(resp.status == 200, '오형 동기화에도 s.people 보존 → 후속 화면 무크래시(스토어 미오염)')


def sc_adapter_asset_malformed(pg, base, check):
    """자산 어댑터 계약 위반 내성(v1.5.74) — searchAssets 가 비배열({data,total} REST 봉투)을 resolve 해도
    수집 지점 형태검증이 걸러 /finance/asset-reg 가 500 없이 렌더된다(.catch 는 reject 만 흡수, 오형 resolve 는
    assets.filter/.map 500 유발). PORTAL_FAULT_ASSET=malformed 주입 — HR 계약검증(v1.5.69)의 자산 경로 패리티."""
    login(pg, base, '시스템관리자')
    resp = pg.goto(f'{base}/finance/asset-reg', wait_until='networkidle')
    check(resp.status == 200, '비배열 자산 조회 응답에도 자산등록 화면 무크래시(수집 형태검증)')
    body = pg.content()
    check('문제가 발생' not in body and 'Application error' not in body and 'something went wrong' not in body.lower(),
          '오형 자산 조회에도 오류 바운더리 미표시(정상 렌더)')


def sc_adapter_asset_badfield(pg, base, check):
    """자산 어댑터 계약 위반 내성(v1.5.82) — searchAssets 가 유효 4필드 + assetNo 를 객체값({})으로 resolve 해도
    수집 필터가 assetNo 형태검증으로 걸러 /finance/asset-reg 가 500 없이 렌더된다({a.assetNo} 직접 렌더의 React
    child 500 방지, v1.5.74 가 놓친 렌더 필드). PORTAL_FAULT_ASSET=badfield 주입."""
    login(pg, base, '시스템관리자')
    resp = pg.goto(f'{base}/finance/asset-reg', wait_until='networkidle')
    check(resp.status == 200, '객체값 assetNo 응답에도 자산등록 화면 무크래시(assetNo 형태검증)')
    body = pg.content()
    check('문제가 발생' not in body and 'Application error' not in body and 'something went wrong' not in body.lower(),
          '객체값 assetNo 에도 오류 바운더리 미표시(정상 렌더)')


def sc_adapter_secdata_badfield(pg, base, check):
    """secdata 어댑터 dept/pages 객체값 내성(v1.5.83) — fetchPrintouts 가 유효 name/document/printedAt + 객체
    pages/dept 를 resolve 해도 수집 검증(importDaily)이 걸러 /awareness/prints 가 {p.pages}/{p.dept} 직접 렌더에서
    React child 500 나지 않는다(인메모리 주입 경로는 loadFromFile 정규화 우회). channelStates{security-db:true} +
    PORTAL_FAULT_SECDATA=badfield 주입 → 전일자 이관 실행 → 무크래시."""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/awareness/prints', wait_until='networkidle')
    pg.click('button:has-text("전일자 이관 실행")')
    pg.wait_for_load_state('networkidle')
    resp = pg.goto(f'{base}/awareness/prints', wait_until='networkidle')
    check(resp.status == 200, '객체 pages/dept 이관 행에도 출력물 화면 무크래시(dept·pages 수집 검증)')
    body = pg.content()
    check('문제가 발생' not in body and 'Application error' not in body and 'something went wrong' not in body.lower(),
          '객체 pages/dept 이관에도 오류 바운더리 미표시')


def sc_deptpledge_resign(pg, base, check):
    """부서서약 fresh 상신 과다마감 방지(v1.5.84 AP3-3) — 부서서약을 비회전·부서명 ref 로 바꿔, 무관한 타 부서의
    일상(fresh) 상신이 반려된 부서의 재상신 할일을 개수기반으로 과다마감하지 않는다. 개발1팀 반려 재상신
    할일(owner 박정호) 주입 → ADMIN 이 경영지원팀 현황을 fresh 상신 → 개발1팀 재상신 할일이 잔존해야 한다
    (회전이면 최오래된 [부서서약 현황 상신] 할일=개발1팀이 닫혀 반려방치 알림 영구 소실)."""
    login(pg, base, '시스템관리자')  # ADMIN — 전 부서 조회, 반려와 무관한 부서 상신
    pg.goto(f'{base}/pledge/dept', wait_until='networkidle')
    pg.locator('.card', has_text='경영지원팀').first.locator('button:has-text("현황 결재상신")').click()
    pg.wait_for_load_state('networkidle')
    login(pg, base, '박정호')  # 개발1팀 반려 재상신 할일 소유자
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    open_card = pg.locator('.card', has_text='미처리 할일')
    check('[부서서약 현황 상신] 개발1팀' in open_card.inner_text(),
          '무관한 타 부서 fresh 상신 → 반려 부서 재상신 할일 과다마감 안 됨(잔존)')


def sc_apply_resubmit_route(pg, base, check):
    """적용요청 재상신 할일 라우팅(v1.5.85) — 적용요청 상신 반려 재상신 할일의 '재상신하기' 링크가 /sr/manage
    (submitApply 재상신처)로 가야 한다. RESUBMIT_HREF 에 적용요청 상신 누락 시 KIND_HREF 폴백으로 /sr/requests
    (테스트 상태 SR 엔 재상신 버튼 없음)로 빠져 폐쇄루프 데드엔드·반려방치 알림 무한. 적용요청 재상신 할일 주입."""
    login(pg, base, '박정호')  # 재상신 할일 소유자
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    href = pg.locator('a:has-text("재상신하기")').first.get_attribute('href')
    check(href is not None and href.endswith('/sr/manage'),
          f'적용요청 상신 재상신 할일 → /sr/manage 라우팅 (실제 {href})')


def sc_codes(pg, base, check):
    """공통코드 토글·사용기간·추가·삭제 → 장애 등록 선택지 반영 (요구사항 73행)"""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/settings/codes', wait_until='networkidle')
    pg.locator('.card', has_text='장애등급').locator('tr', has_text='3등급').locator('button:has-text("중지")').click()
    pg.wait_for_load_state('networkidle')

    # 사용기간 만료 — 종료일이 지난 코드는 신규 선택지에서 빠진다
    pg.goto(f'{base}/settings/codes', wait_until='networkidle')
    row2 = pg.locator('.card', has_text='장애등급').locator('tr', has_text='2등급')
    row2.locator('input[name=until]').fill('2026-01-01')
    row2.locator('button:has-text("기간 저장")').click()
    pg.wait_for_selector('tr:has-text("2등급"):has-text("기간만료")', timeout=10000)

    # 코드 추가 — 새 값이 즉시 업무 선택지에 들어온다
    card = pg.locator('.card', has_text='장애등급')
    card.locator('input[placeholder="새 코드값"]').fill('4등급')
    card.locator('button:has-text("코드 추가")').click()
    pg.wait_for_selector('tr:has-text("4등급")', timeout=10000)

    login(pg, base, '박정호')
    pg.goto(f'{base}/infra/incidents', wait_until='networkidle')
    opts = pg.locator('select[name=grade] option').all_inner_texts()
    check(opts == ['1등급', '4등급'], f'중지·기간만료 제외, 추가 반영 ({opts})')

    # 코드 삭제 — 값이 목록·선택지에서 함께 사라진다
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/settings/codes', wait_until='networkidle')
    pg.locator('.card', has_text='장애등급').locator('tr', has_text='4등급').locator('button:has-text("삭제")').click()
    pg.wait_for_load_state('networkidle')
    login(pg, base, '박정호')
    pg.goto(f'{base}/infra/incidents', wait_until='networkidle')
    opts = pg.locator('select[name=grade] option').all_inner_texts()
    check(opts == ['1등급'], f'코드 삭제 반영 ({opts})')

    # 하드코딩이던 소비처(SR유형 등)도 코드표 구동인지 — SR_KIND '데이터' 중지 → SR 신청 선택지 제외
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/settings/codes', wait_until='networkidle')
    pg.locator('.card', has_text='SR 유형').locator('tr', has_text='데이터').locator('button:has-text("중지")').click()
    pg.wait_for_load_state('networkidle')
    login(pg, base, '김현우')
    pg.goto(f'{base}/sr/new', wait_until='networkidle')
    kinds = pg.locator('select[name=kind] option').all_inner_texts()
    check('데이터' not in kinds and '시스템개발' in kinds, f'공통코드(SR유형) 중지 → SR 신청 선택지 제외 ({kinds})')


def sc_racks(pg, base, check):
    """랙·H/W 관리 (요구사항 28~30행) — 등록·구성도 반영·사용중 삭제 가드"""
    login(pg, base, '박정호')
    pg.goto(f'{base}/infra/racks', wait_until='networkidle')

    # 랙 등록 → H/W 를 새 랙에 장착 → 구성도에 사슬이 나타난다
    rack_card = pg.locator('.card', has_text='랙관리')
    rack_card.locator('input[name=id]').fill('C-01')
    rack_card.locator('input[name=location]').fill('본사 전산실 C열 1번')
    rack_card.locator('input[name=sizeU]').fill('42')
    rack_card.locator('input[name=assetNo]').fill('AST-RK-0099')
    rack_card.locator('button:has-text("랙 등록")').click()
    pg.wait_for_selector('tr:has-text("C-01")', timeout=10000)

    hw_card = pg.locator('.card', has_text='H/W 관리')
    hw_card.locator('select[name=kind]').select_option('스토리지')
    hw_card.locator('input[name=model]').fill('E2E 스토리지 어레이')
    hw_card.locator('select[name=rackId]').select_option('C-01')
    hw_card.locator('input[name=assetNo]').fill('AST-HW-0099')
    hw_card.locator('button:has-text("H/W 등록")').click()
    pg.wait_for_selector('tr:has-text("E2E 스토리지 어레이")', timeout=10000)
    topo = pg.locator('.card', has_text='랙구성도')
    check('E2E 스토리지 어레이' in topo.inner_text(), 'H/W 등록 → 구성도 반영')
    check('ngv-db-01' in topo.inner_text(), '구성도 랙→H/W→서버 사슬 (시드)')

    # 사용중 가드 — H/W 장착 랙·서버 탑재 H/W 는 삭제 불가, 빈 자산은 삭제
    rack_row = pg.locator('.card', has_text='랙관리').locator('tr', has_text='C-01')
    check('사용중' in rack_row.inner_text(), 'H/W 장착 랙 삭제 가드')
    pg.locator('.card', has_text='H/W 관리').locator('tr', has_text='E2E 스토리지 어레이').locator('button:has-text("삭제")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/infra/racks', wait_until='networkidle')
    check('E2E 스토리지 어레이' not in pg.content(), '미사용 H/W 삭제')
    pg.locator('.card', has_text='랙관리').locator('tr', has_text='C-01').locator('button:has-text("삭제")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/infra/racks', wait_until='networkidle')
    check('C-01' not in pg.locator('.card', has_text='랙관리').inner_text(), '빈 랙 삭제')


def sc_infracrud(pg, base, check):
    """인프라 CRUD (요구사항 31~34행) — 서버·시스템·배치·인터페이스 등록·참조 가드·삭제"""
    login(pg, base, '박정호')
    pg.goto(f'{base}/infra/systems', wait_until='networkidle')

    # 서버 등록 (H/W 선택 → 랙 자동) → 시스템 등록 (서버 매핑) → 서버는 '사용중' 가드
    sv_card = pg.locator('.card', has_text='서버 · 랙 구성')
    sv_card.locator('input[name=hostname]').fill('ngv-e2e-01')
    sv_card.locator('input[name=ip]').fill('10.10.9.99')
    sv_card.locator('input[name=os]').fill('Rocky Linux 9')
    sv_card.locator('select[name=hwId]').select_option('HW-05')
    sv_card.locator('button:has-text("서버 등록")').click()
    pg.wait_for_selector('tr:has-text("ngv-e2e-01")', timeout=10000)
    check('B-01' in pg.locator('tr', has_text='ngv-e2e-01').inner_text(), '서버 등록 — 랙은 H/W 를 따른다')

    sys_card = pg.locator('.card', has_text='시스템 현황')
    sys_card.locator('input[name=name]').fill('E2E 테스트시스템')
    sys_card.locator('input[name=url]').fill('https://e2e.internal')
    sys_card.locator('select[name=serverId]').select_option(label='ngv-e2e-01')
    sys_card.locator('input[name=owner]').fill('박정호')
    sys_card.locator('button:has-text("시스템 등록")').click()
    pg.wait_for_selector('tr:has-text("E2E 테스트시스템")', timeout=10000)
    check('사용중' in pg.locator('.card', has_text='서버 · 랙 구성').locator('tr', has_text='ngv-e2e-01').inner_text(),
          '시스템 매핑 서버 삭제 가드')

    # 배치 등록(새 시스템 대상) → 시스템은 '사용중' 가드 → 배치 삭제 → 시스템·서버 순차 삭제
    pg.goto(f'{base}/infra/operations', wait_until='networkidle')
    bj_card = pg.locator('.card', has_text='배치관리')
    bj_card.locator('input[name=name]').fill('E2E 야간 집계')
    bj_card.locator('select[name=system]').select_option('E2E 테스트시스템')
    bj_card.locator('button:has-text("배치 등록")').click()
    pg.wait_for_selector('tr:has-text("E2E 야간 집계")', timeout=10000)
    pg.goto(f'{base}/infra/systems', wait_until='networkidle')
    check('사용중' in pg.locator('.card', has_text='시스템 현황').locator('tr', has_text='E2E 테스트시스템').inner_text(),
          '배치 참조 시스템 삭제 가드')
    pg.goto(f'{base}/infra/operations', wait_until='networkidle')
    pg.locator('tr', has_text='E2E 야간 집계').locator('button:has-text("삭제")').click()
    pg.wait_for_load_state('networkidle')

    # 인터페이스 등록·삭제 — 이름을 수식 트리거로 시작시켜 CSV 주입 방어(CWE-1236)도 함께 검증
    if_card = pg.locator('.card', has_text='인터페이스관리')
    if_card.locator('input[name=name]').fill('=E2E 연계 테스트')
    if_card.locator('input[name=from]').fill('포털')
    if_card.locator('input[name=to]').fill('E2E 테스트시스템')
    if_card.get_by_role('button', name='등록', exact=True).click()
    pg.wait_for_selector('tr:has-text("E2E 연계 테스트")', timeout=10000)
    csv_text = pg.request.get(f'{base}/api/export?type=interfaces').text()
    check("'=E2E 연계 테스트" in csv_text, "CSV 수식 주입 무력화 ('= 접두)")
    pg.locator('tr', has_text='E2E 연계 테스트').locator('button:has-text("삭제")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/infra/operations', wait_until='networkidle')
    check('E2E 연계 테스트' not in pg.content(), '인터페이스 등록·삭제')

    # 참조가 없어진 시스템 → 서버 순으로 삭제된다
    pg.goto(f'{base}/infra/systems', wait_until='networkidle')
    pg.locator('.card', has_text='시스템 현황').locator('tr', has_text='E2E 테스트시스템').locator('button:has-text("삭제")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/infra/systems', wait_until='networkidle')
    pg.locator('.card', has_text='서버 · 랙 구성').locator('tr', has_text='ngv-e2e-01').locator('button:has-text("삭제")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/infra/systems', wait_until='networkidle')
    check('ngv-e2e-01' not in pg.content() and 'E2E 테스트시스템' not in pg.content(), '참조 해제 후 시스템·서버 삭제')


def sc_infra_health(pg, base, check):
    """인프라 운영 헬스 신호(v1.5.154~) — 배치 실패·인터페이스 오류·디스크 경고를 lib/infra computeInfraHealth
    단일원천으로 운영·시스템 화면·대시보드·IT운영 종합 export 가 공유한다. 대시보드 타일이 출처 화면 수치와
    일치하는지(단일원천), 종합 현황 export 에 인프라 행이 나오는지 검증."""
    login(pg, base, '박정호')  # BIZ_MGR — 인프라·대시보드·종합 export 열람
    # 출처 화면 수치 — 운영(배치 실패·인터페이스 오류), 시스템(디스크 경고)
    pg.goto(f'{base}/infra/operations', wait_until='networkidle')
    ops_fail = pg.locator('.stat', has_text='배치 실패').first.locator('.v').inner_text().strip()
    ops_if = pg.locator('.stat', has_text='인터페이스 오류').first.locator('.v').inner_text().strip()
    pg.goto(f'{base}/infra/systems', wait_until='networkidle')
    sys_disk = pg.locator('.stat', has_text='디스크 경고').first.locator('.v').inner_text().strip()
    # 대시보드 전사 운영 스냅샷 — 인프라 타일 존재 + 출처 화면과 값 일치(단일원천)
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    snap = pg.locator('.card', has_text='전사 운영 스냅샷')
    check(snap.locator('.stat', has_text='배치 실패').count() > 0
          and snap.locator('.stat', has_text='인터페이스 오류').count() > 0
          and snap.locator('.stat', has_text='디스크 경고').count() > 0,
          '대시보드 전사 운영 스냅샷에 인프라 헬스 3타일(배치·인터페이스·디스크)')
    db_fail = snap.locator('.stat', has_text='배치 실패').first.locator('.v').inner_text().strip()
    db_if = snap.locator('.stat', has_text='인터페이스 오류').first.locator('.v').inner_text().strip()
    db_disk = snap.locator('.stat', has_text='디스크 경고').first.locator('.v').inner_text().strip()
    check(db_fail == ops_fail and db_if == ops_if and db_disk == sys_disk,
          f'대시보드 인프라 타일=출처 화면(단일원천) 배치{db_fail}/{ops_fail}·IF{db_if}/{ops_if}·디스크{db_disk}/{sys_disk}')
    # IT 운영 종합 현황 export 에 인프라 운영 행(BIZ_MGR 권한)
    csv_text = pg.request.get(f'{base}/api/export?type=itops-summary').text()
    check('인프라 운영' in csv_text and '디스크 경고' in csv_text,
          'IT 운영 종합 export 에 인프라 헬스 행 포함(배치·인터페이스·디스크)')


def sc_finance_exec(pg, base, check):
    """재무 집행률 단일 원천(v1.5.160~) — 투자·비용 계획 대비 집행률을 lib/finance computeFinanceKpis 로
    화면(invest·expense)·대시보드·IT운영 종합 export 가 공유한다(과거 3중 복제 drift 위험 제거). 세 곳
    수치가 일치하는지 검증."""
    login(pg, base, '시스템관리자')  # ADMIN — 재무 전체 열람·대시보드·종합 export

    def csv_val(csv_text, label):
        for line in csv_text.splitlines():
            if line.startswith(label + ',') or line.startswith('"' + label + '"'):
                return line.split(',')[1].strip().strip('"')
        return None

    # 화면 집행률 (투자·비용 각 관리 화면)
    pg.goto(f'{base}/finance/invest', wait_until='networkidle')
    inv_screen = pg.locator('.stat', has_text='계획 대비 집행률').first.locator('.v').inner_text().strip()
    pg.goto(f'{base}/finance/expense', wait_until='networkidle')
    exp_screen = pg.locator('.stat', has_text='계획 대비 집행률').first.locator('.v').inner_text().strip()
    # 대시보드 전사 운영 스냅샷 타일 — 재무 화면 값과 일치(단일원천)
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    snap = pg.locator('.card', has_text='전사 운영 스냅샷')
    inv_dash = snap.locator('.stat', has_text='투자 집행률').first.locator('.v').inner_text().strip()
    exp_dash = snap.locator('.stat', has_text='비용 집행률').first.locator('.v').inner_text().strip()
    check(inv_dash == inv_screen and exp_dash == exp_screen,
          f'대시보드 집행률=재무 화면(단일원천) 투자{inv_dash}/{inv_screen}·비용{exp_dash}/{exp_screen}')
    # IT 운영 종합 export 행 — 화면 값과 일치
    csv_text = pg.request.get(f'{base}/api/export?type=itops-summary').text()
    inv_csv = csv_val(csv_text, '투자 집행률')
    exp_csv = csv_val(csv_text, '비용 집행률')
    check(inv_csv == inv_screen and exp_csv == exp_screen,
          f'IT운영 export 집행률=재무 화면(단일원천) 투자{inv_csv}/{inv_screen}·비용{exp_csv}/{exp_screen}')


def sc_project_pmo(pg, base, check):
    """프로젝트 PMO 신호·대장(v1.5.167~) — 오픈 이슈·높은 리스크를 lib/projects computeProjectPmo 로 화면
    (schedule)·대시보드가 공유하고, 이슈·리스크·산출물 대장을 export 한다. 대시보드=화면 정합(단일원천),
    두 대장 다운로드를 검증."""
    login(pg, base, '시스템관리자')  # ADMIN — schedule·대시보드·export 열람
    # schedule 화면 stat (오픈 이슈·높은 리스크)
    pg.goto(f'{base}/projects/schedule', wait_until='networkidle')
    scr_open = pg.locator('.stat', has_text='오픈 이슈').first.locator('.v').inner_text().strip()
    scr_risk = pg.locator('.stat', has_text='높은 리스크').first.locator('.v').inner_text().strip()
    # 대시보드 전사 운영 스냅샷 타일 == 화면(단일원천)
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    snap = pg.locator('.card', has_text='전사 운영 스냅샷')
    db_open = snap.locator('.stat', has_text='프로젝트 오픈 이슈').first.locator('.v').inner_text().strip()
    db_risk = snap.locator('.stat', has_text='프로젝트 높은 리스크').first.locator('.v').inner_text().strip()
    check(db_open == scr_open and db_risk == scr_risk,
          f'대시보드 프로젝트 신호=schedule 화면(단일원천) 오픈{db_open}/{scr_open}·리스크{db_risk}/{scr_risk}')
    # 이슈·리스크 / 산출물 대장 export (PMO 보고 근거)
    pi_csv = pg.request.get(f'{base}/api/export?type=project-issues').text()
    dl_csv = pg.request.get(f'{base}/api/export?type=deliverables').text()
    check('이슈 · 리스크' in pi_csv and '레거시 리포트 데이터 정합성 오류' in pi_csv, '이슈·리스크 대장 export (PMO 보고 근거)')
    check('산출물' in dl_csv and '통합테스트 결과서' in dl_csv, '산출물 대장 export (기한 경과 포함)')


def sc_incident_stats(pg, base, check):
    """월별 장애 통계 export(v1.5.173~) — 발생월×등급 집계를 lib/infra monthlyIncidentStats 로 화면 통계표와
    export 가 공유한다. 화면 첫 월 행의 '계'가 export 의 같은 월 '계'와 일치하는지(단일원천) 검증."""
    login(pg, base, '박정호')  # BIZ_MGR — 장애·export 열람
    pg.goto(f'{base}/infra/incidents', wait_until='networkidle')
    card = pg.locator('.card', has_text='월별 장애 통계')
    check('발생월' in card.inner_text(), '월별 장애 통계표 렌더(발생월 × 등급)')
    cells = card.locator('tbody tr').first.locator('td').all_inner_texts()
    scr_month = cells[0].strip()
    scr_total = cells[-2].strip()  # 컬럼: 발생월 · [등급...] · 계 · 조치완료 → 계는 뒤에서 둘째
    # export CSV 의 같은 월 행 '계'와 대조
    csv_text = pg.request.get(f'{base}/api/export?type=incident-stats').text()
    check('발생월' in csv_text, '월별 장애 통계 export 헤더(발생월)')
    row = next((l for l in csv_text.splitlines() if l.startswith(scr_month + ',')), None)
    csv_total = row.split(',')[-2].strip().strip('"') if row else None
    check(csv_total == scr_total, f'월별 통계 export 계=화면(단일원천) {scr_month} {csv_total}/{scr_total}')


def sc_criteria(pg, base, check):
    """보안점검 기준관리 (요구사항 62행) — 등록(중분류)·CSV 업로드·삭제·사용중 가드"""
    login(pg, base, '박정호')
    pg.goto(f'{base}/compliance/inspection', wait_until='networkidle')
    card = pg.locator('.card', has_text='기준관리 — 점검 항목')
    card.locator('input[name=category]').fill('운영보안')
    card.locator('input[name=subCategory]').fill('백업')
    card.locator('input[name=control]').fill('E2E 백업 복구훈련 점검')
    card.locator('button:has-text("기준 등록")').click()
    pg.wait_for_selector('tr:has-text("E2E 백업 복구훈련 점검")', timeout=10000)
    check('백업' in pg.locator('tr', has_text='E2E 백업 복구훈련 점검').inner_text(), '기준 등록 (중분류 포함)')

    # CSV 업로드 — 유효 1행 반영, 잘못된 주기·중복 통제 항목은 건너뛴다
    csv_path = UPLOAD.parent / '.e2e-criteria.csv'
    csv_path.write_text('개인정보,E2E 파기대장 점검,반기,ISMS,파기\n개인정보,잘못된 주기 행,매일,ISMS\n', encoding='utf-8')
    card = pg.locator('.card', has_text='기준관리 — 점검 항목')
    card.locator('input[type=file]').set_input_files(str(csv_path))
    card.locator('button:has-text("업로드 반영")').click()
    pg.wait_for_selector('tr:has-text("E2E 파기대장 점검")', timeout=10000)
    check('잘못된 주기 행' not in pg.content(), 'CSV 업로드 — 무효 행 건너뜀')
    try:
        csv_path.unlink(missing_ok=True)
    except OSError:
        pass

    # 삭제 — 미사용 항목은 삭제, 계획이 참조 중인 항목(CK-01)은 '사용중' 가드
    pg.locator('tr', has_text='E2E 파기대장 점검').locator('button:has-text("삭제")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/compliance/inspection', wait_until='networkidle')
    check('E2E 파기대장 점검' not in pg.content(), '미사용 기준 삭제')
    row = pg.locator('.card', has_text='기준관리 — 점검 항목').locator('tr', has_text='중요 시스템 계정·권한 정기 검토')
    check('사용중' in row.inner_text() and row.locator('button:has-text("삭제")').count() == 0, '사용중 기준 삭제 가드')

    # 2단 결재 (제품안내서 IV장 — 부서장 → 담당부서장): 결과 상신 → 1차(이수진) 중간 승인 → 2차(시스템관리자) 최종 승인
    prog = pg.locator('.card', has_text='점검 진행내역').locator('tr', has_text='IS-2026-22')
    prog.locator('input[name=result]').fill('E2E 점검 결과')
    prog.locator('button:has-text("결과 결재상신")').click()
    pg.wait_for_selector('tr:has-text("IS-2026-22"):has-text("결재중")', timeout=10000)

    login(pg, base, '이수진')
    approve_first(pg, base, '[보안점검결과-점검항목]')
    login(pg, base, '박정호')
    pg.goto(f'{base}/compliance/inspection', wait_until='networkidle')
    check('결재중' in pg.locator('tr', has_text='IS-2026-22').inner_text(), '1차 승인 — 아직 결재중 (2차 회부)')

    login(pg, base, '시스템관리자')
    approve_first(pg, base, '[보안점검결과-점검항목]')
    pg.goto(f'{base}/compliance/inspection', wait_until='networkidle')
    check('완료' in pg.locator('tr', has_text='IS-2026-22').inner_text(), '2차 최종 승인 → 완료 전파')


def sc_menuauth(pg, base, check):
    """메뉴권한 런타임 제한 (요구사항 72행) — 제한 → 내비 숨김·직접 URL 차단·감사, 복원 → 접근 회복"""
    # 기준 상태 — 김현우(사용자)는 QnA 접근 가능
    login(pg, base, '김현우')
    pg.goto(f'{base}/board/qna', wait_until='networkidle')
    check('질문 등록' in pg.content(), '제한 전 QnA 접근')

    # Admin 이 QnA 의 '사용자' 권한을 제한한다
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/settings/permissions', wait_until='networkidle')
    row = pg.locator('tr', has_text='/board/qna')
    row.locator('button').first.click()  # 첫 버튼 = 사용자 컬럼
    pg.wait_for_selector('tr:has-text("/board/qna"):has-text("제한됨")', timeout=10000)

    # 사용자 — 내비 링크가 사라지고 직접 URL 은 대시보드로 차단된다
    login(pg, base, '김현우')
    check(pg.locator('a[href="/board/qna"]').count() == 0, '제한 → 내비 링크 숨김')
    pg.goto(f'{base}/board/qna', wait_until='networkidle')
    check('질문 등록' not in pg.content() and '개인별현황' in pg.content(), '제한 → 직접 URL 차단 (대시보드 회송)')

    # 부서담당은 영향 없다 (제한은 지정 권한그룹만)
    login(pg, base, '이수진')
    pg.goto(f'{base}/board/qna', wait_until='networkidle')
    check('질문 등록' in pg.content(), '타 권한그룹 무영향')

    # 제한은 화면만이 아니라 엑셀 다운로드·액션에도 걸린다 (v1.2.2) — BIZ_MGR 를 랙 화면에서 제한
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/settings/permissions', wait_until='networkidle')
    pg.locator('tr', has_text='/infra/racks').locator('button').first.click()
    pg.wait_for_selector('tr:has-text("/infra/racks"):has-text("제한됨")', timeout=10000)
    login(pg, base, '박정호')
    check(pg.request.get(f'{base}/api/export?type=racks').status == 403, '제한 → 엑셀 다운로드 403')
    pg.goto(f'{base}/infra/racks', wait_until='networkidle')
    check('랙관리' not in pg.content(), '제한 → 화면 차단 (BIZ_MGR)')
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/settings/permissions', wait_until='networkidle')
    pg.locator('tr', has_text='/infra/racks').locator('button:has-text("제한됨")').click()
    pg.wait_for_load_state('networkidle')

    # 복원 → 접근 회복 + 감사 이력
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/settings/permissions', wait_until='networkidle')
    pg.locator('tr', has_text='/board/qna').locator('button:has-text("제한됨")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/settings/audit', wait_until='networkidle')
    check('메뉴권한 변경' in pg.content(), '감사 이력에 메뉴권한 변경 기록')
    login(pg, base, '김현우')
    pg.goto(f'{base}/board/qna', wait_until='networkidle')
    check('질문 등록' in pg.content(), '복원 → 접근 회복')


def sc_board(pg, base, check):
    """게시판 삭제 — 공지(작성자)·QnA(미답변 본인) + 감사 기록 (요구사항 6행 삭제)"""
    login(pg, base, '박정호')
    pg.goto(f'{base}/board/notices', wait_until='networkidle')
    pg.select_option('select[name=category]', '공지')
    pg.fill('input[name=title]', 'E2E 삭제 검증 공지')
    pg.click('button:has-text("등록")')
    pg.wait_for_selector('tr:has-text("E2E 삭제 검증 공지")', timeout=10000)
    pg.locator('tr', has_text='E2E 삭제 검증 공지').locator('button:has-text("삭제")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/board/notices', wait_until='networkidle')
    check('E2E 삭제 검증 공지' not in pg.content(), '공지 삭제 (작성자 본인)')

    login(pg, base, '김현우')
    pg.goto(f'{base}/board/qna', wait_until='networkidle')
    pg.fill('input[name=title]', 'E2E 삭제 검증 문의')
    pg.locator('.card', has_text='질문 등록').locator('button:has-text("등록")').click()
    pg.wait_for_selector('tr:has-text("E2E 삭제 검증 문의")', timeout=10000)
    pg.locator('tr', has_text='E2E 삭제 검증 문의').locator('button:has-text("삭제")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/board/qna', wait_until='networkidle')
    check('E2E 삭제 검증 문의' not in pg.content(), 'QnA 미답변 본인 삭제')

    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/settings/audit', wait_until='networkidle')
    check('게시물 삭제' in pg.content(), '감사 이력에 게시물 삭제 기록')


def sc_violation_audit(pg, base, check):
    """보안위반 등록 감사 이력 — 관리자가 타인 위반을 등록하면 등록자가 감사 로그에 남는다.
    위반 레코드엔 등록자 필드가 없어(증빙 첨부는 선택) 감사 로그가 유일한 등록자 추적 지점 (§VI, v1.5.44)."""
    login(pg, base, '박정호')  # BIZ_MGR — 위반 등록 권한
    pg.goto(f'{base}/awareness/violations', wait_until='networkidle')
    pg.select_option('select[name=name]', '김현우')
    pg.select_option('select[name=type]', index=0)
    pg.fill('input[name=detail]', 'E2E 감사 검증용 위반 항목')
    pg.click('button:has-text("등록 · 안내메일 발송")')
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/awareness/violations', wait_until='networkidle')
    check('E2E 감사 검증용 위반 항목' in pg.content(), '위반 등록 반영')

    # 감사 이력에 '보안위반 등록' + 등록자(박정호)가 남는지 — 수정 전이면 등록 자체가 무기록
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/settings/audit', wait_until='networkidle')
    row = pg.locator('tr', has_text='보안위반 등록')
    check(row.count() > 0, '감사 이력에 보안위반 등록 기록')
    check('박정호' in row.first.inner_text(), '감사 이력이 등록자(박정호) 추적')


def sc_approval_line(pg, base, check):
    """결재선 변경 → 이후 상신의 결재자 변경"""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/settings/users', wait_until='networkidle')
    row = pg.locator('tr', has_text='SR 신청')
    row.locator('select[name=approver]').select_option('시스템관리자')
    row.locator('button:has-text("저장")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '김현우')
    pg.goto(f'{base}/sr/new', wait_until='networkidle')
    pg.fill('input[name=system]', 'ERP')
    pg.fill('input[name=title]', 'E2E 결재선 검증')
    pg.click('button:has-text("결재 상신")')
    pg.wait_for_url('**/sr/requests**')

    login(pg, base, '박정호')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    check('E2E 결재선 검증' not in pg.locator('.card', has_text='수신함 — 결재 대기').inner_text(), '기존 결재자 미수신')
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    check(pg.locator('tr', has_text='E2E 결재선 검증').count() > 0, '변경된 결재자 수신')


def sc_scheduler(pg, base, check):
    """알림 배치 스케줄러 자동 발화 (PORTAL_NOTIFY_INTERVAL_MS=2000)"""
    time.sleep(3.5)
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    hist = pg.locator('.card', has_text='배치 실행 이력').inner_text()
    check('일일 알림 배치' in hist, '자동 배치 이력')
    check('컴플라이언스 포스처 스냅샷' in hist, '일배치가 컴플라이언스 포스처 스냅샷 자동 기록 (v1.5.141~)')
    pg.goto(f'{base}/settings/audit', wait_until='networkidle')
    check('스케줄러' in pg.content(), '감사 행위자=스케줄러')
    # 자동 스냅샷이 추세 카드에 by 스케줄러로 남는다 (당월 upsert)
    pg.goto(f'{base}/compliance/inspection', wait_until='networkidle')
    check('스케줄러' in pg.locator('.card', has_text='컴플라이언스 추세').inner_text(), '자동 스냅샷이 추세 카드에 기록(by 스케줄러)')


def sc_scheduler_bootcatchup(pg, base, check):
    """기동 시 밀린 일일 배치 따라잡기 (v1.5.78) — setInterval 은 부팅 시점에 앵커돼, 인터벌보다 잦은
    재시작(야간 배포·오토스케일·유휴 축출)이 24h 틱을 영영 안 오게 한다. 큰 인터벌(1h)이라 인터벌 틱은
    테스트 창(2s)에 안 오지만, 오늘자 일일 배치 기록이 없으면 기동 즉시 1회 발화해야 한다(부팅 따라잡기).
    PORTAL_NOTIFY_INTERVAL_MS=3600000 — 이 발화는 오직 부팅 따라잡기 경로로만 가능하다."""
    time.sleep(2.0)
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    check('일일 알림 배치' in pg.locator('.card', has_text='배치 실행 이력').inner_text(),
          '큰 인터벌에도 기동 즉시 밀린 배치 발화 (부팅 따라잡기 — 잦은 재시작 무발송 방지)')


def sc_keyboard(pg, base, check):
    """키보드 조작성 (WCAG 2.1.1) — MDI 탭 닫기·본문 바로가기 링크가 키보드로 동작한다"""
    login(pg, base, '김현우')                 # 개인별현황 탭 생성
    pg.wait_for_selector('.mdibar .tab')      # 첫 탭이 localStorage 에 저장될 때까지 대기 (레이스 방지)
    pg.goto(f'{base}/sr/requests', wait_until='networkidle')  # 신청내역 탭 추가
    pg.wait_for_function('document.querySelectorAll(".mdibar .tab").length >= 2', timeout=5000)
    tabs = pg.locator('.mdibar .tab')
    check(tabs.count() >= 2, 'MDI 탭 2개 이상 생성')
    # 현재 탭(신청내역)의 닫기 버튼을 키보드로 포커스 → Enter 로 닫힘
    x = pg.locator('.mdibar .tab', has_text='신청내역').locator('.x')
    x.focus()
    check(pg.evaluate("document.activeElement && document.activeElement.classList.contains('x')"),
          'MDI 닫기 버튼 키보드 포커스 가능 (tabIndex)')
    before = tabs.count()
    pg.keyboard.press('Enter')
    pg.wait_for_function(f'document.querySelectorAll(".mdibar .tab").length < {before}', timeout=5000)
    check(pg.locator('.mdibar .tab').count() < before, 'Enter 로 탭 닫기 (키보드 활성)')
    # 탭 본체도 키보드 활성 — 개인별현황 탭에 포커스 후 Enter 로 이동
    dash = pg.locator('.mdibar .tab', has_text='개인별현황')
    dash.focus()
    check(pg.evaluate("document.activeElement && document.activeElement.getAttribute('role') === 'tab'"),
          'MDI 탭 본체 키보드 포커스 가능')
    # 본문 바로가기 링크 — 존재·포커스 가능
    skip = pg.locator('a.skip')
    check(skip.count() == 1, '본문 바로가기 링크 존재')
    skip.focus()
    check(pg.evaluate("document.activeElement && document.activeElement.classList.contains('skip')"),
          '본문 바로가기 링크 키보드 포커스 가능')
    check(pg.evaluate("!!document.getElementById('main')"), '본문 대상 #main 존재')


def sc_runtime(pg, base, check):
    """브랜디드 404 + ChunkReload 자동 복구 + 세션 쿠키 속성·로그아웃 무효화"""
    login(pg, base, '김현우')

    # 세션 쿠키 속성 — HttpOnly · SameSite=Lax (XSS 탈취·크로스사이트 전송 방어)
    sess = next((c for c in pg.context.cookies() if c['name'] == 'ngv_portal_session'), None)
    check(bool(sess) and sess['httpOnly'] and sess['sameSite'] == 'Lax', '세션 쿠키 HttpOnly·SameSite=Lax')

    pg.goto(f'{base}/no-such-screen', wait_until='networkidle')
    check('화면을 찾을 수 없습니다' in pg.content(), '브랜디드 404')
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    pg.evaluate('window.__marker = 1')
    pg.evaluate("window.dispatchEvent(new ErrorEvent('error', { message: 'ChunkLoadError: Loading chunk 1 failed' }))")
    pg.wait_for_load_state('networkidle')
    pg.wait_for_timeout(800)
    check(pg.evaluate('window.__marker') is None, '청크 오류 → 자동 새로고침')

    # 로그아웃 — 쿠키 삭제로 보호 화면 접근이 로그인으로 되돌아간다
    pg.click('button:has-text("로그아웃")')
    pg.wait_for_url('**/login**')
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    check('계정을 선택하세요' in pg.content(), '로그아웃 후 보호 화면 차단')


def sc_batchref(pg, base, check):
    """상신 묶음 번호 — 반려 후 재상신이 새 번호를 받고, 과거 반려 문서가 새 묶음을 가리키지 않는다"""
    login(pg, base, '박정호')
    pg.goto(f'{base}/infra/incidents', wait_until='networkidle')
    for box in pg.locator('input[name=ids]').all():
        box.check()
    pg.click('button:has-text("선택 건 장애보고 상신")')
    pg.wait_for_load_state('networkidle')

    # 결재선(장애보고 → 시스템관리자)에서 사유 반려
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    row = pg.locator('tr', has_text='[장애보고]').first
    check('IR-2026-0001' in row.inner_text(), '1차 상신 묶음 IR-0001')
    # 결재 시트 8번 — 상신 시 엑셀양식(XT)이 자동첨부되어 결재함 뱃지로 보인다
    check('📎1' in row.inner_text(), '장애보고 엑셀양식 자동첨부 뱃지')
    row.locator('input[name=reason]').fill('취합 기간 오류')
    row.locator('button:has-text("반려")').click()
    pg.wait_for_load_state('networkidle')

    # 반려는 기안자의 '재상신' 할일로 되돌아온다 (전 문서 유형 공통 폐쇄 루프)
    login(pg, base, '박정호')
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    open_card = pg.locator('.card', has_text='미처리 할일')
    check('[장애보고 상신]' in open_card.inner_text(), '반려 → 재상신 할일 생성 (사유 포함)')
    check('취합 기간 오류' in open_card.inner_text(), '재상신 할일에 반려 사유 표시')

    # 반려 방치 건은 일일 알림 배치(5번째 유형)로 기안자에게 안내메일이 나간다
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    pg.click('button:has-text("알림 배치 실행")')
    # 서버 액션 재렌더를 기다린다 — networkidle 은 POST 전에 통과할 수 있다
    pg.wait_for_selector('text=반려 문서 재상신 안내', timeout=10000)
    check('반려 문서 재상신 안내' in pg.locator('.card', has_text='발송 이력').inner_text(), '반려 방치 → 안내메일 발송')
    # 확인서 미제출(6번째 유형) — 시드 VL-2026-07(강도윤, 징구중)이 대상. 제출하면 결재중으로 넘어가 자동 제외
    check('사실확인서 제출 안내' in pg.locator('.card', has_text='발송 이력').inner_text(), '확인서 미제출 → 안내메일 발송')

    # 감사 이력 — 상신·반려가 모두 기록되어 결재 생명주기가 추적된다
    pg.goto(f'{base}/settings/audit', wait_until='networkidle')
    body = pg.content()
    check('결재 상신' in body and '[장애보고]' in body, '감사 이력에 결재 상신 기록')
    check('결재 반려' in body, '감사 이력에 결재 반려 기록')

    # 재상신 — 새 묶음 번호여야 한다 (반려로 행 ref 가 초기화되어도 재사용 금지)
    login(pg, base, '박정호')
    pg.goto(f'{base}/infra/incidents', wait_until='networkidle')
    for box in pg.locator('input[name=ids]').all():
        box.check()
    pg.click('button:has-text("선택 건 장애보고 상신")')
    pg.wait_for_load_state('networkidle')

    # 재상신과 함께 '재상신' 할일이 자동 마감된다 (묶음 문서는 유형 태그 매칭)
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    check('[장애보고 상신]' not in pg.locator('.card', has_text='미처리 할일').inner_text(), '재상신 → 할일 자동 마감')

    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    waiting = pg.locator('.card', has_text='수신함 — 결재 대기')
    check('IR-2026-0002' in waiting.inner_text(), '재상신 묶음 IR-0002 (번호 재사용 금지)')
    # 재상신 묶음 상세 — 참조가 회전해도 이전 회차(IR-0001) 반려 이력이 문서유형·기안자로 이어진다
    waiting.locator('a', has_text='[장애보고]').first.click()
    pg.wait_for_selector('text=문서 상세', timeout=10000)
    detail = pg.locator('.card', has_text='문서 상세')
    check('이전 회차 결재' in detail.inner_text(), '재상신 묶음 상세에 이전 회차 이력(회전 참조)')
    check('IR-2026-0001' in detail.inner_text() and '취합 기간 오류' in detail.inner_text(), '이전 묶음 참조·반려 사유 표시')
    check('장애보고 취합 양식' in detail.inner_text(), '상세 첨부에 자동첨부 양식 표시')
    # 상세를 닫고 목록으로 — 아래 단계는 '문서 상세' 부재를 전제로 wait_for_selector 한다
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    # 반려된 1차 문서 상세 — 새 묶음(0002)의 장애를 보여주면 안 된다
    pg.locator('.card', has_text='수신함 — 처리 완료').locator('a', has_text='[장애보고]').first.click()
    pg.wait_for_selector('text=문서 상세', timeout=10000)
    detail = pg.locator('.card', has_text='문서 상세')
    check('IR-2026-0001' in detail.inner_text(), '반려 문서는 1차 묶음 참조 유지')
    check('0건' in detail.inner_text(), '반려 문서 상세가 새 묶음을 가리키지 않음(0건)')


def sc_rebundle_multi(pg, base, check):
    """회전참조 문서 동시 다중 반려 — 같은 유형(장애보고) 두 묶음이 함께 반려된 상태에서
    한 묶음만 재상신하면 '재상신' 할일이 정확히 한 건만 닫혀야 한다(다른 묶음의 재상신
    의무·방치 알림이 사라지면 안 됨). 회전참조는 회차 식별자가 없어 개수 일치로 검증한다."""
    todo_card = lambda: pg.locator('.card', has_text='미처리 할일')
    n_rebundle_todos = lambda: todo_card().locator('tr', has_text='[장애보고 상신]').count()

    # 박정호(BIZ_MGR)가 FL-2026-11, FL-2026-12 를 각각 별도 보고서로 상신 → 두 묶음
    login(pg, base, '박정호')
    for inc in ('FL-2026-11', 'FL-2026-12'):
        pg.goto(f'{base}/infra/incidents', wait_until='networkidle')
        pg.check(f'input[name=ids][value="{inc}"]')
        pg.click('button:has-text("선택 건 장애보고 상신")')
        pg.wait_for_load_state('networkidle')

    # 결재자(장애보고 → 시스템관리자)가 두 묶음 모두 반려
    login(pg, base, '시스템관리자')
    for _ in range(2):
        pg.goto(f'{base}/work/approvals', wait_until='networkidle')
        row = pg.locator('tr', has_text='[장애보고]').first
        row.locator('input[name=reason]').fill('통계 보완 필요')
        row.locator('button:has-text("반려")').click()
        pg.wait_for_load_state('networkidle')

    # 박정호 재상신 할일 두 건 확인 (두 묶음 각각)
    login(pg, base, '박정호')
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    n_before = n_rebundle_todos()
    check(n_before >= 2, f'두 묶음 반려 → 장애보고 재상신 할일 2건 (실제 {n_before})')

    # 한 묶음만 재상신 (FL-2026-11 다시 선택 상신)
    pg.goto(f'{base}/infra/incidents', wait_until='networkidle')
    pg.check('input[name=ids][value="FL-2026-11"]')
    pg.click('button:has-text("선택 건 장애보고 상신")')
    pg.wait_for_load_state('networkidle')

    # 재상신 1회 → 정확히 한 건만 닫히고 다른 묶음 할일은 남아야 한다 (버그면 둘 다 닫혀 0건)
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    n_after = n_rebundle_todos()
    check(n_after == n_before - 1,
          f'재상신 1회 → 재상신 할일 정확히 1건만 마감 (전 {n_before} → 후 {n_after}, 버그면 {n_before - 2})')


def sc_profile(pg, base, check):
    """프로필 스위칭 — PORTAL_PROFILE=manufacturer 로 브랜딩·채널 구성 전환"""
    pg.goto(f'{base}/login', wait_until='networkidle')
    check('HANBIT IT PORTAL' in pg.content(), '로그인 브랜딩 전환')
    login(pg, base, '시스템관리자')
    check('한빛제조' in pg.locator('.statusbar').inner_text(), '상태바 고객사 전환')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    body = pg.content()
    check('한빛제조' in body and '그룹웨어 메일·문자' in body, '채널 구성 전환')
    # SMS 제거는 연동 채널 카드 기준 — 어댑터 자가진단은 전 프로필을 나열하므로 body 전체가 아니라 채널 카드로 스코프
    chan_card = pg.locator('.card', has_text='Channels').inner_text()
    check('문자(SMS) 발송' not in chan_card, 'SMS 채널 제거(연동 채널 카드)')
    check('erp-asset' in body, 'ERP 자산 어댑터 바인딩')
    login(pg, base, '박정호')
    pg.goto(f'{base}/finance/asset-reg', wait_until='networkidle')
    check('SN-NB-88121' in pg.content(), 'erp-asset 어댑터 실동작(자산 조회)')


def sc_profile_public(pg, base, check):
    """프로필 스위칭 2 — PORTAL_PROFILE=public 로 공공기관 토폴로지 전환 (비종속성 증명)"""
    pg.goto(f'{base}/login', wait_until='networkidle')
    check('HANUL GOV PORTAL' in pg.content(), '로그인 브랜딩(공공) 전환')
    login(pg, base, '시스템관리자')
    check('한울공공기관' in pg.locator('.statusbar').inner_text(), '상태바 고객사(공공) 전환')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    chan_card = pg.locator('.card', has_text='Channels').inner_text()
    # manufacturer 와 대비되는 축: SMS 별도 실채널 유지 + 보안·출력물 관제 기본 가동
    check('문자(SMS) 발송' in chan_card, 'SMS 별도 실채널 유지(공공)')
    check('보안·출력물 관제' in chan_card, 'secdata 채널 구성 전환')
    check('가동중' in chan_card.split('보안·출력물 관제')[1][:80], 'secdata 기본 가동(계약 범위)')
    # 어댑터 자가진단이 공공 프로필까지 3개 프로필을 진단하고 전부 적합
    conf = pg.locator('.card', has_text='어댑터 계약 자가진단').inner_text()
    check('public' in conf and 'gov-asset' in conf, '자가진단이 공공 프로필 진단')
    check('전 프로필 적합' in conf, '3개 프로필 전 적합')
    # gov-asset 어댑터 실동작
    login(pg, base, '박정호')
    pg.goto(f'{base}/finance/asset-reg', wait_until='networkidle')
    check('SN-NB-88121' in pg.content(), 'gov-asset 어댑터 실동작(자산 조회)')


def sc_persist(pg, base, check):
    """PORTAL_DATA_FILE 영속화 — 구버전 부분 파일 로드 시 시드 머지·채널 기본값 폴백"""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/board/notices', wait_until='networkidle')
    check('영속화 파일 공지' in pg.content(), '데이터 파일 컬렉션 로드')

    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    chan = pg.locator('.card', has_text='연동 채널')
    check('중지' in chan.locator('tr', has_text='문자(SMS) 발송').inner_text(), '파일의 채널 상태 유지 (SMS 중지)')
    mail_row = chan.locator('tr', has_text='그룹웨어 메일')
    check('가동중' in mail_row.inner_text(), '파일에 없는 채널 키는 기본값 폴백 (메일 가동)')

    # 키 없는 채널의 첫 토글이 화면 표시 기준대로 동작한다 (가동중 → 중지 클릭 → 중지)
    mail_row.locator('button:has-text("중지")').click()
    chan.locator('tr', has_text='그룹웨어 메일').locator('button:has-text("가동")').wait_for(timeout=10000)
    check('중지' in chan.locator('tr', has_text='그룹웨어 메일').inner_text(), '누락 키 채널 첫 토글 정상 (가동→중지)')

    # 일일 백업 — 스케줄러 틱이 데이터 파일의 일자별 스냅샷(.bak)을 남긴다
    for _ in range(30):
        if list(DATA.parent.glob(DATA.name + '.*.bak')):
            break
        time.sleep(0.5)
    check(bool(list(DATA.parent.glob(DATA.name + '.*.bak'))), '데이터 파일 일일 백업 생성')


SCENARIOS = [
    ('pledge', '서약 제출 → 할일 마감', sc_pledge, {}),
    ('sr', 'SR 생명주기 (첨부·반려·재상신·승인)', sc_sr, {}),
    ('withdraw', '상신취소(회수) → 작성중 복원 → 재상신', sc_withdraw, {}),
    ('devchain', '시스템개발 SR → 변경 2단 상신 → SR 완료 전파 (전체 사슬)', sc_devchain, {}),
    ('settle', '정산 반려 → 재상신 → 지급완료', sc_settle, {}),
    ('adapter', '어댑터 채널 토글·secdata 이관·폐기 결재', sc_adapter, {}),
    ('revision', '양식 개정 → 전원 재서약 재산출', sc_revision, {}),
    ('project_pledge', '프로젝트 참여 서약 — 개정 후 재서명분만 집계(과다계수 방지)', sc_project_pledge, {}),
    ('pledge_multikind', '비-일반 양식 개정 재서약 통지 + 유형별 마감(교차마감 방지)', sc_pledge_multikind, {}),
    ('education_orphan', '전사 이수율 — 퇴사자 이력 제외(재직자 기준)', sc_education_orphan,
     {'PORTAL_DATA_FILE': str(EDU_DATA)}),
    ('finance_exec_rate', '집행률 — 확정 계획 스코프(계획외 지급 미산입)', sc_finance_exec_rate,
     {'PORTAL_DATA_FILE': str(FIN_DATA)}),
    ('year_filter', '일반 서약 집계 year 필터(레거시 데이터 오인 방지)', sc_year_filter,
     {'PORTAL_DATA_FILE': str(FYEAR_DATA)}),
    ('export_kind_scope', 'export 투자 집계 kind 스코프(크로스-kind 오염 제외)', sc_export_kind_scope,
     {'PORTAL_DATA_FILE': str(XKIND_DATA)}),
    ('reject_reason_collision', '재상신 할일 닫기 앵커 매칭(사유텍스트 오마감 방지)', sc_reject_reason_collision,
     {'PORTAL_DATA_FILE': str(RREASON_DATA)}),
    ('manual_backup', '수동 배치 백업 — 스케줄러 off 배포 복구지점', sc_manual_backup,
     {'PORTAL_DATA_FILE': str(BACKUP_DATA)}),
    ('change_resign_orphan', '변경 재상신 교차-담당 고아 할일 방지', sc_change_resign_orphan,
     {'PORTAL_DATA_FILE': str(CHORPHAN_DATA)}),
    ('education_target', '교육 이수율 대상(target) 스코프 — 비대상자 미이수 오표기 방지', sc_education_target,
     {'PORTAL_DATA_FILE': str(EDUTGT_DATA)}),
    ('adapter_throw', '어댑터 예외 내성 — 인사 동기화 throw 시 실패 기록·무크래시(v1.5.16)', sc_adapter_fault,
     {'PORTAL_FAULT_HR': 'throw'}),
    ('adapter_hang', '어댑터 무응답 내성 — 인사 동기화 hang→timeout 시 실패 기록·무크래시(v1.5.17)', sc_adapter_fault,
     {'PORTAL_FAULT_HR': 'hang', 'PORTAL_ADAPTER_TIMEOUT_MS': '500'}),
    ('adapter_malformed', '어댑터 계약 위반 내성 — 오형 응답 시 s.people 보존·후속 화면 무크래시', sc_adapter_malformed,
     {'PORTAL_FAULT_HR': 'malformed'}),
    ('adapter_asset_malformed', '자산 어댑터 계약 위반 내성 — 비배열 조회 응답에도 자산등록 화면 무크래시(수집 형태검증 패리티)', sc_adapter_asset_malformed,
     {'PORTAL_FAULT_ASSET': 'malformed'}),
    ('adapter_asset_badfield', '자산 어댑터 assetNo 객체값 내성 — 자산등록 화면 무크래시(렌더 필드 형태검증)', sc_adapter_asset_badfield,
     {'PORTAL_FAULT_ASSET': 'badfield'}),
    ('adapter_secdata_badfield', 'secdata 이관 dept/pages 객체값 내성 — 출력물 화면 무크래시(수집 렌더 필드 검증)', sc_adapter_secdata_badfield,
     {'PORTAL_FAULT_SECDATA': 'badfield', 'PORTAL_DATA_FILE': str(SECBAD_DATA)}),
    ('deptpledge_resign', '부서서약 fresh 상신 과다마감 방지 — 무관 부서 상신이 반려 재상신 할일 안 닫음', sc_deptpledge_resign,
     {'PORTAL_DATA_FILE': str(DPLGRESIGN_DATA)}),
    ('apply_resubmit_route', '적용요청 재상신 할일 라우팅 — /sr/manage(재상신처)로 안내', sc_apply_resubmit_route,
     {'PORTAL_DATA_FILE': str(APPLYROUTE_DATA)}),
    ('codes', '공통코드 토글·사용기간·추가·삭제 → 업무 선택지', sc_codes, {}),
    ('board', '게시판 삭제 (공지·QnA) + 감사 기록', sc_board, {}),
    ('violation_audit', '보안위반 등록 감사 이력 — 등록자 추적(§VI)', sc_violation_audit, {}),
    ('remote', '재택 대상자 명단 — 스코핑·업로드·기간 조회·종료', sc_remote, {}),
    ('remote_overlap', '재택 경계월 인접 기간 — 당월 명단·통계 1회만(이중 집계 방지)', sc_remote_overlap,
     {'PORTAL_DATA_FILE': str(RSPAN_DATA)}),
    ('approval_history_identity', '결재 회전 이력 신원 게이트 — 타인 결재 묶음 반려사유 미노출', sc_approval_history_identity,
     {'PORTAL_DATA_FILE': str(RHIST_DATA)}),
    ('dashboard_ops_scope', '대시보드 전사 스냅샷 런타임 메뉴권한 정합 — 제한 도메인 타일 미노출', sc_dashboard_ops_scope,
     {'PORTAL_DATA_FILE': str(OPSSCOPE_DATA)}),
    ('infra_systems_incident_scope', '시스템 화면 장애 교차도메인 게이트 — 제한 시 장애 타일·열 미노출', sc_infra_systems_incident_scope,
     {'PORTAL_DATA_FILE': str(SYSINC_DATA)}),
    ('dashboard_notices_scope', '대시보드 공지 교차도메인 게이트 — 제한 역할 공지카드 미노출', sc_dashboard_notices_scope,
     {'PORTAL_DATA_FILE': str(NOTICESCOPE_DATA)}),
    ('search_menu_override', '통합 검색 런타임 권한 정합 — 메뉴 제한 도메인 검색 미노출', sc_search_menu_override,
     {'PORTAL_DATA_FILE': str(SMOV_DATA)}),
    ('attach_generated_dedup', '자동첨부 교차일 중복 방지 — 재상신 시 같은 양식 1건', sc_attach_generated_dedup,
     {'PORTAL_DATA_FILE': str(ATDUP_DATA)}),
    ('notify_corrupt_todo', '알림 배치 손상 title 할일 내성 — 크래시 없이 완료', sc_notify_corrupt_todo,
     {'PORTAL_DATA_FILE': str(NCRASH_DATA)}),
    ('apply_resign_orphan', '적용요청 상신 교차-기안자 고아 할일 마감', sc_apply_resign_orphan,
     {'PORTAL_DATA_FILE': str(APPLY_DATA)}),
    ('inspection_resign_orphan', '점검결과 교차-상신자 고아 할일 마감', sc_inspection_resign_orphan,
     {'PORTAL_DATA_FILE': str(INSP_ORPHAN_DATA)}),
    ('channelstate_corrupt', 'channelStates 비불리언 값 검증 — 중지 채널 오활성 방지', sc_channelstate_corrupt,
     {'PORTAL_DATA_FILE': str(CHST_DATA)}),
    ('profile_data_isolation', '프로필 데이터 격리 — PORTAL_DATA_FILE 재사용 시 채널·메뉴 오버레이 누수 차단',
     sc_profile_data_isolation, {'PORTAL_DATA_FILE': str(PROFISO_DATA)}),
    ('rotating_resign_orphan', '회전 문서 교차-재상신자 고아 할일 마감', sc_rotating_resign_orphan,
     {'PORTAL_DATA_FILE': str(ROT_ORPHAN_DATA)}),
    ('rotating_fresh_no_overclose', '회전문서 신규 상신 과다마감 방지 — 항목 재포함시에만 마감', sc_rotating_fresh_no_overclose,
     {'PORTAL_DATA_FILE': str(ROT_FRESH_DATA)}),
    ('project_complete_resign_cleanup', '프로젝트 완료 시 서명 불가 재서약 할일 정리', sc_project_complete_resign_cleanup,
     {'PORTAL_DATA_FILE': str(PJDONE_DATA)}),
    ('project_emptymembers_signcount', '빈 명단 프로젝트 참여서약 집계 — []를 미지정과 동일 취급', sc_project_emptymembers_signcount,
     {'PORTAL_DATA_FILE': str(PJMEMB_DATA)}),
    ('remote_departed_ghost', '인사연동 퇴사 재택 대상자 유령 미제출 제거', sc_remote_departed_ghost,
     {'PORTAL_DATA_FILE': str(RMGHOST_DATA)}),
    ('autoform_upload_defeat', '필수 자동양식 파일명충돌 우회 방지 — gen 구분자', sc_autoform_upload_defeat,
     {'PORTAL_DATA_FILE': str(AFDEFEAT_DATA)}),
    ('qna_assign_role', 'QnA 담당 지정 역할 정합 — 답변 가능 역할만', sc_qna_assign_role,
     {'PORTAL_DATA_FILE': str(QNAROLE_DATA)}),
    ('qna_loop', 'QnA 폐쇄 루프 — 담당 지정 할일 생성·답변 시 마감', sc_qna_loop, {}),
    ('sr_suspend', 'SR 중지(BA030014) — 지연 제외·재개 복원', sc_sr_suspend,
     {'PORTAL_DATA_FILE': str(SRSUSP_DATA)}),
    ('sr_suspend_strand', 'SR 중지-변경 고착 방어 — 진행 중 변경 편입 SR 중지 차단', sc_sr_suspend_strand, {}),
    ('security_review', '보안성 검토(VI장) — 완료 가드(발견 전건 조치)·조치율', sc_security_review, {}),
    ('compliance_trend', '컴플라이언스 추세 스냅샷 — 개선 델타·기록 감사', sc_compliance_trend, {}),
    ('delayed_corrupt_date', '손상 날짜 일수계산 NaN 렌더 방지 — daysBetween 유한 가드', sc_delayed_corrupt_date,
     {'PORTAL_DATA_FILE': str(DTNAN_DATA)}),
    ('secprint_system_registered', '보안·출력물 시스템 정식 등록 — BJ-02 토폴로지 과소집계 해소', sc_secprint_system_registered, {}),
    ('remote_cycle_config', '재택 등록 주기 변경 — 매일·월·분기·반기(요구사항 54행)', sc_remote_cycle_config, {}),
    ('dashboard_edu_scope', '대시보드 교육 미이수 대상 스코프 — 비대상 과정 미집계', sc_dashboard_edu_scope,
     {'PORTAL_DATA_FILE': str(DEDU_DATA)}),
    ('dashboard_pledge_general', '대시보드 일반 서약 타일 — 타 유형 재서약 할일에 오반응 안 함', sc_dashboard_pledge_general,
     {'PORTAL_DATA_FILE': str(DPLG_DATA)}),
    ('criteria', '점검 기준관리 — 등록·업로드·삭제·사용중 가드', sc_criteria, {}),
    ('racks', '랙·H/W 관리 — 등록·구성도·삭제 가드', sc_racks, {}),
    ('infracrud', '인프라 CRUD — 서버·시스템·배치·인터페이스', sc_infracrud, {}),
    ('infra_health', '인프라 운영 헬스 — 배치·인터페이스·디스크 단일원천(화면·대시보드·export 정합)', sc_infra_health, {}),
    ('finance_exec', '재무 집행률 단일원천 — 투자·비용 화면=대시보드=IT운영 export 정합', sc_finance_exec, {}),
    ('project_pmo', '프로젝트 PMO — 이슈·리스크·산출물 대장 export + 대시보드=화면 정합', sc_project_pmo, {}),
    ('incident_stats', '월별 장애 통계 export — 발생월×등급, export 계=화면 정합', sc_incident_stats, {}),
    ('menuauth', '메뉴권한 런타임 제한 — 숨김·차단·복원·감사', sc_menuauth, {}),
    ('line', '결재선 변경 → 결재자 변경', sc_approval_line, {}),
    ('scheduler', '알림 배치 자동 발화', sc_scheduler, {'PORTAL_NOTIFY_INTERVAL_MS': '2000'}),
    ('scheduler_bootcatchup', '기동 밀린 배치 따라잡기 — 인터벌보다 잦은 재시작 무발송 방지', sc_scheduler_bootcatchup,
     {'PORTAL_NOTIFY_INTERVAL_MS': '3600000'}),
    ('runtime', '404 · ChunkReload 복구', sc_runtime, {}),
    ('keyboard', '키보드 조작성 (MDI 탭·스킵 링크)', sc_keyboard, {}),
    ('profile', '고객사 프로필 스위칭 (manufacturer)', sc_profile, {'PORTAL_PROFILE': 'manufacturer'}),
    ('profile_public', '고객사 프로필 스위칭 (public)', sc_profile_public, {'PORTAL_PROFILE': 'public'}),
    ('batchref', '상신 묶음 번호 재사용 금지 (반려 후 재상신)', sc_batchref, {}),
    ('rebundle_multi', '회전참조 동시 다중 반려 — 재상신 1회는 할일 1건만 마감', sc_rebundle_multi, {}),
    ('persist', '데이터 파일 영속화 · 시드 머지 (구버전 호환)', sc_persist,
     {'PORTAL_DATA_FILE': str(DATA), 'PORTAL_NOTIFY_INTERVAL_MS': '2000'}),
]


def run_scenario(idx, key, title, fn, extra_env, browser):
    port = BASE_PORT + idx
    base = f'http://localhost:{port}'
    env = {**os.environ, **extra_env}
    if 'PORTAL_DATA_FILE' not in extra_env:
        env.pop('PORTAL_DATA_FILE', None)  # 항상 시드 초기화 (persist 시나리오만 파일 지정)
    server = subprocess.Popen(
        ['npx.cmd' if sys.platform == 'win32' else 'npx', 'next', 'start', '-p', str(port)],
        cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    failures = []

    def check(cond, label):
        if not cond:
            failures.append(label)

    try:
        for _ in range(60):
            try:
                body = urllib.request.urlopen(f'{base}/login', timeout=2).read().decode('utf-8')
                # 프로필과 무관한 로그인 카드 문구로 우리 앱임을 확인 (타 세션 서버 오인 방지)
                assert '계정을 선택하세요' in body, f'포트 {port} 를 다른 앱이 점유'
                break
            except AssertionError:
                raise
            except Exception:
                time.sleep(0.5)
        ctx = browser.new_context(viewport={'width': 1560, 'height': 900})
        pg = ctx.new_page()
        fn(pg, base, check)
        ctx.close()
    except Exception as e:  # noqa: BLE001 — 시나리오 실패를 수집하고 다음으로
        failures.append(f'예외: {e}')
    finally:
        if sys.platform == 'win32':
            subprocess.run(['taskkill', '/pid', str(server.pid), '/T', '/F'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            server.terminate()
    status = '✓' if not failures else '✗'
    print(f'{status} [{key}] {title}' + (': ' + ' | '.join(failures) if failures else ''))
    return not failures


def main() -> int:
    if not (ROOT / '.next').exists():
        print('✗ .next 빌드가 없습니다 — 먼저 `npm run build`를 실행하세요.')
        return 1
    only = set(sys.argv[1:])
    targets = [(i, s) for i, s in enumerate(SCENARIOS) if not only or s[0] in only]
    UPLOAD.write_text('e2e upload payload ' * 30, encoding='utf-8')
    # persist 시나리오용 '구버전' 부분 데이터 파일 — 일부 컬렉션·채널 키만 담는다
    DATA.write_text(json.dumps({
        'notices': [{'id': 'NT-90', 'title': '영속화 파일 공지', 'category': '공지',
                     'author': '시스템관리자', 'postedAt': '2026-08-01', 'pinned': True}],
        'channelStates': {'sms-gateway': False},
    }, ensure_ascii=False), encoding='utf-8')
    # education_orphan 시나리오용 — 재직자 1명(이력 없음) + 퇴사자(people 밖) 이력 1건
    EDU_DATA.write_text(json.dumps({
        'people': [{'name': '재직자A', 'dept': '검증팀'}],
        'educationCourses': [{'id': 'ED-90', 'title': 'E2E 보안교육', 'status': '완료'}],
        'educationRecords': [{'courseId': 'ED-90', 'name': '퇴사자B'}],
    }, ensure_ascii=False), encoding='utf-8')
    # finance_exec_rate 시나리오용 — 확정 계획 1000·계획내 지급 1000 + 계획외 지급 500
    FIN_DATA.write_text(json.dumps({
        'investPlans': [{'id': 'IP-90', 'kind': '투자', 'year': '2026', 'title': 'E2E 집행률',
                         'owner': '시스템관리자', 'dept': '정보기획팀', 'amount': 1000, 'status': '확정'}],
        'investContracts': [
            {'id': 'CT-90', 'kind': '투자', 'planId': 'IP-90', 'vendor': 'V1', 'title': '계획내 계약', 'amount': 1000, 'signedAt': '2026-07-01'},
            {'id': 'CT-91', 'kind': '투자', 'vendor': 'V2', 'title': '계획외 계약', 'amount': 500, 'signedAt': '2026-07-01'},
        ],
        'settlements': [
            {'id': 'ST-90', 'contractId': 'CT-90', 'item': '잔금', 'amount': 1000, 'status': '지급완료', 'requestedBy': '시스템관리자', 'requestedAt': '2026-07-10'},
            {'id': 'ST-91', 'contractId': 'CT-91', 'item': '잔금', 'amount': 500, 'status': '지급완료', 'requestedBy': '시스템관리자', 'requestedAt': '2026-07-10'},
        ],
    }, ensure_ascii=False), encoding='utf-8')
    # year_filter 시나리오용 — 재직자C 가 레거시(2025) 일반 서약만 보유 (2026 미서약이어야)
    FYEAR_DATA.write_text(json.dumps({
        'people': [{'name': '재직자C', 'dept': '검증팀'}],
        'pledges': [{'name': '재직자C', 'dept': '검증팀', 'year': '2025', 'kind': '일반', 'signedAt': '2025-07-01', 'method': '온라인'}],
        'pledgeForms': [{'kind': '일반', 'revisedAt': '2025-01-01'}],
    }, ensure_ascii=False), encoding='utf-8')
    # export_kind 시나리오용 — 비용 계약이 투자 계획(IP-91)을 참조하는 크로스-kind 오염
    XKIND_DATA.write_text(json.dumps({
        'investPlans': [{'id': 'IP-91', 'kind': '투자', 'year': '2026', 'title': 'E2E 크로스',
                         'owner': '시스템관리자', 'dept': '정보기획팀', 'amount': 1000, 'status': '확정'}],
        'investContracts': [
            {'id': 'CT-92', 'kind': '투자', 'planId': 'IP-91', 'vendor': 'V1', 'title': '투자계약', 'amount': 1000, 'signedAt': '2026-07-01'},
            {'id': 'CT-93', 'kind': '비용', 'planId': 'IP-91', 'vendor': 'V2', 'title': '비용계약(크로스)', 'amount': 500, 'signedAt': '2026-07-01'},
        ],
        'settlements': [
            {'id': 'ST-92', 'contractId': 'CT-92', 'item': '잔금', 'amount': 1000, 'status': '지급완료', 'requestedBy': '시스템관리자', 'requestedAt': '2026-07-10'},
            {'id': 'ST-93', 'contractId': 'CT-93', 'item': '잔금', 'amount': 500, 'status': '지급완료', 'requestedBy': '시스템관리자', 'requestedAt': '2026-07-10'},
        ],
    }, ensure_ascii=False), encoding='utf-8')
    # reject_reason 시나리오용 — 반려 SR 2건(김현우), SR-B 의 재상신 할일 사유 텍스트에 SR-A 번호 인용.
    # SR-A 재상신 시 앵커(유형+ref 선두) 매칭이면 SR-A 할일만, 부분문자열 매칭이면 SR-B 할일까지 마감.
    RREASON_DATA.write_text(json.dumps({
        'srRequests': [
            {'srNo': 'SR-2026-9001', 'kind': '데이터', 'title': 'E2E 재상신 A', 'system': 'ERP',
             'requester': '김현우', 'dept': '개발1팀', 'status': '반려', 'requestedAt': '2026-08-01'},
            {'srNo': 'SR-2026-9002', 'kind': '데이터', 'title': 'E2E 재상신 B', 'system': 'ERP',
             'requester': '김현우', 'dept': '개발1팀', 'status': '반려', 'requestedAt': '2026-08-01'},
        ],
        'todos': [
            {'id': 'TD-9001', 'owner': '김현우', 'kind': '재상신', 'dueDate': '2026-08-01', 'done': False,
             'title': '[SR 신청] SR-2026-9001 반려 — 보완 후 재상신 (사유: 사양 보완 필요)'},
            {'id': 'TD-9002', 'owner': '김현우', 'kind': '재상신', 'dueDate': '2026-08-01', 'done': False,
             'title': '[SR 신청] SR-2026-9002 반려 — 보완 후 재상신 (사유: SR-2026-9001 처리 후 재상신 바랍니다)'},
        ],
    }, ensure_ascii=False), encoding='utf-8')
    # manual_backup 시나리오용 — 영속화 켬(PORTAL_DATA_FILE) + 스케줄러 off. 수동 배치가 백업을 남기는지.
    BACKUP_DATA.write_text(json.dumps({
        'notices': [{'id': 'N-BAK', 'title': 'E2E 백업 데이터', 'category': '일반', 'postedAt': '2026-08-01', 'author': '시스템관리자'}],
    }, ensure_ascii=False), encoding='utf-8')
    # education_target 시나리오용 — 개발자 전용 과정을 개발자만 이수. 대상 스코프면 100%, 대상 무시면
    # 비개발자(일반E)까지 분모에 넣어 50% + 일반E 미이수 오표기.
    EDUTGT_DATA.write_text(json.dumps({
        'people': [{'name': '개발자D', 'dept': '개발1팀'}, {'name': '일반E', 'dept': '경영지원팀'}],
        'educationCourses': [{'id': 'ED-DEV', 'title': 'E2E 시큐어코딩', 'target': '개발자', 'status': '완료'}],
        'educationRecords': [{'courseId': 'ED-DEV', 'name': '개발자D'}],
    }, ensure_ascii=False), encoding='utf-8')
    # change_resign_orphan 시나리오용 — 박정호가 상신한 변경결과가 반려돼 박정호 소유 재상신 할일이 있고,
    # 시스템관리자(교차 담당)가 결과를 재상신. 소유자 무관 닫기가 없으면 박정호 할일이 고아로 남는다.
    CHORPHAN_DATA.write_text(json.dumps({
        'srRequests': [{'srNo': 'SR-2026-9001', 'kind': '시스템개발', 'title': 'E2E 변경대상', 'system': 'ERP',
                        'requester': '김현우', 'dept': '개발1팀', 'status': '적용요청', 'requestedAt': '2026-08-01'}],
        'changes': [{'id': 'CW-2026-9001', 'kind': '시스템개발', 'title': 'E2E 변경', 'srNo': 'SR-2026-9001',
                     'status': '작업등록승인', 'registeredAt': '2026-08-01', 'plan': 'SR 반영'}],
        'todos': [{'id': 'TD-9001', 'owner': '박정호', 'kind': '재상신', 'dueDate': '2026-08-01', 'done': False,
                   'title': '[변경결과 상신] CW-2026-9001 반려 — 보완 후 재상신 (사유: 보완 요망)'}],
    }, ensure_ascii=False), encoding='utf-8')
    # remote_overlap 시나리오용 — 한지원이 인접한 두 재택 기간(7/5~8/4 마감, 8/5~계속)을 가진다.
    # 둘 다 8월과 교집합이므로 이름 중복 제거가 없으면 당월 명단·통계에 한지원이 둘로 잡힌다.
    RSPAN_DATA.write_text(json.dumps({
        'remoteTargets': [
            {'name': '한지원', 'dept': '경영지원실', 'startDate': '2026-07-05', 'endDate': '2026-08-04'},
            {'name': '한지원', 'dept': '경영지원실', 'startDate': '2026-08-05'},
        ],
    }, ensure_ascii=False), encoding='utf-8')
    # approval_history_identity 시나리오용 — 같은 기안자(김현우)의 회전 문서(출력물폐기) 두 별개 묶음.
    # 구 묶음(9001)은 결재자 박정호(반려·사유 있음), 신 묶음(9002)은 결재자 이수진. 이수진이 9002 를
    # 열 때 신원 게이트가 없으면 9001 의 반려사유가 '이전 회차'로 새어 노출된다.
    RHIST_DATA.write_text(json.dumps({
        'approvals': [
            {'id': 'AP-2026-9001', 'docType': '출력물폐기 상신', 'title': '[출력물폐기] 2026-07 묶음',
             'drafter': '김현우', 'approver': '박정호', 'status': '반려', 'ref': 'PD-9001',
             'rejectReason': '타관리자심사반려사유XYZ', 'decidedAt': '2026-07-20'},
            {'id': 'AP-2026-9002', 'docType': '출력물폐기 상신', 'title': '[출력물폐기] 2026-08 묶음',
             'drafter': '김현우', 'approver': '이수진', 'status': '대기', 'ref': 'PD-9002'},
        ],
    }, ensure_ascii=False), encoding='utf-8')
    # dashboard_edu_scope 시나리오용 — 개발자 전용 완료 과정 하나. 비개발(경영지원팀) 이수진 대시보드는
    # 이 과정의 이수 의무자가 아니므로 '보안교육 미이수' 가 0 이어야 한다(대상 무시면 1로 오표기).
    DEDU_DATA.write_text(json.dumps({
        'educationCourses': [{'id': 'ED-DEV', 'title': 'E2E 개발보안', 'target': '개발자', 'status': '완료'}],
        'educationRecords': [],
    }, ensure_ascii=False), encoding='utf-8')
    # dashboard_pledge_general 시나리오용 — 박정호는 시드 일반 서약이 유효(2026-07-10 >= 개정 2026-01-02).
    # 관리책임자 재서약 '보안서약서' 할일만 주입(todos 교체) → 일반 타일이 교차 신호로 '미제출' 되면 안 된다.
    DPLG_DATA.write_text(json.dumps({
        'todos': [{'id': 'TD-8001', 'owner': '박정호', 'kind': '보안서약서', 'dueDate': '2026-08-20', 'done': False,
                   'title': '2026년 관리책임자 보안서약서 재서약 (개정 반영)'}],
    }, ensure_ascii=False), encoding='utf-8')
    # search_menu_override 시나리오용 — /projects/status 를 ADMIN 전용으로 런타임 제한 + 검색 대상 프로젝트 1건.
    # BIZ_MGR(박정호)은 화면·검색 모두 차단, ADMIN 은 제한 예외라 검색에 노출돼야 한다.
    SMOV_DATA.write_text(json.dumps({
        'menuOverrides': {'/projects/status': ['ADMIN']},
        'projects': [{'id': 'PJ-9001', 'title': '격리테스트프로젝트XYZ', 'manager': '박정호', 'progress': 50, 'status': '진행중'}],
    }, ensure_ascii=False), encoding='utf-8')
    # dashboard_ops_scope 시나리오용 — /infra/incidents 를 ADMIN 전용으로 런타임 제한 + 조치중 장애 1건.
    # BIZ_MGR(박정호)은 대시보드 '조치중 장애' 타일 미노출, ADMIN 은 제한 예외라 노출돼야 한다.
    OPSSCOPE_DATA.write_text(json.dumps({
        'menuOverrides': {'/infra/incidents': ['ADMIN']},
        'incidents': [{'id': 'IN-9001', 'system': '격리테스트시스템', 'title': '스코프테스트장애', 'grade': '2등급',
                       'occurredAt': '2026-08-10', 'status': '조치중', 'reportStatus': '미상신'}],
    }, ensure_ascii=False), encoding='utf-8')
    # infra_systems_incident_scope 시나리오용 — /infra/incidents 를 ADMIN 전용 제한 + 조치중 장애 1건.
    # BIZ_MGR(박정호)은 시스템 화면의 '조치중 장애' 타일·'장애 이력' 열 미노출, ADMIN 은 노출.
    SYSINC_DATA.write_text(json.dumps({
        'menuOverrides': {'/infra/incidents': ['ADMIN']},
        'incidents': [{'id': 'IN-9002', 'system': '격리테스트시스템', 'title': '시스템화면스코프장애', 'grade': '2등급',
                       'occurredAt': '2026-08-10', 'status': '조치중', 'reportStatus': '미상신'}],
    }, ensure_ascii=False), encoding='utf-8')
    # dashboard_notices_scope 시나리오용 — /board/notices 를 USER 에서 제한(ADMIN 은 항상 유지).
    # USER(김현우)은 대시보드 공지사항 카드 미노출, BIZ_MGR(박정호)은 노출.
    NOTICESCOPE_DATA.write_text(json.dumps({
        'menuOverrides': {'/board/notices': ['DEPT_MGR', 'BIZ_MGR', 'ADMIN']},
    }, ensure_ascii=False), encoding='utf-8')
    # attach_generated_dedup 시나리오용 — 작업등록 상태 변경 1건 + 과거일자(08-01) 자동첨부 1건(같은 양식).
    # 오늘 계획 상신 시 registerGenerated 이 날짜 뺀 접두로 dedup 하면 첨부는 1건 유지(버그면 08-14 로 2건).
    ATDUP_DATA.write_text(json.dumps({
        'changes': [{'id': 'CW-9001', 'kind': '인프라', 'title': '크로스데이중복테스트변경', 'plan': '작업계획',
                     'status': '작업등록', 'registeredAt': '2026-08-01'}],
        'attachments': [{'id': 'AT-9001', 'refId': 'CW-9001', 'name': '인프라변경 작업계획 양식_v2_2026-08-01.xlsx',
                         'sizeKb': 12, 'uploadedBy': '시스템관리자', 'at': '2026-08-01', 'gen': True}],
    }, ensure_ascii=False), encoding='utf-8')
    # notify_corrupt_todo 시나리오용 — title 필드가 없는 손상 서약 할일. 알림 배치의 재서약 필터가
    # x.title.includes 를 undefined 에 호출해 크래시하면 안 된다(String 강제). batchRuns 비워 완료 기록 판별.
    NCRASH_DATA.write_text(json.dumps({
        'todos': [{'id': 'TD-9001', 'owner': '김현우', 'kind': '보안서약서', 'done': False}],
        'batchRuns': [],
    }, ensure_ascii=False), encoding='utf-8')
    # apply_resign_orphan 시나리오용 — 테스트 상태 시스템개발 SR + 원 기안자(박정호) 소유 적용요청 반려
    # 재상신 할일. 다른 재상신자(ADMIN)가 적용요청 상신 시 소유자 무관 마감이 없으면 고아로 남는다.
    APPLY_DATA.write_text(json.dumps({
        'srRequests': [{'srNo': 'SR-2026-9001', 'kind': '시스템개발', 'title': '적용요청고아테스트', 'system': 'ERP',
                        'requester': '김현우', 'dept': '개발1팀', 'status': '테스트', 'requestedAt': '2026-08-01'}],
        'todos': [{'id': 'TD-9001', 'owner': '박정호', 'kind': '재상신', 'done': False, 'dueDate': '2026-08-01',
                   'title': '[적용요청 상신] SR-2026-9001 반려 — 보완 후 재상신 (사유: 보완요망)'}],
    }, ensure_ascii=False), encoding='utf-8')
    INSP_ORPHAN_DATA.write_text(json.dumps({
        'inspectionPlans': [{'id': 'IS-2026-9001', 'itemId': 'CK-01', 'month': '2026-07', 'inspector': '박정호',
                             'status': '결과미등록', 'result': '이전결과'}],
        'todos': [{'id': 'TD-9002', 'owner': '박정호', 'kind': '재상신', 'done': False, 'dueDate': '2026-08-01',
                   'title': '[점검결과 상신] IS-2026-9001 반려 — 보완 후 재상신 (사유: 보완요망)'}],
    }, ensure_ascii=False), encoding='utf-8')
    CHST_DATA.write_text(json.dumps({'channelStates': {'security-db': {}}}, ensure_ascii=False), encoding='utf-8')
    # 프로필 스탬프 불일치 — 'manufacturer' 로 저장된 파일(security-db 강제 가동)을 default 프로필로 로드
    PROFISO_DATA.write_text(json.dumps({'__profileStamp': 'manufacturer', 'channelStates': {'security-db': True}}, ensure_ascii=False), encoding='utf-8')
    SECBAD_DATA.write_text(json.dumps({'channelStates': {'security-db': True}}, ensure_ascii=False), encoding='utf-8')
    DPLGRESIGN_DATA.write_text(json.dumps({
        'todos': [{'id': 'TD-9004', 'owner': '박정호', 'kind': '재상신', 'done': False, 'dueDate': '2026-08-01',
                   'title': '[부서서약 현황 상신] 개발1팀 반려 — 보완 후 재상신 (사유: 보완요망)'}],
    }, ensure_ascii=False), encoding='utf-8')
    APPLYROUTE_DATA.write_text(json.dumps({
        'todos': [{'id': 'TD-9005', 'owner': '박정호', 'kind': '재상신', 'done': False, 'dueDate': '2026-08-01',
                   'title': '[적용요청 상신] SR-2026-9002 반려 — 보완 후 재상신 (사유: 보완요망)'}],
    }, ensure_ascii=False), encoding='utf-8')
    ROT_ORPHAN_DATA.write_text(json.dumps({
        'incidents': [{'id': 'FL-2026-91', 'system': 'ERP', 'title': '회전고아테스트', 'grade': '2등급',
                       'occurredAt': '2026-08-01', 'status': '조치완료', 'reportStatus': '미상신',
                       'countermeasure': '임시조치', 'cmResult': '완료'}],
        'todos': [{'id': 'TD-9003', 'owner': '박정호', 'kind': '재상신', 'done': False, 'dueDate': '2026-08-01',
                   'title': '[장애보고 상신] IR-2026-0001 반려 — 보완 후 재상신 (사유: 보완요망)',
                   'batchItems': ['FL-2026-91']}],
    }, ensure_ascii=False), encoding='utf-8')
    # rotating_fresh_no_overclose 시나리오용(v1.5.88 AP3-3) — 과거 반려 재상신 할일(batchItems=FL-2026-96)이
    # 있는 상태에서 무관한 신규 장애(FL-2026-95)만 상신하면, 항목 재포함이 아니므로 재상신 할일이 안 닫혀야 한다.
    ROT_FRESH_DATA.write_text(json.dumps({
        'incidents': [{'id': 'FL-2026-95', 'system': 'ERP', 'title': '신규무관장애', 'grade': '3등급',
                       'occurredAt': '2026-08-02', 'status': '조치완료', 'reportStatus': '미상신'}],
        'todos': [{'id': 'TD-9005', 'owner': '박정호', 'kind': '재상신', 'done': False, 'dueDate': '2026-08-01',
                   'title': '[장애보고 상신] IR-2026-0002 반려 — 보완 후 재상신 (사유: 통계보완)',
                   'batchItems': ['FL-2026-96']}],
    }, ensure_ascii=False), encoding='utf-8')
    # project_complete_resign_cleanup 시나리오용(v1.5.89) — 이수진 단독 참여 진행중 프로젝트 + 이수진 프로젝트
    # 재서약 할일. PM 이 100% 완료하면 서명 불가한 재서약 할일이 정리돼야 한다(이수진은 타 시드 프로젝트 미참여).
    PJDONE_DATA.write_text(json.dumps({
        'projects': [{'id': 'PJ-9010', 'title': '완료정리테스트', 'manager': '박정호', 'headcount': 1,
                      'members': ['이수진'], 'start': '2026-07-01', 'end': '2026-12-31', 'progress': 90, 'status': '진행중'}],
        'todos': [{'id': 'TD-9010', 'owner': '이수진', 'kind': '보안서약서', 'done': False, 'dueDate': '2026-08-01',
                   'title': '2026년 프로젝트 보안서약서 재서약 (개정 2026-08-01)'}],
    }, ensure_ascii=False), encoding='utf-8')
    # project_emptymembers_signcount 시나리오용(v1.5.89) — members=[](재로딩 정규화 모사) 프로젝트 + 참여서약 1건.
    # signedCount 가 빈 배열을 미지정과 동일 취급해 전원 집계(1건)해야 한다(버그면 [].filter=0).
    PJMEMB_DATA.write_text(json.dumps({
        'projects': [{'id': 'PJ-9011', 'title': '빈명단집계테스트', 'manager': '박정호', 'headcount': 2,
                      'members': [], 'start': '2026-07-01', 'end': '2026-12-31', 'progress': 50, 'status': '진행중'}],
        'pledges': [{'name': '이수진', 'dept': '경영지원팀', 'year': '2026', 'kind': '프로젝트',
                     'signedAt': '2026-08-01', 'method': '온라인', 'projectRef': 'PJ-9011'}],
    }, ensure_ascii=False), encoding='utf-8')
    # remote_departed_ghost 시나리오용(v1.5.90) — s.people 에 없는 '퇴사자A'(종료일 없는 열린 재택 대상자).
    # 재직 교집합 없으면 매월 미제출 유령으로 집계·해소 불가. 화면에 미노출돼야 한다.
    RMGHOST_DATA.write_text(json.dumps({
        'remoteTargets': [{'name': '퇴사자A', 'dept': '개발1팀', 'startDate': '2026-07-01'}],
    }, ensure_ascii=False), encoding='utf-8')
    # autoform_upload_defeat 시나리오용(v1.5.91) — 결과상신 대기(작업등록승인) 변경 + 양식접두와 충돌하는
    # 사용자 업로드 첨부(gen 미설정). 결과상신 시 자동양식이 이 업로드에 막히지 않고 생성돼 📎2 가 돼야 한다.
    AFDEFEAT_DATA.write_text(json.dumps({
        'changes': [{'id': 'CW-9020', 'kind': '인프라', 'title': '자동양식우회테스트변경', 'plan': '작업계획',
                     'status': '작업등록승인', 'registeredAt': '2026-08-01'}],
        'attachments': [{'id': 'AT-9020', 'refId': 'CW-9020', 'name': '인프라변경 작업결과 양식_v1_evil.xlsx',
                         'sizeKb': 10, 'uploadedBy': '박정호', 'at': '2026-08-01'}],
    }, ensure_ascii=False), encoding='utf-8')
    # qna_assign_role 시나리오용(v1.5.92) — 미답변·미배정 문의. 담당 지정 드롭다운이 답변 가능 역할만 나열해야.
    QNAROLE_DATA.write_text(json.dumps({
        'qna': [{'id': 'QA-9030', 'title': '담당지정역할테스트', 'domain': '보안신청', 'author': '김현우',
                 'dept': '개발1팀', 'askedAt': '2026-08-01'}],
    }, ensure_ascii=False), encoding='utf-8')
    # delayed_corrupt_date 시나리오용(v1.5.93) — 파싱 불가 dueDate('0000-00-00')로 지연목록 진입(< today).
    # daysBetween 가드 없으면 'D+NaN'·'최대 지연일수 NaN'. status 는 지연 제외집합(완료·반려·작성중·결재중) 밖.
    DTNAN_DATA.write_text(json.dumps({
        'srRequests': [{'srNo': 'SR-9040', 'title': '손상날짜지연테스트', 'requester': '김현우', 'dept': '개발1팀',
                        'kind': '시스템개발', 'status': '개발중', 'requestedAt': '2026-07-01', 'dueDate': '0000-00-00',
                        'ci': '박정호'}],
    }, ensure_ascii=False), encoding='utf-8')
    # sr_suspend 시나리오용(v1.5.96) — 개발중·과거 dueDate SR(지연 목록 진입). 중지하면 지연에서 빠져야 한다.
    SRSUSP_DATA.write_text(json.dumps({
        'srRequests': [{'srNo': 'SR-9060', 'title': '중지테스트SR', 'system': 'ERP', 'requester': '김현우', 'dept': '개발1팀',
                        'kind': '시스템개발', 'status': '개발중', 'requestedAt': '2026-07-01', 'dueDate': '2026-07-15',
                        'ci': '박정호'}],
    }, ensure_ascii=False), encoding='utf-8')
    passed = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for i, (key, title, fn, extra_env) in targets:
            if run_scenario(i, key, title, fn, extra_env, browser):
                passed += 1
        browser.close()
    UPLOAD.unlink(missing_ok=True)
    DATA.unlink(missing_ok=True)
    EDU_DATA.unlink(missing_ok=True)
    FIN_DATA.unlink(missing_ok=True)
    FYEAR_DATA.unlink(missing_ok=True)
    XKIND_DATA.unlink(missing_ok=True)
    RSPAN_DATA.unlink(missing_ok=True)
    RHIST_DATA.unlink(missing_ok=True)
    DEDU_DATA.unlink(missing_ok=True)
    DPLG_DATA.unlink(missing_ok=True)
    SMOV_DATA.unlink(missing_ok=True)
    ATDUP_DATA.unlink(missing_ok=True)
    NCRASH_DATA.unlink(missing_ok=True)
    APPLY_DATA.unlink(missing_ok=True)
    INSP_ORPHAN_DATA.unlink(missing_ok=True)
    CHST_DATA.unlink(missing_ok=True)
    ROT_ORPHAN_DATA.unlink(missing_ok=True)
    SECBAD_DATA.unlink(missing_ok=True)
    DPLGRESIGN_DATA.unlink(missing_ok=True)
    APPLYROUTE_DATA.unlink(missing_ok=True)
    OPSSCOPE_DATA.unlink(missing_ok=True)
    SYSINC_DATA.unlink(missing_ok=True)
    NOTICESCOPE_DATA.unlink(missing_ok=True)
    ROT_FRESH_DATA.unlink(missing_ok=True)
    PJDONE_DATA.unlink(missing_ok=True)
    PJMEMB_DATA.unlink(missing_ok=True)
    RMGHOST_DATA.unlink(missing_ok=True)
    AFDEFEAT_DATA.unlink(missing_ok=True)
    QNAROLE_DATA.unlink(missing_ok=True)
    DTNAN_DATA.unlink(missing_ok=True)
    SRSUSP_DATA.unlink(missing_ok=True)
    for bak in DATA.parent.glob('.e2e-*.json.*.bak'):
        bak.unlink(missing_ok=True)
    total = len(targets)
    print(f'\n{"✓" if passed == total else "✗"} e2e: {passed}/{total} 시나리오 통과')
    return 0 if passed == total else 1


if __name__ == '__main__':
    sys.exit(main())
