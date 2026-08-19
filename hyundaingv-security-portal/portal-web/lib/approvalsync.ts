/** 전자결재(그룹웨어) 상신 푸시 — 포털의 대기 결재를 외부 그룹웨어 결재함에 등록하고 추적 id 를 잇는다.
 *  요구사항: "결재 상신 연동 (결재는 그룹웨어에서 확인)". 상신 시점과 분리된 배치/수동 이관이라, 외부
 *  그룹웨어 장애가 포털 상신을 막지 않는다(secmon·secdata 이관과 동일한 폐쇄루프 계열). 이미 연동된 건
 *  (externalRef 보유)은 건너뛰어 중복 푸시를 막는다. */
import { audit } from './audit'
import { approvalAdapter, withTimeout } from './integrations/registry'
import { getStore } from './store'

export interface ApprovalPushResult {
  pushed: number
  ok: boolean
  detail: string
}

export async function pushPendingApprovals(actor: string): Promise<ApprovalPushResult> {
  const adapter = approvalAdapter()
  if (!adapter) return { pushed: 0, ok: false, detail: '전자결재 채널 중지/미등록' }
  const s = getStore()
  let pushed = 0
  // 대기 중 + 미연동(externalRef 없음) 결재만 — 승인·반려된 종결 문서나 이미 연동된 문서는 제외.
  for (const a of s.approvals) {
    if (a.status !== '대기' || a.externalRef) continue
    try {
      const r = await withTimeout(adapter.pushApproval({
        docId: a.id, docType: a.docType, title: a.title, drafter: a.drafter, approver: a.approver, submittedAt: a.draftedAt,
      }), '전자결재 상신 푸시')
      // 계약 검증 — 비어있지 않은 문자열 externalId 만 연동 id 로 저장한다(오형 응답 방어).
      if (r && typeof r.externalId === 'string' && r.externalId.trim()) {
        a.externalRef = r.externalId.trim()
        audit(actor, '전자결재 상신 연동', `${a.id} → ${a.externalRef} (${a.docType})`)
        pushed += 1
      }
    } catch { /* 개별 푸시 실패는 건너뛴다 — externalRef 미설정으로 다음 배치에서 재시도된다 */ }
  }
  return { pushed, ok: true, detail: `대기 결재 ${pushed}건 그룹웨어 연동` }
}
