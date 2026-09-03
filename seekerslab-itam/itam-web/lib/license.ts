import { appendAudit } from './audit'
import { today, NUM_LOCALE } from './dates'
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
  // 전량 미사용(used=0)은 석 감축(회수)이 아니라 해지 대상 — 회수하면 purchased=0 이 되어 사용률(used/purchased)이 0/0=NaN 로 무너진다(컴플라이언스·리포트·좌석 카드 오염). 해지로 유도.
  if (kind === '회수' && l.used === 0) return { ok: false, message: `전량 미사용 라이선스는 회수가 아니라 해지 대상입니다 — ${l.name} (보유 ${l.purchased}석 전량 미사용)` }

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
        ? `${l.name} 라이선스 ${seats}석 추가 구매 품의 — 초과 사용 해소 (약 ${cost.toLocaleString(NUM_LOCALE)}원)`
        : `${l.name} 라이선스 ${seats}석 회수 — 장기 미사용 (연 약 ${cost.toLocaleString(NUM_LOCALE)}원 절감)`,
    requester: session.name,
    dept: 'IT기획팀',
    requestedAt: today(),
    status: '대기',
    currentStep: 'IT기획팀장 결재',
    refId: l.id,
    note: `보유 ${l.purchased} / 사용 ${l.used} · 단가 ${l.unitCost.toLocaleString(NUM_LOCALE)}원`,
  })

  appendAudit({ actor: session.name, action: `라이선스 ${kind} 상신 (${seats}석)`, target: l.id })
  return { ok: true, message: `${id} 상신 — ${l.name} ${seats}석 ${kind}`, approvalId: id }
}

/** 라이선스 좌석 회수(자산 이탈 시) — 자산이 보유자를 떠날 때(오프보딩 회수·폐기) 그 자산에 배정된
 *  모든 라이선스 좌석을 대장에서 제거한다. 떠난 자산에 좌석이 물려 있으면 보유-사용 대사가 어긋나고
 *  비용이 새기 때문(로56의 좌석 생애주기 마감). 회수된 좌석은 다시 배정 가능한 여유석이 된다.
 *  제거된 라이선스명 목록을 반환한다(호출부가 이력·메시지에 반영). 감사 로그는 여기서 남긴다. */
/** 폐기 완료 자산의 SW 설치 기록 정리 — 소거·처분으로 장비가 사라지면 EDR 설치 인벤토리에 남은 기록이
 *  좌석 대사에서 '배정 밖 설치(무단 사용 · SAM 리스크)'로 계속 잡힌다. 좌석은 폐기 시 회수되므로
 *  남은 설치는 반드시 배정 밖으로 분류되고, 화면은 존재하지 않는 장비에 '좌석 배정 — 무단 사용 합법화'를
 *  권한다(없는 장비 몫의 라이선스를 사더라도 대사는 닫히지 않는다). 좌석 회수·CMDB 의존 참조 정리와
 *  같은 폐기 시 참조 정리 규약. 정리된 라이선스 ID 목록을 돌려준다. 서버 전용. */
export function clearSwInstalls(assetNo: string): string[] {
  const s = getStore()
  const hit = (s.swInstalls ?? []).filter((i) => i.assetNo === assetNo)
  if (hit.length === 0) return []
  s.swInstalls = (s.swInstalls ?? []).filter((i) => i.assetNo !== assetNo)
  return [...new Set(hit.map((i) => i.licenseId))]
}

export function reclaimLicenseSeats(assetNo: string, actor: string, reason: string): string[] {
  const s = getStore()
  const freed: string[] = []
  for (const l of s.licenses) {
    if (!l.seats?.some((st) => st.assetNo === assetNo)) continue
    const before = l.seats.length
    l.seats = l.seats.filter((st) => st.assetNo !== assetNo)
    // used 하한 정합 — used 가 좌석 수에 붙어 있었으면(좌석 파생 · 전사 소비 집계 없음) 좌석 회수 시 함께 내린다.
    //  used 가 좌석보다 크면(넓은 소비 집계) 그대로 둔다. 배정 시 상한 클램프(seats.length>used→used=seats.length)의 하향 짝 —
    //  이게 없으면 UI 생성 라이선스 used 가 배정 고점에 갇혀 전량 회수 후에도 '적정'으로 오분류돼 회수 절감 기회가 감춰진다.
    if (l.used === before) l.used = l.seats.length
    freed.push(l.name)
    appendAudit({ actor, action: `라이선스 좌석 자동 회수 — ${l.name} ← ${assetNo} (${reason})`, target: l.id })
  }
  return freed
}

/** 라이선스 좌석 보유자 승계(자산 재배정 시) — 자산이 새 보유자에게 직접 인계되면(반납 없이) 그 자산에 물린 좌석은
 *  회수되지 않고 자산과 함께 승계자에게 넘어간다(로30·로56). 좌석 배정 대장의 보유자·부서를 새 보유자로 갱신하지 않으면
 *  SAM 감사 배정 대장이 '떠난 사람'을 계속 가리켜 대사·소명이 어긋난다. 갱신된 라이선스명 목록을 반환한다. */
export function transferLicenseSeats(assetNo: string, newUser: string, newDept: string, actor: string): string[] {
  const s = getStore()
  const moved: string[] = []
  for (const l of s.licenses) {
    const seats = l.seats?.filter((st) => st.assetNo === assetNo) ?? []
    if (seats.length === 0) continue
    for (const st of seats) { st.user = newUser; st.dept = newDept }
    moved.push(l.name)
    appendAudit({ actor, action: `라이선스 좌석 보유자 승계 — ${l.name} @ ${assetNo} → ${newUser}·${newDept}`, target: l.id })
  }
  return moved
}
