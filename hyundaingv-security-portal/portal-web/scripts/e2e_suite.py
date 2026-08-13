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
BASE_PORT = 3520
UPLOAD = ROOT / 'scripts' / '.e2e-upload.txt'
DATA = ROOT / 'scripts' / '.e2e-data.json'


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
    pg.goto(f'{base}/sr/ci', wait_until='networkidle')
    check('E2E 데이터 추출' in pg.content(), '재상신 승인 → CI배정')

    # BA 배정 시 검토 증적 첨부 — SR 번호(pk) 하나로 신청·BA 첨부가 합쳐진다 (첨부 시트)
    row = pg.locator('tr', has_text='E2E 데이터 추출')
    row.locator('input[type=file]').set_input_files(str(UPLOAD))
    row.locator('button:has-text("배정 · 착수")').click()
    pg.wait_for_load_state('networkidle')
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

    login(pg, base, '박정호')
    pg.goto(f'{base}/awareness/remote', wait_until='networkidle')
    status = pg.locator('.card', has_text='전사 제출 현황')
    check('김현우' in status.inner_text(), '제출 → 명단 기준 현황 반영')

    # CSV 업로드 — '이름,시작일자' 행 반영 (잘못된 줄은 건너뛴다)
    csv_path = UPLOAD.parent / '.e2e-remote.csv'
    csv_path.write_text('강도윤,2026-08-10\n무명인,2026-08-10\n', encoding='utf-8')
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


def sc_revision(pg, base, check):
    """서약양식 개정 → 전원 재서약 재산출 → 스캔본 등록"""
    from datetime import datetime, timedelta, timezone
    today = (datetime.now(timezone.utc) + timedelta(hours=9)).strftime('%Y-%m-%d')
    login(pg, base, '박정호')
    pg.goto(f'{base}/pledge/manage', wait_until='networkidle')
    row = pg.locator('tr', has_text='일반 보안서약서')
    row.locator('input[name=revisedAt]').fill(today)
    row.locator('button:has-text("개정")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/pledge/manage', wait_until='networkidle')
    check('8' in pg.locator('.stat', has_text='미서약').inner_text(), '개정 → 전원(8명) 재서약 대상')
    pg.locator('tr', has_text='강도윤').locator('button:has-text("스캔본 업로드")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/pledge/manage', wait_until='networkidle')
    check('7' in pg.locator('.stat', has_text='미서약').inner_text(), '스캔본 등록 → 미서약 감소')


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
    check('일일 알림 배치' in pg.locator('.card', has_text='배치 실행 이력').inner_text(), '자동 배치 이력')
    pg.goto(f'{base}/settings/audit', wait_until='networkidle')
    check('스케줄러' in pg.content(), '감사 행위자=스케줄러')


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
    chan_card = pg.locator('.card', has_text='연동 채널').inner_text()
    check('문자(SMS) 발송' not in chan_card, 'SMS 채널 제거(연동 채널 카드)')
    check('erp-asset' in body, 'ERP 자산 어댑터 바인딩')
    login(pg, base, '박정호')
    pg.goto(f'{base}/finance/asset-reg', wait_until='networkidle')
    check('SN-NB-88121' in pg.content(), 'erp-asset 어댑터 실동작(자산 조회)')


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
    ('codes', '공통코드 토글·사용기간·추가·삭제 → 업무 선택지', sc_codes, {}),
    ('board', '게시판 삭제 (공지·QnA) + 감사 기록', sc_board, {}),
    ('remote', '재택 대상자 명단 — 스코핑·업로드·기간 조회·종료', sc_remote, {}),
    ('criteria', '점검 기준관리 — 등록·업로드·삭제·사용중 가드', sc_criteria, {}),
    ('racks', '랙·H/W 관리 — 등록·구성도·삭제 가드', sc_racks, {}),
    ('infracrud', '인프라 CRUD — 서버·시스템·배치·인터페이스', sc_infracrud, {}),
    ('menuauth', '메뉴권한 런타임 제한 — 숨김·차단·복원·감사', sc_menuauth, {}),
    ('line', '결재선 변경 → 결재자 변경', sc_approval_line, {}),
    ('scheduler', '알림 배치 자동 발화', sc_scheduler, {'PORTAL_NOTIFY_INTERVAL_MS': '2000'}),
    ('runtime', '404 · ChunkReload 복구', sc_runtime, {}),
    ('profile', '고객사 프로필 스위칭 (manufacturer)', sc_profile, {'PORTAL_PROFILE': 'manufacturer'}),
    ('batchref', '상신 묶음 번호 재사용 금지 (반려 후 재상신)', sc_batchref, {}),
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
    passed = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for i, (key, title, fn, extra_env) in targets:
            if run_scenario(i, key, title, fn, extra_env, browser):
                passed += 1
        browser.close()
    UPLOAD.unlink(missing_ok=True)
    DATA.unlink(missing_ok=True)
    for bak in DATA.parent.glob(DATA.name + '.*.bak'):
        bak.unlink(missing_ok=True)
    total = len(targets)
    print(f'\n{"✓" if passed == total else "✗"} e2e: {passed}/{total} 시나리오 통과')
    return 0 if passed == total else 1


if __name__ == '__main__':
    sys.exit(main())
