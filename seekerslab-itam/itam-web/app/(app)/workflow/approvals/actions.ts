'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { can } from '@/lib/perm'
import { getSession } from '@/lib/session'
import { getStore, nextApprovalId } from '@/lib/store'
import { APPROVAL_STEP_ROLE, approvalRoute, approvalStepLabel } from '@/lib/types'
import type { ApprovalKind } from '@/lib/types'

/** 신청 상신 — 사용자가 직접 올리는 3종 (자산 신청 / 반납 / 이동).
 *  결재선은 환경설정의 화면별 기본 결재선을 따르며, 다음 단계는 상신자 다음 스텝이 된다.
 *  (제품안내서 §01 권한그룹: 사용자 — 자산 신청·반납·이동 요청 및 결재 상신) */
export async function raiseRequest(input: {
  kind: Extract<ApprovalKind, '자산 신청' | '반납' | '이동'>
  assetNo?: string
  targetLocation?: string
  note: string
}) {
  const session = await getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }

  const note = input.note.trim()
  if (!note) return { ok: false, message: '신청 사유를 입력해 주세요.' }

  const s = getStore()
  let title = ''

  if (input.kind === '자산 신청') {
    title = `자산 신규 지급 신청 — ${note.slice(0, 40)}`
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
  })

  appendAudit({ actor: session.name, action: `${input.kind} 상신`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${id} 상신 완료 — ${nextStep} 결재 대기` }
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
  const stepRole = mapped ? APPROVAL_STEP_ROLE[route[idx]] : undefined

  // 역할 게이트 — ADMIN 오버라이드, 매핑되면 그 단계 역할, 아니면 레거시(격리=보안담당·그 외=자산담당).
  // 매트릭스는 필요조건일 뿐 — 켜준다고 결재 종류별 규칙을 넘지 못한다.
  const legacyByKind = a.kind === '격리 요청' ? session.role === 'SEC_MGR' : session.role === 'ASSET_MGR'
  const roleOk = session.role === 'ADMIN' || (stepRole ? session.role === stepRole : legacyByKind)
  if (!roleOk || !can('신청 · 결재', '결재', session.role)) {
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

  // 폐기 결재 — 승인 시 데이터 소거 대기로 전환 (소거·증적은 폐기 화면에서 처리)
  if (a.kind === '폐기') {
    for (const d of s.disposals.filter((x) => x.approvalId === a.id)) {
      d.status = verdict === '승인' ? '소거 대기' : '대상 선정'
      if (verdict === '반려') d.approvalId = undefined
    }
  }

  // 재물조사 차이 조정 — 승인 시 대장을 실사 결과로 보정한다
  if (a.kind === '차이 조정' && a.refId) {
    const diffs = s.surveyDiffs.filter((d) => d.roundId === a.refId && d.status === '조정 상신')
    for (const d of diffs) {
      if (verdict === '반려') { d.status = '미조치'; continue }
      d.status = '조정 완료'
      const asset = s.assets.find((x) => x.assetNo === d.assetNo)
      if (d.kind === '위치 불일치' && asset) {
        d.resolution = '대장 보정'
        asset.location = d.actual
        asset.history.push({ date: today(), kind: '점검', detail: `재물조사 차이 조정 — 위치 ${d.expected} → ${d.actual}`, actor: session.name })
      } else if (d.kind === '상태 불일치' && asset) {
        d.resolution = '대장 보정'
        asset.status = '사용중'
        asset.history.push({ date: today(), kind: '점검', detail: `재물조사 차이 조정 — 상태 ${d.expected} → 사용중`, actor: session.name })
      } else if (d.kind === '미확인 (실사 없음)' && asset) {
        d.resolution = '분실 처리'
        asset.status = '유휴'
        asset.history.push({ date: today(), kind: '점검', detail: '재물조사 미확인 — 분실 후보로 유휴 편성', actor: session.name })
      } else if (d.kind === '대장 미등록') {
        d.resolution = '신규 등록'
      }
    }
    const round = s.inventoryRounds.find((r) => r.id === a.refId)
    if (round && verdict === '승인') round.mismatched = s.surveyDiffs.filter((d) => d.roundId === round.id && d.status !== '조정 완료').length
  }

  // 폐쇄 루프 — 결재 결과를 대장·발견 저장소로 환류
  if (a.refId) {
    const d = s.discovered.find((x) => x.id === a.refId)
    if (d && verdict === '승인') {
      if (a.kind === '자산 신청' && d.action === '편입요청') {
        d.action = '편입완료'
        // 편입 시 발견 이력(채널·일시)이 자산 이력에 승계된다
        s.assets.push({
          assetNo: `AST-2026-${String(700 + s.assets.length)}`,
          category: d.type.includes('서버') ? '서버' : d.type.includes('네트워크') ? '네트워크' : d.type.includes('VM') || d.type.includes('EC2') || d.type.includes('Azure') ? '가상자원' : '단말',
          model: d.type,
          serial: `SN-${d.id.slice(-4)}`,
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
      if (a.kind === '격리 요청' && d.action === '격리요청') d.action = '격리완료'
    }
    if (d && verdict === '반려') d.action = undefined
    const asset = s.assets.find((x) => x.assetNo === a.refId)
    if (asset && verdict === '승인') {
      // 반납 승인은 '반납대기'까지만 — 실물 회수와 상태 점검을 거쳐야 유휴 풀에 들어간다
      // (제품안내서 §03 PHASE 4: 반납 접수 · 상태 점검 → 유휴 자산 풀)
      if (a.kind === '반납') {
        asset.status = '반납대기'
        asset.history.push({ date: today(), kind: '반납', detail: '반납 결재 승인 · 회수 접수 대기', actor: session.name })
      }
      if (a.kind === '폐기') {
        asset.history.push({ date: today(), kind: '폐기', detail: '폐기 결재 승인 · 데이터 소거 대기', actor: session.name })
      }
    }
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: `${a.id} ${verdict} 처리 완료 (${session.name})` }
}
