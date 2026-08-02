/** 결재 상신 공통 로직 — 문서 유형별 기본 결재선(환경설정 > 결재선 관리)에서 결재자를 해석한다.
 *  기안자 본인이 결재자면 시스템관리자(그마저 본인이면 업무담당)로 대체해 자기 결재를 막는다.
 *  상신과 동시에 결재자에게 '결재' 할일이 생긴다 — 전 도메인 공통 폐쇄 루프. */
import { ACCOUNTS } from './session'
import { today } from './dates'
import { getStore, nextNo } from './store'
import type { ApprovalDocType } from './types'

export function draftApproval(opts: {
  docType: ApprovalDocType
  title: string
  ref: string
  drafter: { name: string; dept: string }
}): string {
  const s = getStore()
  const biz = ACCOUNTS.find((a) => a.role === 'BIZ_MGR')!
  const adm = ACCOUNTS.find((a) => a.role === 'ADMIN')!

  let approver = s.approvalLines.find((l) => l.docType === opts.docType)?.approver ?? biz.name
  if (approver === opts.drafter.name) approver = opts.drafter.name === adm.name ? biz.name : adm.name

  const year = today().slice(0, 4)
  const apId = nextNo('AP', year, s.approvals.map((a) => a.id))
  s.approvals.unshift({
    id: apId, docType: opts.docType, title: opts.title,
    drafter: opts.drafter.name, dept: opts.drafter.dept, approver,
    status: '대기', draftedAt: today(), ref: opts.ref,
  })
  s.todos.unshift({
    id: nextNo('TD', year, s.todos.map((t) => t.id)),
    owner: approver, kind: '결재', title: `${apId} 결재 처리`, dueDate: today(), done: false,
  })
  return apId
}
