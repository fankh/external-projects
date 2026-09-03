'use server'
import { inDisposalProcess } from '@/lib/stock'
import { revalidatePath } from 'next/cache'
import { appendAudit, appendDenial } from '@/lib/audit'
import { today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { can } from '@/lib/perm'
import { GONE_STATUSES } from '@/lib/types'
import { isKnownLocation } from '@/lib/codes'

async function guard() {
  const session = await getSession()
  if (!session) return null
  // 매트릭스 '저장' 칸도 필요조건 — 관리자가 회수하면 이 화면의 변경 액션이 모두 막힌다(조회 게이트와 같은 규약).
  //  그전에는 저장·삭제 칸이 어디서도 읽히지 않아 매트릭스에서 빼도 저장이 그대로 됐다(표시만 되는 정책).
  if (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role)) {
    // 거부는 감사에 남긴다 — 서버 액션은 화면에서 버튼을 숨겨도 액션 id 로 직접 호출할 수 있다.
    //  화면 진입·문서 반출 거부는 이미 '결과=실패'로 남는데, 정작 변경을 시도한 기록만 빠져 있었다.
    //  같은 사람·같은 화면의 반복은 하루 한 건으로 접힌다(lib/audit appendDenial).
    appendDenial({ actor: session.name, action: '권한 밖 변경 시도 — 수명주기 (저장)', target: '/assets/movement' })
    return null
  }
  return session
}

/** 불출 처리 — 승인된 '자산 신청'에 유휴 재고를 배정한다.
 *  결재 승인만으로는 실물이 움직이지 않으므로, 여기서 소유자·부서·위치를 확정하고
 *  대장 상태를 사용중으로 바꾼 뒤 이력을 축적한다. (제품안내서 §03 PHASE 3) */
