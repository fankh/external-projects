'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { approvalAgeDays, isApprovalOverdue, today } from '@/lib/dates'
import { dispatch, escalate } from '@/lib/notify'
import { canDecideApproval } from '@/lib/approval'
import { classifyDiscoveredType } from '@/lib/classify'
import { reclaimLicenseSeats } from '@/lib/license'
import { getSession } from '@/lib/session'
import { getStore, nextApprovalId, nextAssetNo, nextId } from '@/lib/store'
import { approvalRoute, approvalStepLabel } from '@/lib/types'
import type { ApprovalKind, AssetCategory } from '@/lib/types'

/** 신청 상신 — 사용자가 직접 올리는 3종 (자산 신청 / 반납 / 이동).
 *  결재선은 환경설정의 화면별 기본 결재선을 따르며, 다음 단계는 상신자 다음 스텝이 된다.
 *  (제품안내서 §01 권한그룹: 사용자 — 자산 신청·반납·이동 요청 및 결재 상신) */
export async function raiseRequest(input: {
  kind: Extract<ApprovalKind, '자산 신청' | '반납' | '이동' | '대여' | 'SaaS 인가'>
  assetNo?: string
  targetLocation?: string
  loanDueDate?: string
  service?: string
  category?: AssetCategory
  note: string
}) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }

  const note = input.note.trim()
  if (!note) return { ok: false, message: '신청 사유를 입력해 주세요.' }

  const s = getStore()
  let title = ''
  let saasService: string | undefined

  if (input.kind === '자산 신청') {
    title = `자산 신규 지급 신청 — ${note.slice(0, 40)}`
  } else if (input.kind === 'SaaS 인가') {
    // SaaS 인가 요청 — 업무상 필요한 서비스를 카탈로그에 인가·사전 등재 요청한다(공지 NTC-02: 인가 요청을 통해 사전 등재).
    // 전 권한그룹이 상신 가능(대여와 동일). 결재선은 보안담당(SaaS 판정 권한).
    const svc = (input.service ?? '').trim()
    if (!svc) return { ok: false, message: '인가 요청할 SaaS 서비스명을 입력해 주세요.' }
    const existing = s.saas.find((x) => x.service.toLowerCase() === svc.toLowerCase())
    if (existing?.sanctioned) return { ok: false, message: `이미 인가된 서비스입니다 — ${existing.service}` }
    const dup = s.approvals.find((a) => a.status === '대기' && a.kind === 'SaaS 인가' && (a.saasService ?? '').toLowerCase() === svc.toLowerCase())
    if (dup) return { ok: false, message: `이미 인가 요청이 결재 대기 중입니다 — ${dup.id}` }
    saasService = existing?.service ?? svc
    title = `SaaS 인가 요청 — ${saasService}`
  } else if (input.kind === '대여') {
    // 대여는 유휴 재고를 대상으로 한다(본인 소유 무관 — 임시 반출 신청). 승인 시 자동 대여 처리된다.
    const asset = s.assets.find((a) => a.assetNo === input.assetNo)
    if (!asset) return { ok: false, message: '대여할 자산을 선택해 주세요.' }
    if (asset.status !== '유휴') return { ok: false, message: `대여 가능한 상태가 아닙니다 — ${asset.assetNo} (${asset.status}). 유휴 재고만 대여 신청할 수 있습니다.` }
    if (!input.loanDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.loanDueDate) || input.loanDueDate < today()) {
      return { ok: false, message: '반환 기한을 오늘 이후로 지정해 주세요.' }
    }
    const dup = s.approvals.find((a) => a.status === '대기' && a.refId === asset.assetNo && a.kind === '대여')
    if (dup) return { ok: false, message: `이미 대여 신청이 결재 대기 중입니다 — ${dup.id}` }
    title = `${asset.model} 대여 신청 (${asset.assetNo}) — 반환 기한 ${input.loanDueDate}`
  } else {
    // 반납·이동은 본인 명의 자산만 대상으로 한다 (권한 모델: 사용자는 본인 자산 범위)
    const asset = s.assets.find((a) => a.assetNo === input.assetNo)
    if (!asset) return { ok: false, message: '대상 자산을 선택해 주세요.' }
    if (session.role === 'USER' && asset.owner !== session.name) {
      return { ok: false, message: '본인 명의 자산만 신청할 수 있습니다.' }
    }
    if (['폐기예정', '폐기완료'].includes(asset.status)) {
      return { ok: false, message: `폐기 절차 중인 자산입니다 — ${asset.assetNo}` }
    }
    const dup = s.approvals.find(
      (a) => a.status === '대기' && a.refId === asset.assetNo && a.kind === input.kind,
    )
    if (dup) return { ok: false, message: `이미 결재 대기 중인 신청이 있습니다 — ${dup.id}` }

    if (input.kind === '이동') {
      if (!input.targetLocation) return { ok: false, message: '이동할 위치를 선택해 주세요.' }
      if (input.targetLocation === asset.location) {
        return { ok: false, message: '현재 위치와 동일합니다.' }
      }
      title = `${asset.model} 이동 신청 — ${asset.location} → ${input.targetLocation}`
    } else {
      title = `${asset.model} 반납 신청 (${asset.assetNo})`
    }
  }

  // 결재선의 첫 단계는 신청자 본인이므로, 다음 결재 단계를 현재 스텝으로 잡는다
  const line = s.approvalLines.find((l) => l.kind === input.kind)
  const nextStep = line?.steps.find((st) => st !== '신청자') ?? '자산담당'

  const id = nextApprovalId()
  s.approvals.unshift({
    id,
    kind: input.kind,
    title,
    requester: session.name,
    dept: session.dept,
    requestedAt: today(),
    status: '대기',
    currentStep: `${nextStep} 결재`,
    refId: input.assetNo,
    note,
    targetLocation: input.kind === '이동' ? input.targetLocation : undefined,
    loanDueDate: input.kind === '대여' ? input.loanDueDate : undefined,
    desiredCategory: input.kind === '자산 신청' ? input.category : undefined,
    saasService,
    selfSubmitted: true, // 본인이 폼으로 올린 상신 — 직무 분리상 본인 결재 불가(상신 취소만)
  })

  appendAudit({ actor: session.name, action: `${input.kind} 상신`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${id} 상신 완료 — ${nextStep} 결재 대기` }
}

/** 재상신 — 반려된 본인 신청을 사유를 보완해 다시 올린다 (반려 → 수정 → 재상신 폐쇄).
 *  원 신청의 종류·대상·제목을 승계하고, 재상신 사유는 필수로 받아 반려 지적을 반영하게 한다. */
export async function resubmitRequest(approvalId: string, note: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }

  const s = getStore()
  const orig = s.approvals.find((a) => a.id === approvalId)
  if (!orig) return { ok: false, message: '원 신청을 찾을 수 없습니다.' }
  if (orig.status !== '반려') return { ok: false, message: '반려된 신청만 재상신할 수 있습니다.' }
  if (orig.requester !== session.name) return { ok: false, message: '본인 신청만 재상신할 수 있습니다.' }
  if (!['자산 신청', '반납', '이동', '대여', 'SaaS 인가'].includes(orig.kind)) {
    return { ok: false, message: `재상신 대상이 아닌 결재입니다 — ${orig.kind}` }
  }
  const trimmed = note.trim()
  if (!trimmed) return { ok: false, message: '재상신 사유를 입력해 주세요 (반려 지적 반영).' }

  const line = s.approvalLines.find((l) => l.kind === orig.kind)
  const nextStep = line?.steps.find((st) => st !== '신청자') ?? '자산담당'
  const id = nextApprovalId()
  s.approvals.unshift({
    id,
    kind: orig.kind,
    title: orig.title,
    requester: session.name,
    dept: session.dept,
    requestedAt: today(),
    status: '대기',
    currentStep: `${nextStep} 결재`,
    refId: orig.refId,
    note: trimmed,
    targetLocation: orig.targetLocation,
    selfSubmitted: true, // 재상신도 본인 상신 — 직무 분리상 본인 결재 불가
  })
  orig.resubmitted = true // 원 반려 건은 재상신 완료 표시 — 대시보드 재상신 검토 넛지에서 제외
  appendAudit({ actor: session.name, action: `${orig.kind} 재상신 (원 ${orig.id} 반려)`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${id} 재상신 완료 — ${nextStep} 결재 대기` }
}

