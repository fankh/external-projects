'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { daysUntil, isLoanDueSoon, isLoanOverdue, isRepairEtaMissing, isRepairOverdue, isValidDate, today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
import { can } from '@/lib/perm'
import { loanRemindTargets, repairRemindTargets } from '@/lib/reminders'
import { reclaimLicenseSeats } from '@/lib/license'
import type { ReturnCondition } from '@/lib/types'

/** 반납 접수 · 상태 점검 — 회수한 실물을 점검해 유휴 풀에 넣을지, 수리·폐기로 뺄지 가른다.
 *  (제품안내서 §03 PHASE 4: 반납 접수·상태 점검, 유휴 자산 풀 관리) */
export async function receiveReturn(assetNo: string, condition: ReturnCondition, location: string, note: string) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) {
    return { ok: false, message: '반납 접수 권한이 없습니다.' }
  }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '반납대기') {
    return { ok: false, message: `반납 접수 대상이 아닙니다 — ${assetNo} (${asset.status})` }
  }

  const prevOwner = asset.owner

  // 점검 결과가 다음 상태를 결정한다:
  //  - 폐기 권고 → 폐기예정 (유휴 풀을 거치지 않고 폐기 절차로)
  //  - 수리 필요 → 수리중 (수리를 마쳐야 유휴 풀에 들어간다. 고장 자산이 바로 재불출되면 안 된다)
  //  - 정상 → 유휴 (바로 재배치 가능)
  if (condition === '폐기 권고') {
    asset.status = '폐기예정'
    // 반납으로 보유자를 떠났으므로 소유자를 비운다 — 다른 점검 결과(정상·수리 필요)와 동일 불변식.
    // (누락 시, 폐기 취소·반려로 유휴 복귀 때 떠난 보유자가 그대로 남아 유휴 자산이 그 부서에 오귀속된다.)
    asset.owner = '미지정'
    asset.dept = '자산관리팀'
    // 폐기 권고는 폐기 절차로 바로 편입한다 — 폐기 대상 레코드를 만들어야 결재·소거로 이어진다
    // (그동안 상태만 폐기예정으로 바뀌고 폐기 대장에 오르지 않아 소거로 진행할 수 없었다)
    if (!s.disposals.some((d) => d.assetNo === assetNo)) {
      s.disposals.push({ id: nextId('DSP'), assetNo, model: asset.model, reason: `반납 점검 폐기 권고${note.trim() ? ` — ${note.trim()}` : ''}`, status: '대상 선정', prevStatus: '유휴' })
    }
  } else if (condition === '수리 필요') {
    asset.status = '수리중'
    asset.owner = '미지정'
    asset.dept = '자산관리팀'
    asset.location = location
    if (note.trim()) asset.faultNote = note.trim() // 점검 사유를 수리 대기 화면에 노출(장애 신고 증상과 동일 필드)
  } else {
    asset.status = '유휴'
    asset.owner = '미지정'
    asset.dept = '자산관리팀'
    asset.location = location
  }

  asset.history.push({
    date: today(),
    kind: '반납',
    detail: `반납 접수 · 상태 점검 ${condition}${note ? ` — ${note}` : ''} (반납자 ${prevOwner})`,
    actor: session.name,
  })

  // 반납 접수로 자산이 보유자를 떠나 유휴/수리/폐기로 편성되므로 배정 라이선스 좌석을 회수한다(returnLoan·회수·폐기 등 다른 이탈 경로와 동일 불변식).
  // 승인 경로(decide 반납)는 반납대기 진입 시 회수하나, 좌석 보유 상태로 반납대기에 온 자산(시드·반납대기 자산 직접 좌석 배정)이 접수될 때 회수가 없어 좌석이 영구 누수됐다. 멱등이라 이미 회수된 경우 무해.
  const freed = reclaimLicenseSeats(assetNo, session.name, '반납 접수')
  if (freed.length) asset.history.push({ date: today(), kind: '점검', detail: `라이선스 좌석 회수 — ${freed.join(', ')} (반납 접수)`, actor: session.name })

  const next = condition === '폐기 권고' ? '폐기 절차 대상으로 전환'
    : condition === '수리 필요' ? `수리중 편성 — 수리 완료 후 유휴 풀로 (${location})`
    : `유휴 풀 편성 — ${location}`

  // 반납자에게 회수·점검 결과를 통보한다 — 결재 승인(반납 접수 예정)과 별개로, 실물이 실제로 회수·점검됐고
  // 점검 결과(정상·수리 필요·폐기 권고)가 무엇인지 알려 반납자 루프를 닫는다. 특히 파손(수리·폐기)은 반납자에게 중요.
  let notified = false
  if (prevOwner && prevOwner !== '미지정' && prevOwner !== '-') {
    dispatch({ channel: '이메일', to: prevOwner, subject: `반납 접수 완료 — ${asset.assetNo} ${asset.model} · 점검 결과 ${condition}${note.trim() ? ` (${note.trim()})` : ''}`, kind: '반납 접수', ref: asset.assetNo })
    notified = true
  }
  appendAudit({ actor: session.name, action: `반납 접수 (점검 ${condition})${notified ? ' · 반납자 통보' : ''}`, target: assetNo })
  revalidatePath('/', 'layout')

  return { ok: true, message: `${assetNo} 반납 접수 완료 · 점검 ${condition} → ${next}${notified ? ` · 반납자(${prevOwner})에게 결과 통보` : ''}` }
}

