import { appendAudit } from './audit'
import { today } from './dates'
import { getStore, nextApprovalId } from './store'
import type { Session } from './session'

/** 라이선스 조치 결재 상신 — 초과 사용은 추가 구매 품의, 미사용 보유는 회수.
 *  컴플라이언스 화면의 수동 조치(actOnLicense)와 AI 라이선스 최적화 제안 승인이
 *  같은 결재를 만들도록 로직을 한 곳에 둔다. 같은 라이선스에 이미 대기 결재가 있으면
 *  중복 상신하지 않는다. approvalId 는 신규·기존(대기) 모두 반환한다. */
export function raiseLicenseApproval(
  session: Pick<Session, 'name'>,
  licenseId: string,
  kind: '추가 구매' | '회수',
): { ok: boolean; message: string; approvalId?: string } {
  const s = getStore()
  const l = s.licenses.find((x) => x.id === licenseId)
  if (!l) return { ok: false, message: '라이선스를 찾을 수 없습니다.' }

  const gap = l.used - l.purchased
  if (kind === '추가 구매' && gap <= 0) return { ok: false, message: `초과 사용 상태가 아닙니다 — ${l.name}` }
  if (kind === '회수' && gap >= 0) return { ok: false, message: `회수할 여유 석이 없습니다 — ${l.name}` }

  const dup = s.approvals.find((a) => a.status === '대기' && a.refId === l.id)
  if (dup) return { ok: false, message: `이미 결재 대기 중인 조치가 있습니다 — ${dup.id}`, approvalId: dup.id }

  const seats = Math.abs(gap)
  const cost = seats * l.unitCost
  const id = nextApprovalId()
  s.approvals.unshift({
    id,
    kind: '자산 신청',
    title:
      kind === '추가 구매'
        ? `${l.name} 라이선스 ${seats}석 추가 구매 품의 — 초과 사용 해소 (약 ${cost.toLocaleString()}원)`
        : `${l.name} 라이선스 ${seats}석 회수 — 장기 미사용 (연 약 ${cost.toLocaleString()}원 절감)`,
    requester: session.name,
    dept: 'IT기획팀',
    requestedAt: today(),
    status: '대기',
    currentStep: 'IT기획팀장 결재',
    refId: l.id,
    note: `보유 ${l.purchased} / 사용 ${l.used} · 단가 ${l.unitCost.toLocaleString()}원`,
  })

  appendAudit({ actor: session.name, action: `라이선스 ${kind} 상신 (${seats}석)`, target: l.id })
  return { ok: true, message: `${id} 상신 — ${l.name} ${seats}석 ${kind}`, approvalId: id }
}