/** 상신 취소 — 신청자가 본인의 대기 중인 신청을 회수한다 (전자결재 상신 취소).
 *  자산 신청·반납·이동은 상신 시점에 대장을 바꾸지 않으므로(효과는 결재 확정 단계에서만) 되돌릴 상태가 없다.
 *  결재 확정 전에만 가능하며, 취소 이력은 감사 로그에 남는다. */
export async function withdrawRequest(approvalId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }

  const s = getStore()
  const a = s.approvals.find((x) => x.id === approvalId)
  if (!a) return { ok: false, message: '신청 건을 찾을 수 없습니다.' }
  if (a.status !== '대기') return { ok: false, message: `이미 처리된 건입니다 — ${a.id} (${a.status})` }
  if (a.requester !== session.name) return { ok: false, message: '본인이 상신한 건만 취소할 수 있습니다.' }
  if (!['자산 신청', '반납', '이동', '대여', 'SaaS 인가'].includes(a.kind)) {
    return { ok: false, message: `상신 취소 대상이 아닌 결재입니다 — ${a.kind}` }
  }

  a.status = '취소'
  a.currentStep = '취소'
  a.decidedAt = today()
  a.decidedBy = session.name
  appendAudit({ actor: session.name, action: `상신 취소 (${a.kind})`, target: a.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${a.id} 상신을 취소했습니다.` }
}

/** 소유자 확인 응답 — 확인 요청을 받은 부서가 직접 답한다.
 *  '본인 자산'이면 편입 절차로, '아님'이면 미확인 상태로 남아 격리 검토 대상이 된다.
 *  (제품안내서 §01 권한그룹: 사용자 — 소유자 확인 요청 응답) */
export async function answerOwnerConfirm(approvalId: string, mine: boolean) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }

  const s = getStore()
  const a = s.approvals.find((x) => x.id === approvalId)
  if (!a || a.kind !== '소유자 확인' || a.status !== '대기') {
    return { ok: false, message: '응답 대상 확인 요청이 아닙니다.' }
  }
  // 확인 요청을 받은 부서 본인이 답한다. 자산담당·Admin 은 대리 응답 가능.
  const canAnswer = ['ASSET_MGR', 'ADMIN'].includes(session.role) || session.dept === a.dept
  if (!canAnswer) return { ok: false, message: '해당 부서 앞으로 온 확인 요청이 아닙니다.' }

  a.status = mine ? '승인' : '반려'
  a.currentStep = '완료'
  a.decidedAt = today()
  a.decidedBy = session.name

  const d = s.discovered.find((x) => x.id === a.refId)
  if (d) {
    d.ownerAnswer = mine ? '본인 자산' : '본인 자산 아님'
    // 확인만으로 대장에 들어가지는 않는다 — 편입은 별도 등록 결재를 거친다
    d.action = undefined
    if (mine && !d.ownerCandidate) d.ownerCandidate = a.dept
  }

  appendAudit({
    actor: session.name,
    action: `소유자 확인 응답 — ${mine ? '본인 자산' : '본인 자산 아님'}`,
    target: a.refId ?? a.id,
  })
  revalidatePath('/', 'layout')
  return {
    ok: true,
    message: mine
      ? `${a.id} 확인 완료 — 편입 요청을 올릴 수 있습니다.`
      : `${a.id} 미확인 처리 — 격리 검토 대상으로 남습니다.`,
  }
}

/** 결재 처리 — 다단계 결재선 집행.
 *  각 결재는 화면별 기본 결재선(store.approvalLines)의 남은 단계를 순서대로 밟는다.
 *  현재 단계의 역할(APPROVAL_STEP_ROLE)에 해당하는 사람만 처리할 수 있고, ADMIN 은 오버라이드.
 *  중간 단계 승인은 다음 단계로 넘기고, 마지막 단계 승인에서만 효과가 적용된다. 반려는 전체 반려. */
export async function decide(approvalId: string, verdict: '승인' | '반려', reason = '') {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }
  const s = getStore()
  const a = s.approvals.find((x) => x.id === approvalId)
  if (!a || a.status !== '대기') return { ok: false, message: '처리할 결재 건이 아닙니다.' }
  // 직무 분리 — 본인이 폼으로 올린 상신(selfSubmitted)은 본인이 승인·반려할 수 없다(상신 취소를 쓴다).
  // '내 결재 차례' 큐(대시보드·상태바·어시스턴트)는 이미 requester!==나 로 제외하나, 이 서버 액션만 누락돼
  // 단일 단계 결재(대여·반납·이동=자산담당, SaaS 인가=보안담당)에서 상신자가 곧바로 자기 요청을 승인·집행하던 구멍.
  // 시스템·운영자 상신(편입·격리·라이선스 품의)은 selfSubmitted 가 없어 현 단계 담당자가 정상 결재한다.
  if (a.selfSubmitted && a.requester === session.name) {
    return { ok: false, message: '본인이 상신한 결재는 승인·반려할 수 없습니다 (직무 분리 — 상신 취소를 사용하세요).' }
  }
  // 소유자 확인은 결재(decide)가 아니라 요청받은 부서 본인의 '응답'(answerOwnerConfirm)으로 처리한다.
  // decide 로 들어오면 소유자 응답 효과(발견 자산 소유·상태 반영) 없이 단계만 진행돼 상태가 어긋나므로 방어적으로 차단(UI 는 이미 제외).
  if (a.kind === '소유자 확인') return { ok: false, message: '소유자 확인은 결재가 아니라 요청받은 부서의 응답으로 처리합니다.' }

  // 반려는 사유가 필수 — 신청자 재상신 근거이자 감사 기록 (AI 제안 반려와 같은 원칙)
  if (verdict === '반려' && !reason.trim()) {
    return { ok: false, message: '반려 사유를 입력해 주세요 — 신청자에게 전달되고 감사 로그에 남습니다.' }
  }

  // 현재 위치를 결재선에서 찾는다. 매핑되지 않으면(예: 라이선스 품의) 단일 단계로 취급(레거시 안전).
  const line = s.approvalLines.find((l) => l.kind === a.kind)
  const route = approvalRoute(line?.steps ?? [])
  const curLabel = approvalStepLabel(a.currentStep)
  let idx = route.indexOf(curLabel)
  const mapped = idx >= 0
  if (!mapped) idx = route.length - 1

  // 역할 게이트 — 대시보드 '내 결재 대기' 큐와 동일한 판정(canDecideApproval)을 쓴다.
  // 매트릭스는 필요조건일 뿐 — 켜준다고 결재 종류별 규칙을 넘지 못한다.
  if (!canDecideApproval(session.role, a)) {
    return { ok: false, message: `현재 단계(${a.currentStep})를 결재할 권한이 없습니다.` }
  }

  // 중간 단계 승인 — 다음 단계로 진행하고 효과는 아직 적용하지 않는다.
  if (verdict === '승인' && mapped && idx < route.length - 1) {
    const from = route[idx]
    const to = route[idx + 1]
    a.currentStep = `${to} 결재`
    appendAudit({ actor: session.name, action: `결재 단계 승인 — ${from} → ${to} (${idx + 2}/${route.length})`, target: a.id })
    revalidatePath('/', 'layout')
    return { ok: true, message: `${a.id} — ${from} 승인 완료, 다음 단계 ‘${to}’ 결재 대기` }
  }

  // 마지막 단계 승인 또는 반려 — 확정하고 효과를 적용한다.
  a.status = verdict
  a.currentStep = '완료'
  a.decidedAt = today()
  a.decidedBy = session.name
  if (verdict === '반려') a.rejectReason = reason.trim()
  appendAudit({
    actor: session.name,
    action: `${a.kind} ${verdict}${verdict === '반려' ? ` — ${reason.trim()}` : ''}`,
    target: a.id,
  })

  // 결재 결과를 신청자에게 통보한다 — 사용자 상신 종류(자산 신청·반납·이동·대여)만. 그동안 신청자는
  // 결재함을 직접 확인해야 결과를 알 수 있었다(요청자 루프 미폐쇄). 승인/반려 모두 통보하고 발송 이력에 남긴다.
  if (['자산 신청', '반납', '이동', '대여', 'SaaS 인가'].includes(a.kind)) {
    dispatch({
      channel: '이메일',
      to: `${a.requester} (${a.dept})`,
      subject: `[결재 결과] ${a.kind} ${verdict} — ${a.title}${verdict === '반려' && a.rejectReason ? ` (사유: ${a.rejectReason})` : ''}`,
      kind: '결재 결과',
      ref: a.id,
    })
  }

  // 대여 신청 — 승인 시 지정 유휴 자산을 신청자에게 반환 기한과 함께 대여 처리한다(자동 집행).
  //  요청~승인 사이 자산이 빠졌으면(유휴 아님) 집행하지 않고 미집행으로 남긴다.
  if (a.kind === '대여' && a.refId && verdict === '승인') {
    const asset = s.assets.find((x) => x.assetNo === a.refId)
    // 요청~승인 사이 자산이 유휴에서 빠졌거나(불출·대여) 폐기 절차에 들어갔으면 집행하지 않는다(폐기 예정분 대여 방지).
    const assetInDisposal = asset ? s.disposals.some((d) => d.assetNo === asset.assetNo) : false
    if (asset && asset.status === '유휴' && !assetInDisposal) {
      asset.status = '대여중'
      asset.owner = a.requester
      asset.dept = a.dept
      asset.loanDueDate = a.loanDueDate
      asset.history.push({ date: today(), kind: '대여', detail: `대여 신청 승인 — ${a.requester}(${a.dept}) 대여 · 반환 기한 ${a.loanDueDate ?? '-'} (${a.id})`, actor: session.name })
      a.fulfilled = true
    }
  }

  // SaaS 인가 요청 — 승인 시 카탈로그에 인가 반영. 이미 있으면 sanctioned=true, 없으면 신청 부서로 사전 등재(신규 인가 항목).
  //  (공지 NTC-02: 업무상 필요한 서비스는 인가 요청을 통해 사전 등재.) 반려는 미인가 유지.
  if (a.kind === 'SaaS 인가' && a.saasService && verdict === '승인') {
    const svc = a.saasService
    const existing = s.saas.find((x) => x.service.toLowerCase() === svc.toLowerCase())
    if (existing) {
      existing.sanctioned = true
    } else {
      s.saas.push({ id: nextId('SAS'), service: svc, category: '기타', dept: a.dept, users: 1, sanctioned: true, monthlyVisits: 0, risk: '낮음' })
    }
    // 정책 카탈로그(s.saasCatalog)에도 인가 반영 — 사용 현황(s.saas)만 바꾸면 카탈로그는 검토중으로 남아 미판정 큐·화면과 어긋난다(decideSaas 와 동형).
    const cat = s.saasCatalog.find((x) => x.service.toLowerCase() === svc.toLowerCase())
    if (cat) {
      cat.status = '인가'
      cat.decidedAt = today()
      cat.decidedBy = `${session.name} (인가 요청 결재)`
      cat.reviewSince = undefined // 인가 확정 시 검토 접수일 해제 — decideSaasStatus(비검토중 → undefined)와 동일. 안 지우면 인가 항목이 정책 반출에 잔여 검토일을 달고 나가 컴플라이언스 증적이 어긋난다.
    } else {
      s.saasCatalog.push({ id: nextId('CAT'), service: svc, category: '기타', vendor: '-', status: '인가', dataGrade: '일반', owner: a.dept, decidedAt: today(), decidedBy: `${session.name} (인가 요청 결재)` })
    }
    a.fulfilled = true
  }

  // 폐기 결재 — 승인 시 데이터 소거 대기로 전환(소거·증적은 폐기 화면에서 처리). 반려는 "폐기하지 말라"는 결정이므로
  // 자산을 원 상태(prevStatus)로 복원하고 폐기 절차에서 뺀다 — 반려된 자산이 폐기예정 림보에 방치되지 않게 한다.
  if (a.kind === '폐기') {
    const linked = s.disposals.filter((x) => x.approvalId === a.id)
    if (verdict === '승인') {
      for (const d of linked) d.status = '소거 대기'
    } else {
      for (const d of linked) {
        const asset = s.assets.find((x) => x.assetNo === d.assetNo)
        if (asset) {
          const restored = asset.status === '폐기예정' ? (d.prevStatus ?? '유휴') : asset.status
          asset.status = restored
          asset.history.push({ date: today(), kind: '점검', detail: `폐기 반려 — 대상 해제·${restored} 복원 (${a.id})`, actor: session.name })
        }
      }
      s.disposals = s.disposals.filter((x) => x.approvalId !== a.id)
    }
  }

  // 재물조사 차이 조정 — 승인 시 대장을 실사 결과로 보정한다
  if (a.kind === '차이 조정' && a.refId) {
    const diffs = s.surveyDiffs.filter((d) => d.roundId === a.refId && d.status === '조정 상신')
    for (const d of diffs) {
      if (verdict === '반려') { d.status = '미조치'; continue }
      d.status = '조정 완료'
      const asset = s.assets.find((x) => x.assetNo === d.assetNo)
      // 스테일 조정 방어 — 조정 상신 후 자산 상태가 바뀌었으면 실사 스냅샷을 적용하지 않는다(대장 오염 방지). 대장 미등록(신규 편입)은 대상 자산이 없어 예외.
      //  (a) 이탈: 분실·폐기로 대장을 떠남 → 되살리면 분실/폐기 루프와 어긋난다.
      //  (b) 재확인: 상신 후 자산이 다시 능동 보유로 확정됨(수령 대기=재배정·재불출 · 대여중 · 수리중). 스테일 미확인 조정을 적용하면
      //      재배정을 무효화하고 좌석을 회수해 대장·SAM 이 어긋난다(이탈 방어의 반대 방향 — 재확인된 자산을 유휴로 강제).
      const departed = asset && ['분실', '폐기예정', '폐기완료'].includes(asset.status)
      const reConfirmed = asset && (!!asset.receiptPending || ['대여중', '수리중'].includes(asset.status))
      if ((departed || reConfirmed) && d.kind !== '대장 미등록') {
        d.resolution = '미적용'
        asset!.history.push({ date: today(), kind: '점검', detail: `재물조사 차이 조정 미적용 — 상신 후 ${departed ? `${asset!.status} 이탈` : '재확인(능동 보유)'}로 스테일 (${d.kind})`, actor: session.name })
      } else if (d.kind === '위치 불일치' && asset) {
        // 상신 후 대장 위치가 이미 바뀌었으면(이동·실측 보정 등 — 현재 위치 ≠ 실사 기준 대장값) 실사 스냅샷은 스테일. 되돌리면 최신 위치를 덮으므로 미적용.
        if (asset.location !== d.expected) {
          d.resolution = '미적용'
          asset.history.push({ date: today(), kind: '점검', detail: `재물조사 차이 조정 미적용 — 상신 후 위치 변경(현재 ${asset.location} ≠ 실사 기준 ${d.expected})로 스테일`, actor: session.name })
        } else {
          d.resolution = '대장 보정'
          asset.location = d.actual
          asset.history.push({ date: today(), kind: '점검', detail: `재물조사 차이 조정 — 위치 ${d.expected} → ${d.actual}`, actor: session.name })
        }
      } else if (d.kind === '상태 불일치' && asset) {
        // 폐기 절차(대상 선정~소거 대기) 진행 중인 자산을 실사 상태 불일치로 '사용중' 되돌리면, 사용중 자산이 폐기 대상 리스트에 남아
        // 폐기 결재가 selectForDisposal 의 사용중 가드를 우회한다. 폐기 판정이 우선이므로 조정은 미적용(실사가 맞다면 폐기를 별도 취소).
        const inDisposal = s.disposals.some((dp) => dp.assetNo === asset.assetNo && dp.status !== '완료')
        if (inDisposal) {
          d.resolution = '미적용'
          asset.history.push({ date: today(), kind: '점검', detail: `재물조사 차이 조정 미적용 — 폐기 절차 진행 중이라 상태 보정(사용중) 보류 (${d.kind})`, actor: session.name })
        } else {
          d.resolution = '대장 보정'
          asset.status = '사용중'
          asset.history.push({ date: today(), kind: '점검', detail: `재물조사 차이 조정 — 상태 ${d.expected} → 사용중`, actor: session.name })
        }
      } else if (d.kind === '미확인 (실사 없음)' && asset) {
        // 미확인은 즉시 분실 확정이 아니라 보수적으로 유휴 편성(분실 후보) — resolution 도 실제 조치와 일치시킨다(분실 처리가 아님).
        // 유휴 편성은 보유자를 떠나는 이탈이므로 좌석 회수·소유자 정리·수령 대기 해제를 회수(recoverFromUser)와 동일하게 수행한다
        // (로56 좌석 생애주기 · 유휴 ⇒ 미지정 규약 — 사용중이던 자산이 유휴로 가며 좌석을 물고 있으면 SAM 배정 대장·사용량이 샌다).
        d.resolution = '유휴 편성'
        asset.status = '유휴'
        asset.owner = '미지정'
        asset.dept = '자산관리팀'
        asset.receiptPending = undefined
        const freed = reclaimLicenseSeats(asset.assetNo, session.name, '재물조사 미확인 유휴 편성')
        asset.history.push({ date: today(), kind: '점검', detail: `재물조사 미확인 — 분실 후보로 유휴 편성${freed.length ? ` · 라이선스 좌석 ${freed.length}석 회수 (${freed.join(', ')})` : ''}`, actor: session.name })
      } else if (d.kind === '대장 미등록') {
        // 현장에서 라벨만 확인된 미등록 자산을 대장에 실제 편입한다 — 그동안은 resolution 문자열만 남고
        // 실물이 관리 대상으로 들어오지 않아 '신규 등록'이 표시에 그쳤다(발견-미등록 자산이 방치되는 공백).
        // 새 자산번호로 채번·편입하되 상세(유형·사양)는 검수에서 확정하도록 검수중으로 두고, 스캔 라벨은
        // 시리얼·이력에 남겨 추적성을 유지한다. 차이 항목도 새 자산번호로 연결해 리포트·역조회가 실물을 가리킨다.
        const label = d.assetNo
        const newNo = nextAssetNo()
        s.assets.push({
          assetNo: newNo,
          category: '단말',
          model: d.model,
          serial: `LABEL-${label}`,
          status: '검수중',
          owner: '-',
          dept: '자산관리팀',
          location: d.actual !== '-' ? d.actual : '본사 3F 검수실',
          purchaseDate: today(),
          warrantyEnd: '-',
          history: [{ date: today(), kind: '등록', detail: `재물조사 '대장 미등록' 발견 편입 — 현장 라벨 ${label} · 위치 ${d.actual} (검수중, ${a.id})`, actor: session.name }],
        })
        d.assetNo = newNo
        d.resolution = '신규 등록'
      }
    }
    const round = s.inventoryRounds.find((r) => r.id === a.refId)
    if (round && verdict === '승인') round.mismatched = s.surveyDiffs.filter((d) => d.roundId === round.id && d.status !== '조정 완료').length
  }

  // 폐쇄 루프 — 결재 결과를 대장·발견 저장소로 환류
  if (a.refId) {
    // 라이선스 조치 품의 승인 — 초과는 추가 구매로 보유↑, 미사용은 회수로 보유↓ → 보유=사용(대사 적정)
    if (a.kind === '자산 신청' && a.refId.startsWith('LIC-') && verdict === '승인') {
      const lic = s.licenses.find((l) => l.id === a.refId)
      if (lic) lic.purchased = lic.used
      // 라이선스 조치 품의는 물리 자산 불출 대상이 아니다 — 승인 즉시 집행 완료로 표시해
      // 불출 대기 큐(movement·returns·대시보드 issueDue, 모두 !fulfilled 기준)로 새지 않게 한다.
      a.fulfilled = true
    }
    const d = s.discovered.find((x) => x.id === a.refId)
    if (d && verdict === '승인') {
      if (a.kind === '자산 신청' && d.action === '편입요청') {
        d.action = '편입완료'
        // 편입으로 대장에 들어갔으니 대사 상태를 닫는다 — 발견 레코드가 새 대장 자산과 연결(matchedAssetNo)되고
        // 상태가 '등록·일치'로 전환돼야 CMDB 대사(발견↔등록 차이 가시화)에서 미등록으로 계속 잡히지 않는다.
        const newNo = nextAssetNo()
        d.matchedAssetNo = newNo
        d.state = '등록·일치'
        // 편입 시 발견 이력(채널·일시)이 자산 이력에 승계된다
        s.assets.push({
          assetNo: newNo,
          // 자동분류 — AI 자동분류 제안이 담당자 판정으로 확정된 유형이 있으면 그것을(§05 기능01 판정→조치 승계),
          // 없으면 발견 유형 문자열을 표준 유형으로 매핑(발견 화면 제안값과 동일 함수라 화면·대장 일치).
          category: d.classifiedCategory ?? classifyDiscoveredType(d.type),
          model: d.type,
          serial: `SN-${newNo.slice(-6)}`, // 유일한 자산번호에서 파생(발견 id 4자리는 월이 다르면 충돌) — 시드 mk() 규약과 동일
          status: '사용중',
          owner: d.ownerCandidate?.split(' ')[0] ?? '미지정',
          dept: d.ownerCandidate?.split(' ')[0] ?? '미지정',
          location: '실사 확인 필요',
          ip: d.ip !== '-' ? d.ip : undefined,
          mac: d.mac !== '-' ? d.mac : undefined,
          purchaseDate: d.firstSeen,
          warrantyEnd: '-',
          discoveredVia: d.channel,
          history: [
            { date: today(), kind: '편입', detail: `${d.channel} 발견(${d.firstSeen}) → 소유자 확인 → 결재 편입`, actor: session.name },
          ],
        })
      }
      if (a.kind === '격리 요청' && d.action === '격리요청') {
        d.action = '격리완료'
        // 격리 결재 승인 = NAC 차단 집행 시점 — 이메일 상세 + 문자 즉시 알림으로 야간·현장 지연 없이 차단한다
        escalate({ to: '보안운영팀 · NAC', subject: `NAC 격리 집행 — ${d.hostname} (${d.ip}) 결재 승인, 네트워크 차단 요청`, kind: '격리 통보', ref: d.id, sms: `NAC 격리 집행 ${d.hostname} (${d.ip}) — 즉시 차단` })
      }
    }
    if (d && verdict === '반려') d.action = undefined
    const asset = s.assets.find((x) => x.assetNo === a.refId)
    if (asset && verdict === '승인') {
      // 대장 관리 자산 격리 요청(AI 이상탐지) 최종 승인 = NAC 차단 집행 — 발견 자산 격리(d.action='격리완료')의 대장 자산 대응.
      // 상태는 유지한 채 네트워크만 격리하고, 이메일 상세 + 문자로 즉시 차단을 알린다.
      if (a.kind === '격리 요청' && !asset.quarantinedAt) {
        asset.quarantinedAt = today()
        asset.history.push({ date: today(), kind: '점검', detail: `NAC 격리 집행 — AI 이상행위 탐지 결재 승인, 네트워크 차단 (${a.id})`, actor: session.name })
        escalate({ to: '보안운영팀 · NAC', subject: `NAC 격리 집행 — ${asset.assetNo} (${asset.model}) 결재 승인, 네트워크 차단 요청`, kind: '격리 통보', ref: asset.assetNo, sms: `NAC 격리 집행 ${asset.assetNo} — 즉시 차단` })
      }
      // 반납 승인은 '반납대기'까지만 — 실물 회수와 상태 점검을 거쳐야 유휴 풀에 들어간다
      // (제품안내서 §03 PHASE 4: 반납 접수 · 상태 점검 → 유휴 자산 풀)
      if (a.kind === '반납') {
        asset.status = '반납대기'
        asset.history.push({ date: today(), kind: '반납', detail: '반납 결재 승인 · 회수 접수 대기', actor: session.name })
        // 반납으로 자산이 보유자를 떠나면 배정 라이선스 좌석을 회수한다(로56 좌석 생애주기) — 담당자 회수·폐기와 같은 처리. 여유석 복귀.
        const freed = reclaimLicenseSeats(asset.assetNo, session.name, '반납')
        if (freed.length) asset.history.push({ date: today(), kind: '점검', detail: `라이선스 좌석 회수 — ${freed.join(', ')} (반납)`, actor: session.name })
        asset.receiptPending = undefined // 미확인 수령 대기 해제 — 반납된 자산은 인수 대기 대상이 아니다
      }
      if (a.kind === '폐기') {
        asset.history.push({ date: today(), kind: '폐기', detail: '폐기 결재 승인 · 데이터 소거 대기', actor: session.name })
      }
    }
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: `${a.id} ${verdict} 처리 완료 (${session.name})` }
}

/** 결재 일괄 승인 — '내 결재 차례'의 다건을 한 번에 승인 처리한다(반려는 개별 사유가 필요해 제외).
 *  각 건은 decide() 를 그대로 거쳐 역할 게이트·다단계 진행·효과 적용이 개별 검증된다 — 일괄이라고 규칙을 우회하지 않는다.
 *  자산 일괄 폐기 선정(v1.54)·발견 일괄 편입(v1.60)과 같은 배치 처리 패턴. 승인 권한이 없는 건은 건너뛴다. */
export async function decideMany(ids: string[]) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, message: '선택된 결재 건이 없습니다.' }
  const s = getStore()
  let done = 0
  let skipped = 0
  for (const id of ids) {
    // 소유자 확인은 결재가 아니라 응답(answerOwnerConfirm)이라 일괄 승인 대상에서 제외한다(방어적)
    const a = s.approvals.find((x) => x.id === id)
    if (!a || a.kind === '소유자 확인') { skipped++; continue }
    const r = await decide(id, '승인')
    if (r.ok) done++
    else skipped++
  }
  return { ok: done > 0, message: `${done}건 결재 처리 완료${skipped > 0 ? ` · ${skipped}건 건너뜀 (권한·상태)` : ''}` }
}

/** 결재 일괄 반려 — 중복·무효·예산 동결 등으로 한꺼번에 반려할 대기 결재를 같은 사유로 일괄 반려한다(일괄 승인의 반대편).
 *  반려는 전체 반려(1회로 종결)이며 사유가 필수다. 소유자 확인(결재 아님)과 현재 단계 권한 밖·처리된 건은 건너뛴다. */
export async function rejectMany(ids: string[], rawReason: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, message: '선택된 결재 건이 없습니다.' }
  const reason = rawReason.trim()
  if (!reason) return { ok: false, message: '일괄 반려 사유를 입력하세요 (반려는 사유가 필수입니다).' }
  const s = getStore()
  let done = 0
  let skipped = 0
  for (const id of ids) {
    const a = s.approvals.find((x) => x.id === id)
    if (!a || a.kind === '소유자 확인') { skipped++; continue }
    const r = await decide(id, '반려', reason)
    if (r.ok) done++
    else skipped++
  }
  return { ok: done > 0, message: `${done}건 반려 처리 완료${skipped > 0 ? ` · ${skipped}건 건너뜀 (권한·상태)` : ''}` }
}

/** 결재 독촉 발송 — SLA(운영 정책 approvalSlaDays) 초과한 대기 결재의 현재 단계 결재자에게 처리 독촉 통지를 보낸다.
 *  그동안 지연 결재는 대시보드·결재함에 '지연'으로 드러나기만 하고 결재자에게 처리를 촉구할 수단이 없었다
 *  (대여 반환 독촉·필독 미확인 안내와 같은 컴플라이언스 독촉의 결재판). 당일 중복 발송 차단. 비사용자. */
export async function remindOverdueApprovals() {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '결재 독촉 발송 권한이 없습니다.' }
  const s = getStore()
  const t = today()
  const slaDays = s.opsPolicy.approvalSlaDays
  const sentToday = new Set(
    s.dispatches.filter((m) => m.kind === '결재 독촉' && m.at.startsWith(t)).map((m) => m.ref),
  )
  let n = 0
  for (const a of s.approvals) {
    if (!isApprovalOverdue(a, t, slaDays) || sentToday.has(a.id)) continue
    dispatch({
      channel: '이메일',
      to: a.currentStep,
      subject: `${a.id} ${a.kind} 결재 지연 (${approvalAgeDays(a.requestedAt, t)}일 · SLA ${slaDays}일 초과) — ${a.title} 처리 요청`,
      kind: '결재 독촉',
      ref: a.id,
    })
    n += 1
  }
  if (n === 0) return { ok: false, message: `SLA(${slaDays}일) 초과 대기 결재가 없습니다 (오늘 발송분 제외).` }
  appendAudit({ actor: session.name, action: `결재 독촉 발송 (${n}건)`, target: '대기 결재' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `결재 독촉 ${n}건 발송 — 현재 단계 결재자에게 처리 요청 (발송 이력 적재)` }
}