/** 반납 일괄 접수 — 팀 오프보딩·사무실 이전 등으로 다수 자산이 반납대기에 몰릴 때 같은 점검 결과·입고 위치로 한 번에 접수한다.
 *  (일괄 회수(recoverManyFromUser)의 짝 — 회수로 반납대기에 쌓인 묶음을 일괄로 점검·편성.) 건별 로직은 receiveReturn 과 동일하고
 *  감사만 일괄로 남긴다. 반납대기 건만 대상(멱등). 점검 결과에 따라 정상→유휴·수리 필요→수리중·폐기 권고→폐기예정(폐기 대장 편입). 자산담당·Admin. */
export async function receiveReturnMany(assetNos: string[], condition: ReturnCondition, location: string, rawNote: string) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return { ok: false, message: '반납 접수 권한이 없습니다.' }
  const s = getStore()
  const note = rawNote.trim()
  const loc = location.trim() || '본사 3F 자산창고'
  const targets = s.assets.filter((a) => assetNos.includes(a.assetNo) && a.status === '반납대기')
  if (targets.length === 0) return { ok: false, message: '반납 접수할 자산이 없습니다 (반납대기 건만 대상).' }
  let notified = 0
  for (const asset of targets) {
    const prevOwner = asset.owner
    if (condition === '폐기 권고') {
      asset.status = '폐기예정'
      asset.owner = '미지정'; asset.dept = '자산관리팀' // 단건 receiveReturn 과 동일 — 반납으로 보유자를 떠났으므로 소유자를 비운다(폐기 취소·반려 시 오귀속 방지)
      if (!s.disposals.some((d) => d.assetNo === asset.assetNo)) {
        s.disposals.push({ id: nextId('DSP'), assetNo: asset.assetNo, model: asset.model, reason: `반납 점검 폐기 권고${note ? ` — ${note}` : ''}`, status: '대상 선정', prevStatus: '유휴' })
      }
    } else if (condition === '수리 필요') {
      asset.status = '수리중'; asset.owner = '미지정'; asset.dept = '자산관리팀'; asset.location = loc
      if (note) asset.faultNote = note
    } else {
      asset.status = '유휴'; asset.owner = '미지정'; asset.dept = '자산관리팀'; asset.location = loc
    }
    asset.history.push({ date: today(), kind: '반납', detail: `반납 접수 · 상태 점검 ${condition}${note ? ` — ${note}` : ''} (반납자 ${prevOwner}) (일괄)`, actor: session.name })
    // 접수 시 배정 라이선스 좌석 회수(단건 receiveReturn 과 동일 불변식) — 좌석 보유 상태로 반납대기에 온 자산의 좌석 누수 방지. 멱등.
    const freed = reclaimLicenseSeats(asset.assetNo, session.name, '반납 접수')
    if (freed.length) asset.history.push({ date: today(), kind: '점검', detail: `라이선스 좌석 회수 — ${freed.join(', ')} (반납 접수)`, actor: session.name })
    if (prevOwner && prevOwner !== '미지정' && prevOwner !== '-') {
      dispatch({ channel: '이메일', to: prevOwner, subject: `반납 접수 완료 — ${asset.assetNo} ${asset.model} · 점검 결과 ${condition}${note ? ` (${note})` : ''}`, kind: '반납 접수', ref: asset.assetNo })
      notified += 1
    }
  }
  appendAudit({ actor: session.name, action: `반납 일괄 접수 (점검 ${condition}, ${targets.length}건)${notified ? ` · 반납자 ${notified}명 통보` : ''}`, target: '반납대기' })
  revalidatePath('/', 'layout')
  const next = condition === '폐기 권고' ? '폐기 절차 대상' : condition === '수리 필요' ? '수리중 편성' : `유휴 풀 편성 (${loc})`
  return { ok: true, message: `${targets.length}건 반납 접수 완료 · 점검 ${condition} → ${next}${notified ? ` · 반납자 ${notified}명 통보` : ''}` }
}