export async function issueAsset(approvalId: string, assetNo: string, location: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '불출 처리 권한이 없습니다.' }
  // 배치 위치는 레지스트리 값이어야 한다 — 불출은 대장 위치를 확정하는 자리이고, 레지스트리 밖 위치가 실리면
  //  그 자산은 재물조사 편성·스캔에서 빠진다(이동 신청·실사 스캔과 같은 규약).
  if (!isKnownLocation(location)) return { ok: false, message: `등록되지 않은 위치입니다 — ${location} (위치는 공통코드에서 관리합니다).` }

  const s = getStore()
  const ap = s.approvals.find((a) => a.id === approvalId)
  if (!ap || ap.kind !== '자산 신청' || ap.status !== '승인') {
    return { ok: false, message: '승인된 자산 신청이 아닙니다.' }
  }
  if (ap.fulfilled) return { ok: false, message: `이미 불출 처리된 신청입니다 — ${ap.id}` }

  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (!['유휴', '검수중'].includes(asset.status)) {
    return { ok: false, message: `불출 가능한 상태가 아닙니다 — ${asset.assetNo} (${asset.status})` }
  }
  // NAC 격리 중인 자산은 불출하지 않는다 — 망이 막힌 장비를 받은 사람은 쓸 수 없고, 보안 조사가 열린 채 보유자만 바뀐다.
  if (asset.quarantinedAt) return { ok: false, message: `NAC 격리 중인 자산은 불출할 수 없습니다 — ${asset.assetNo} (격리 ${asset.quarantinedAt} · 해제 후 처리).` }
  // 폐기 절차(대상 선정~소거 대기) 중인 자산은 불출할 수 없다 — 파기 예정 자산이 다시 배정되면 안 된다(가용 재고 산정과 동일 판정).
  if (inDisposalProcess(s.disposals, asset.assetNo)) {
    return { ok: false, message: `폐기 절차 중인 자산은 불출할 수 없습니다 — ${asset.assetNo} (먼저 폐기 대상 선정을 취소하세요).` }
  }

  const from = `${asset.owner} / ${asset.location}`
  asset.owner = ap.requester
  asset.dept = ap.dept
  asset.location = location
  asset.status = '사용중'
  asset.receiptPending = true // 사용자 수령(인수) 확인 대기 — 체인 오브 커스터디
  asset.history.push({
    date: today(),
    kind: '불출',
    detail: `${ap.id} 승인 불출 — ${from} → ${ap.requester} / ${location}`,
    actor: session.name,
  })

  ap.fulfilled = true
  ap.refId = asset.assetNo

  // 신청자에게 실물 지급 완료를 알린다 — 결재 승인(결재 결과)과 별개로, 실제 배정·수령 위치를 통보한다.
  dispatch({ channel: '이메일', to: ap.requester, subject: `자산 불출 완료 — ${asset.assetNo} ${asset.model} 배정 · ${location}에서 수령하세요 (${ap.id})`, kind: '자산 불출', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `자산 불출 처리 (${ap.id}) · 신청자 통보`, target: asset.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${asset.assetNo} 불출 완료 — ${ap.requester} / ${location} · 신청자에게 수령 안내 발송` }
}

/** 이동 처리 — 승인된 '이동' 신청의 목적지를 대장에 반영한다.
 *  승인된 이동이 집행되지 않으면 대장과 실물이 어긋나 재물조사에서 위치 불일치로 잡힌다. */
export async function moveAsset(approvalId: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '이동 처리 권한이 없습니다.' }

  const s = getStore()
  const ap = s.approvals.find((a) => a.id === approvalId)
  if (!ap || ap.kind !== '이동' || ap.status !== '승인') {
    return { ok: false, message: '승인된 이동 신청이 아닙니다.' }
  }
  if (ap.fulfilled) return { ok: false, message: `이미 이동 처리된 신청입니다 — ${ap.id}` }

  const asset = s.assets.find((a) => a.assetNo === ap.refId)
  if (!asset) return { ok: false, message: '대상 자산을 찾을 수 없습니다.' }
  const to = ap.targetLocation
  if (!to) return { ok: false, message: '이동 목적지가 지정되지 않은 신청입니다.' }

  // 목적지가 아직 등록된 위치인가 — 상신 때는 공통코드에서 골랐어도, 승인과 집행 사이에 그 코드가 미사용 전환될 수 있다.
  //  그대로 쓰면 레지스트리 밖 위치가 대장에 실려 그 자산이 재물조사 편성·스캔에서 빠지고, 매번 거절만 하면
  //  이 신청은 집행 대기 큐에 영원히 남는다(반려·취소는 대기 건만 받는다 — 따를 수 없는 안내가 된다).
  //  그래서 상태 이탈과 같은 규약으로 결재 건에 사유를 적고 큐에서 닫는다.
  if (!isKnownLocation(to)) {
    const whyLoc = `목적지 ${to} 미등록(공통코드 미사용)`
    ap.unfulfilledReason = whyLoc
    ap.unfulfilledAt = today()
    appendAudit({ actor: session.name, action: `자산 이동 미적용 — ${ap.refId} · ${ap.id} 집행 불가 종결 (${whyLoc})`, target: String(ap.refId ?? ap.id) })
    dispatch({ channel: '이메일', to: ap.requester, subject: `[결재 결과] 자산 이동 승인 — 다만 ${whyLoc} 로 집행되지 않았습니다 (${ap.id})`, kind: '에스컬레이션', ref: ap.id })
    revalidatePath('/', 'layout')
    return { ok: false, message: `등록되지 않은 위치입니다 — ${to} (신청 ${ap.id} 을 집행 불가로 종결했습니다 · 위치는 공통코드에서 관리합니다).` }
  }

  // 스테일 이동 방어 — 상신·승인 뒤 자산이 분실·폐기 경로로 떠났으면 집행하지 않는다. 형제 집행 경로가 모두 같은
  //  방어를 둔다(불출은 유휴·검수중만·폐기 절차 제외, 반납은 재배정 자산 미적용, 라이선스는 좌석 전량 회수 시 미적용).
  //  없으면 폐기·분실 확정 자산의 위치만 바뀌고 신청자에게는 '이동 완료' 통보가 나간다 — 대장이 실물과 어긋나고
  //  통보가 사실과 다르다. 신청 자체는 남겨 둔다(반려·취소로 정리할 대상이라 조용히 지우지 않는다).
  //  떠난 것은 분실·폐기만이 아니다. 이동 신청은 본인 명의 자산에 올리는데, 상신 뒤 그 자산이 반납 결재로
  //  회수 대기에 들어가거나(반납대기) 다른 사람에게 대여되거나(대여중) 수리 업체로 나가면(수리중) 신청자의
  //  손을 이미 떠난 것이고, 보유자가 재배정으로 바뀌었어도 마찬가지다. 종류가 다른 신청은 서로를 막지 않아
  //  (중복 검사는 같은 종류만 본다) 같은 자산에 반납과 이동이 동시에 대기할 수 있고, 둘 다 승인하면 이동
  //  집행이 그대로 통과했다 — 회수를 기다리는 자산의 위치만 대장에서 바뀌고 신청자에게는 "이동 완료"가
  //  통보된다(실측: 반납대기 자산이 본사 8F → 본사 9F 로 이동 완료 처리됐다). 반납 결재가 쓰는 판정과
  //  같은 모양으로 막는다(decide 의 스테일 반납 방어 reConfirmed).
  const handedOver = asset.owner !== ap.requester || ['반납대기', '대여중', '수리중'].includes(asset.status)
  if (GONE_STATUSES.includes(asset.status) || handedOver) {
    // 이 신청은 영원히 집행할 수 없다 — 이동 대상 자산은 결재에 고정돼 있어(refId) 다른 자산으로 바꿀 수 없고,
    //  그 자산이 분실·폐기로 떠났기 때문이다(불출은 담당자가 다른 자산을 고르면 되므로 이 경우가 아니다).
    //  예전에는 '반려·취소로 정리하세요'라고 안내했는데, 반려(decide)도 상신 취소(withdrawRequest)도 '대기'
    //  건만 받는다 — 이미 승인된 이 건에는 두 길이 다 막혀 있어, 따를 수 없는 안내였다. 그동안 이 신청은
    //  '이동 집행 대기' 큐에 영원히 남았다(빠져나갈 문이 없는 큐).
    //  시스템이 불가능을 확정한 지금 그 사실을 결재 건에 적어 큐에서 닫는다(대여 승인 미집행과 같은 규약).
    const why = GONE_STATUSES.includes(asset.status) ? `${asset.status} 이탈`
      : asset.owner !== ap.requester ? `보유자 변경(현재 ${asset.owner})`
      : `${asset.status} 재확인`
    ap.unfulfilledReason = why
    ap.unfulfilledAt = today()
    appendAudit({ actor: session.name, action: `자산 이동 미적용 — ${asset.assetNo} (${asset.status}) · ${ap.id} 집행 불가 종결`, target: asset.assetNo })
    dispatch({ channel: '이메일', to: ap.requester, subject: `[결재 결과] 자산 이동 승인 — 다만 ${asset.assetNo} 는 ${why}로 집행되지 않았습니다 (${ap.id})`, kind: '결재 결과', ref: ap.id })
    revalidatePath('/', 'layout')
    return { ok: false, message: `이동 처리할 수 없습니다 — ${asset.assetNo} (${why}) · 신청 ${ap.id} 을 집행 불가로 종결하고 신청자에게 통보했습니다.` }
  }

  const from = asset.location
  asset.location = to
  asset.history.push({
    date: today(),
    kind: '이동',
    detail: `${ap.id} 승인 이동 — ${from} → ${to}`,
    actor: session.name,
  })
  ap.fulfilled = true

  // 신청자에게 이동 집행 완료를 알린다 — 결재 승인(신청 접수)과 별개로, 실제 위치 변경이 반영됐음을 통보한다.
  // (불출 통보 v1.137 과 대칭 — 이동도 승인만으로는 실물이 안 움직이므로 집행 시점에 요청자 루프를 닫는다.)
  dispatch({ channel: '이메일', to: ap.requester, subject: `자산 이동 완료 — ${asset.assetNo} ${asset.model} · ${from} → ${to} (${ap.id})`, kind: '자산 이동', ref: asset.assetNo })
  appendAudit({ actor: session.name, action: `자산 이동 처리 (${ap.id}) · 신청자 통보`, target: asset.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${asset.assetNo} 이동 완료 — ${from} → ${to} · 신청자에게 통보 발송` }
}
