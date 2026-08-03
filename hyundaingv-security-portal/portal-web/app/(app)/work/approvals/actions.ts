'use server'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore, nextNo } from '@/lib/store'

/** 결재 처리 — 승인·반려는 참조 업무(ref)의 상태로 전파되고, 내 '결재' 할일을 닫는다.
 *  결재자 본인 여부를 서버에서 재검증한다(화면 숨김과 별개의 가드). */
async function decide(formData: FormData, verdict: '승인' | '반려') {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300)
  // 반려는 사유 필수 — 기안자가 보완·재상신할 근거가 된다
  if (verdict === '반려' && !reason) return
  const s = getStore()
  const ap = s.approvals.find((a) => a.id === id)
  if (!ap || ap.approver !== me.name || ap.status !== '대기') return

  ap.status = verdict
  ap.decidedAt = today()
  if (verdict === '반려') ap.rejectReason = reason
  audit(me.name, verdict === '승인' ? '결재 승인' : '결재 반려',
    `${ap.id} ${ap.docType} — ${ap.title}${verdict === '반려' ? ` (사유: ${reason})` : ''}`)

  // 폐쇄 루프 3 — 반려는 기안자에게 '재상신' 할일로 되돌아간다 (전 문서 유형 공통).
  // 문서 유형 태그를 제목에 남겨 할일 바로가기·재상신 시 자동 마감의 매칭 키로 쓴다.
  if (verdict === '반려') {
    s.todos.unshift({
      id: nextNo('TD', today().slice(0, 4), s.todos.map((t) => t.id)),
      owner: ap.drafter, kind: '재상신',
      title: `[${ap.docType}] ${ap.ref ?? ap.id} 반려 — 보완 후 재상신 (사유: ${reason})`,
      dueDate: today(), done: false,
    })
  }

  // 폐쇄 루프 1 — SR 신청 결재가 SR 진행 상태로 전파된다 (승인 → CI배정, 반려 → 반려)
  if (ap.docType === 'SR 신청' && ap.ref) {
    const sr = s.srRequests.find((r) => r.srNo === ap.ref)
    if (sr && sr.status === '결재중') sr.status = verdict === '승인' ? 'CI배정' : '반려'
  }

  // 폐쇄 루프 1-2 — 정산품의(투자·비용) 결재가 지급 상태로 전파되어 실적·속보 기준금액에 반영된다
  if ((ap.docType === '투자 정산품의' || ap.docType === '비용 정산품의') && ap.ref) {
    const st = s.settlements.find((x) => x.id === ap.ref)
    if (st && st.status === '결재중') st.status = verdict === '승인' ? '지급완료' : '반려'
  }

  // 폐쇄 루프 1-3 — 장애보고 결재가 보고서에 묶인 장애 건 전체의 보고 상태로 전파된다
  if (ap.docType === '장애보고 상신' && ap.ref) {
    for (const inc of s.incidents.filter((i) => i.reportRef === ap.ref && i.reportStatus === '결재중')) {
      if (verdict === '승인') {
        inc.reportStatus = '결재완료'
      } else {
        inc.reportStatus = '미상신'
        inc.reportRef = undefined
      }
    }
  }

  // 폐쇄 루프 1-4 — 변경 계획·결과 상신은 각 1회씩. 결과 승인 시 시스템개발 변경은 매칭 SR을 완료로 전파한다
  if (ap.docType === '변경계획 상신' && ap.ref) {
    const cw = s.changes.find((c) => c.id === ap.ref)
    if (cw && cw.status === '계획결재중') cw.status = verdict === '승인' ? '작업등록승인' : '작업등록'
  }
  if (ap.docType === '변경결과 상신' && ap.ref) {
    const cw = s.changes.find((c) => c.id === ap.ref)
    if (cw && cw.status === '작업완료결재중') {
      cw.status = verdict === '승인' ? '최종완료' : '작업등록승인'
      if (verdict === '승인' && cw.kind === '시스템개발' && cw.srNo) {
        const sr = s.srRequests.find((r) => r.srNo === cw.srNo)
        if (sr && sr.status === '적용요청') {
          sr.status = '완료'
          sr.completedAt = today()
        }
      }
    }
  }

  // 폐쇄 루프 1-6 — 출력물폐기 결재가 상신 묶음 전체의 폐기확정으로 전파된다
  if (ap.docType === '출력물폐기 상신' && ap.ref) {
    for (const row of s.printouts.filter((p) => p.approvalRef === ap.ref && p.status === '결재중')) {
      if (verdict === '승인') {
        row.status = '폐기확정'
      } else {
        row.status = '등록'
        row.approvalRef = undefined
      }
    }
  }

  // 폐쇄 루프 1-8 — 협력업체 서약 상신 결재가 묶인 징구 건 전체로 전파된다
  if (ap.docType === '서약 현황 상신' && ap.ref) {
    for (const c of s.companyPledges.filter((x) => x.approvalRef === ap.ref && x.status === '결재중')) {
      if (verdict === '승인') {
        c.status = '완료'
      } else {
        c.status = '등록'
        c.approvalRef = undefined
      }
    }
  }

  // 폐쇄 루프 1-7 — 보안위반 확인서 결재가 위반 건 상태로 전파된다 (승인 → 완료, 반려 → 징구중)
  if (ap.docType === '보안위반 확인서' && ap.ref) {
    const v = s.violations.find((x) => x.id === ap.ref)
    if (v && v.status === '결재중') v.status = verdict === '승인' ? '완료' : '징구중'
  }

  // 폐쇄 루프 1-5 — 점검결과 결재가 점검 진행내역 현황판(계획·미등록·완료 집계)으로 전파된다
  if (ap.docType === '점검결과 상신' && ap.ref) {
    const plan = s.inspectionPlans.find((x) => x.id === ap.ref)
    if (plan && plan.status === '결재중') plan.status = verdict === '승인' ? '완료' : '결과미등록'
  }

  // 폐쇄 루프 2 — 내 할일 목록의 해당 결재 건이 자동으로 닫힌다
  const todo = s.todos.find((t) => t.owner === me.name && t.kind === '결재' && t.title.includes(id) && !t.done)
  if (todo) todo.done = true

  revalidatePath('/', 'layout')
}

export async function approve(formData: FormData) {
  await decide(formData, '승인')
}

export async function reject(formData: FormData) {
  await decide(formData, '반려')
}