/** 대여 반환 독촉 발송 — 반환 기한이 지났거나(연체) 임박(D-7)한 대여 자산의 대여자에게 반환 요청 통지를 보낸다.
 *  그동안 연체 대여는 대시보드·대여 현황에 드러나기만 하고 대여자에게 통보할 수단이 없었다(계약 만료 알림 loop 13·
 *  필독 미확인 안내 loop 39 와 같은 컴플라이언스 독촉의 대여판). 당일 중복 발송은 차단한다. 자산담당·Admin. */
export async function remindLoans() {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) {
    return { ok: false, message: '대여 독촉 발송 권한이 없습니다 (자산담당·Admin).' }
  }

  // 대상 판정은 화면 버튼 건수와 한 소스(lib/reminders) — 연체·반환 임박 + 당일 발송분 제외.

  let n = 0
  for (const a of loanRemindTargets()) {
    const overdue = isLoanOverdue(a)
    const d = daysUntil(a.loanDueDate ?? '') ?? 0
    dispatch({
      channel: '이메일',
      to: a.owner,
      subject: `${a.assetNo} ${a.model} 반환 ${overdue ? `기한 경과 (${-d}일 연체)` : d === 0 ? '기한 오늘 만기' : `기한 임박 (D-${d})`} — ${a.loanDueDate}까지 반환 요청`,
      kind: '대여 독촉',
      ref: a.assetNo,
    })
    n += 1
  }

  if (n === 0) return { ok: false, message: '독촉 대상 대여가 없습니다 (연체·반환 임박 없음, 오늘 발송분 제외).' }
  appendAudit({ actor: session.name, action: `대여 반환 독촉 발송 (${n}건)`, target: '대여 자산' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `대여 반환 독촉 ${n}건 발송 — 대여자에게 반환 요청 통지 (발송 이력 적재)` }
}

/** 수리 업체 독촉 발송 — 예상 반환일이 지난(지연) 외부 수리 자산의 업체에 반환 독촉 통지를 보낸다.
 *  그동안 수리 지연은 대시보드·수리 현황에 드러나기만 하고 업체에 독촉할 수단이 없었다(대여 반환 독촉의 수리판).
 *  당일 중복 발송은 차단한다. 자산담당·Admin. */
export async function remindRepairs() {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) {
    return { ok: false, message: '수리 독촉 발송 권한이 없습니다 (자산담당·Admin).' }
  }

  // 대상 판정은 화면 버튼 건수와 한 소스(lib/reminders) — 예상 반환 경과·일정 미회신 + 당일 발송분 제외.

  let n = 0
  for (const a of repairRemindTargets()) {
    // 예상 반환일이 지난 건과 아직 일정을 못 받은 건(eta 미기재)을 함께 독촉한다 — 둘 다 이 통보가 요청하는
    //  '반환 일정 회신'의 대상이다. 미기재 건은 경과일을 셀 수 없으므로 문구를 달리한다.
    const etaMissing = isRepairEtaMissing(a)
    if (!a.repair) continue // 타입 좁히기 — 대상 판정(lib/reminders)이 이미 수리 정보 보유를 보장한다
    const over = -(daysUntil(a.repair.eta ?? '') ?? 0)
    dispatch({
      channel: '이메일',
      to: a.repair.vendor,
      subject: etaMissing
        ? `${a.assetNo} ${a.model} 수리 예상 반환일 미회신 (의뢰 ${a.repair.sentAt}) — 반환 일정 회신 요청`
        : `${a.assetNo} ${a.model} 수리 예상 반환 경과 (${over}일 지연) — 진행 상황·반환 일정 회신 요청`,
      kind: '수리 독촉',
      ref: a.assetNo,
    })
    n += 1
  }

  if (n === 0) return { ok: false, message: '독촉 대상 수리가 없습니다 (예상 반환 경과·일정 미회신 없음, 오늘 발송분 제외).' }
  appendAudit({ actor: session.name, action: `수리 업체 독촉 발송 (${n}건)`, target: '수리중 자산' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `수리 업체 독촉 ${n}건 발송 — 수리 업체에 진행·반환 일정 회신 요청 (발송 이력 적재)` }
}

/** 수리 완료 처리 — 수리중 자산을 유휴 풀로 되돌리거나(수리 완료), 수리 불가면 폐기 절차로 보낸다.
 *  (제품안내서 §03 유지보수 — 고장 자산은 수리를 마쳐야 재배치 가능 재고가 된다) */
/** 수리 의뢰 접수 — 수리중 자산의 외부 수리 업체·예상 반환일·견적을 기록한다. 그동안 수리중은 상태 플립뿐이라
 *  누구에게 언제까지 얼마에 맡겼는지 추적할 수 없었다(제품안내서 §03 유지보수). 자산담당·Admin. */
export async function sendToRepair(assetNo: string, rawVendor: string, eta: string, estCost: number) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) {
    return { ok: false, message: '수리 의뢰 권한이 없습니다 (자산담당·Admin).' }
  }
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '수리중') return { ok: false, message: `수리중 자산이 아닙니다 — ${assetNo} (${asset.status})` }
  const vendor = rawVendor.trim()
  if (!vendor) return { ok: false, message: '수리 업체를 입력해 주세요.' }
  if (eta && (!isValidDate(eta) || eta < today())) return { ok: false, message: '예상 반환일을 오늘 이후로 지정해 주세요.' }

  asset.repair = { vendor, sentAt: today(), eta: eta || undefined, estCost: Number.isFinite(estCost) && estCost > 0 ? Math.round(estCost) : undefined }
  asset.history.push({ date: today(), kind: '수리', detail: `수리 의뢰 — ${vendor}${eta ? ` · 예상 반환 ${eta}` : ''}${estCost > 0 ? ` · 견적 ${estCost.toLocaleString()}원` : ''}`, actor: session.name })
  appendAudit({ actor: session.name, action: `수리 의뢰 (${vendor})`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 수리 의뢰 접수 — ${vendor}${eta ? ` · 예상 반환 ${eta}` : ''}` }
}

export async function completeRepair(assetNo: string, outcome: '수리 완료' | '수리 불가', note: string, actualCost = 0, warrantyClaimed = false) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) {
    return { ok: false, message: '수리 처리 권한이 없습니다 (자산담당·Admin).' }
  }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '수리중') {
    return { ok: false, message: `수리중 자산이 아닙니다 — ${assetNo} (${asset.status})` }
  }
  // 무상 보증 청구 — 보증 기간 내(warrantyEnd 미도래) 자산의 수리 완료만 대상. 제조사 보증으로 청구해 자사가 수리비를 부담하지 않는다(비용 회피).
  const underWarranty = asset.warrantyEnd !== '-' && asset.warrantyEnd >= today()
  if (warrantyClaimed && (outcome !== '수리 완료' || !underWarranty)) {
    return { ok: false, message: '무상 보증 청구는 보증 기간 내 자산의 수리 완료만 가능합니다.' }
  }

  // 수리 완료 후 행선지 — 반납 접수분은 소유자를 비우고 수리에 들어와(유휴 풀 편성·재배치), 장애 신고 등
  // 사용 중 자산이 소유자를 유지한 채 수리에 들어온 경우는 원 소유자에게 반환(사용중 복귀)한다. 소유자 유무로 두 진입점을 구분.
  // 통보 대상 — 수리 불가는 아래에서 소유자를 비우므로(이탈), 통보 전에 원 소유자·부서를 먼저 확보한다.
  const priorOwner = asset.owner && asset.owner !== '미지정' && asset.owner !== '-' ? asset.owner : null
  const priorDept = asset.dept
  const stillOwned = outcome === '수리 완료' && !!asset.owner && asset.owner !== '미지정' && asset.owner !== '-'
  asset.status = outcome === '수리 완료' ? (stillOwned ? '사용중' : '유휴') : '폐기예정'
  const cost = Number.isFinite(actualCost) ? Math.max(0, Math.round(actualCost)) : 0 // 비유한(Infinity/NaN) 방어 — repairCosts 합산이 ∞/NaN 로 오염되지 않게(add* 액션과 동일 규약)
  const repairVendor = asset.repair?.vendor ?? '-' // asset.repair 는 아래에서 해제되므로 먼저 캡처
  const repairEta = asset.repair?.eta // 예상 반환일 — 업체 SLA(정시 반환) 판정 근거, 해제 전 캡처
  asset.history.push({
    date: today(),
    kind: '수리',
    detail: warrantyClaimed
      ? `수리 처리 ${outcome} · 무상 보증 청구${repairVendor !== '-' ? ` · ${repairVendor}` : ''}${cost > 0 ? ` — 제조사 부담 ${cost.toLocaleString()}원 · 자사 부담 0원` : ''}${note ? ` (${note})` : ''}`
      : `수리 처리 ${outcome}${asset.repair ? ` · ${asset.repair.vendor}` : ''}${cost > 0 ? ` · 실비 ${cost.toLocaleString()}원` : ''}${note ? ` — ${note}` : ''}`,
    actor: session.name,
  })
  // 실비를 구조적 비용 이력에 누적한다 — 자유 이력 텍스트만으로는 자산 TCO 를 집계할 수 없다(계약 ContractCost 와 대칭).
  // 무상 보증 청구분은 warrantyClaimed 로 표기 — amount 는 제조사 부담(자사 절감)액이며 TCO 에선 제외되고 '보증 절감'으로 집계된다.
  if (cost > 0) {
    asset.repairCosts = [...(asset.repairCosts ?? []), { id: nextId('ARC'), date: today(), vendor: repairVendor, item: note.trim() || (warrantyClaimed ? '무상 보증 청구' : outcome), amount: cost, by: session.name, warrantyClaimed: warrantyClaimed || undefined, onTime: repairEta ? today() <= repairEta : undefined }]
  }
  asset.repair = undefined // 수리 완료·불가로 의뢰 종료
  asset.faultNote = undefined // 수리 사유도 종료 시 해제
  // 수리 불가는 폐기 절차로 이어져야 한다 — 폐기 대상 레코드를 만들어 결재·소거로 진행하게 한다
  // (그동안 상태만 폐기예정으로 바뀌고 폐기 대장에 안 올라 소거로 갈 수 없었다 — v1.68 반납 건과 동일)
  if (outcome === '수리 불가' && !s.disposals.some((d) => d.assetNo === assetNo)) {
    s.disposals.push({ id: nextId('DSP'), assetNo, model: asset.model, reason: `수리 불가 폐기${note.trim() ? ` — ${note.trim()}` : ''}`, status: '대상 선정', prevStatus: '유휴' })
  }
  // 수리 불가 = 보유자 이탈(폐기 절차 진입) — 소유자 정리·좌석 회수를 반납·회수·폐기 등 다른 이탈 경로와 동일하게 수행한다(유휴⇒미지정 규약·로56 좌석 생애주기).
  // 장애 신고분은 사용중 자산이 소유자를 유지한 채 수리에 들어오므로, 여기서 비우지 않으면 폐기 결재 반려 시 유휴 자산이 원 소유자에 오귀속되고 회수 안 된 좌석이 떠난 보유자에 물려 SAM 이 샌다.
  if (outcome === '수리 불가') {
    asset.owner = '미지정'
    asset.dept = '자산관리팀'
    asset.receiptPending = undefined // 보유자 이탈 시 수령 미확인 플래그 해제 — 다른 이탈 경로(반납·회수·폐기·분실)와 동일 홀더-스테이트 정리(소비처가 사용중 게이트라 현재 무해하나 불변식 유지)
    const freed = reclaimLicenseSeats(assetNo, session.name, '수리 불가 폐기')
    if (freed.length) asset.history.push({ date: today(), kind: '점검', detail: `라이선스 좌석 회수 — ${freed.join(', ')} (수리 불가 폐기)`, actor: session.name })
  }
  // 신고자·소유자 통보 — 장애 신고 등 소유자를 유지한 채 수리에 들어온 자산은 결과를 원 소유자에게 알려 루프를 닫는다(반납 접수 통보의 수리판).
  // 반납 접수분은 소유자가 이미 비워져(유휴 풀) 대상이 아니다 — 반납 시점에 이미 반납자에게 결과를 통보했다.
  const notifyOwner = priorOwner // 수리 불가는 위에서 소유자를 비웠으므로 사전 확보한 원 소유자로 통보한다
  if (notifyOwner) {
    dispatch({
      channel: '이메일',
      to: `${notifyOwner} (${priorDept})`,
      subject: outcome === '수리 완료'
        ? `수리 완료 — ${asset.assetNo} ${asset.model} 사용 재개 (반환 완료)`
        : `수리 불가 — ${asset.assetNo} ${asset.model} 폐기 예정, 대체 자산 신청을 안내드립니다`,
      kind: '수리 결과',
      ref: asset.assetNo,
    })
  }
  appendAudit({ actor: session.name, action: `수리 처리 (${outcome})${notifyOwner ? ` · ${notifyOwner} 통보` : ''}`, target: assetNo })
  revalidatePath('/', 'layout')

  const next = outcome === '수리 완료'
    ? (stillOwned ? `원 소유자(${asset.owner}) 반환 — 사용중 복귀` : '유휴 풀 편성 — 재배치 가능')
    : '폐기예정 전환 — 폐기 절차로'
  const claimNote = warrantyClaimed && cost > 0 ? ` · 무상 보증 청구(자사 부담 0 · 절감 ${cost.toLocaleString()}원)` : ''
  return { ok: true, message: `${assetNo} ${outcome} → ${next}${claimNote}` }
}
