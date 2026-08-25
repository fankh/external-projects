'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { nowMinute, today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { createReport } from '@/lib/reports'
import { getSession } from '@/lib/session'
import { getStore, nextApprovalId, nextId } from '@/lib/store'
import { can } from '@/lib/perm'
import { GONE_STATUSES } from '@/lib/types'
import type { SurveyDiffKind } from '@/lib/types'

/** 스캔 시각 — 표준시 처리는 lib/dates 에 위임한다 (프로세스 TZ 에 의존하지 않도록) */
const stamp = nowMinute

/** 바코드/QR 스캔 실사 — 스캐너는 HID 키보드로 동작하므로 코드 입력 + Enter가 실제 조작과 동일하다.
 *  대장과 대조해 위치·상태 차이를 즉시 판정하고, 대장에 없는 코드는 미등록으로 기록한다. */
export async function scanAsset(roundId: string, rawCode: string, location: string) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('재고 · 재물조사', '저장', session.role))) return { ok: false, message: '실사 권한이 없습니다.' }

  const code = rawCode.trim().toUpperCase()
  if (!code) return { ok: false, message: '코드가 비어 있습니다.' }

  const s = getStore()
  const round = s.inventoryRounds.find((r) => r.id === roundId)
  if (!round || round.status === '완료') return { ok: false, message: '진행 중인 조사 회차가 아닙니다.' }

  if (s.surveyScans.some((x) => x.roundId === roundId && x.code === code)) {
    return { ok: false, message: `이미 스캔된 코드입니다 — ${code}` }
  }

  const asset = s.assets.find((a) => a.assetNo === code)
  const id = nextId('SCN')
  let result: '일치' | '차이' | '대장 미등록' = '일치'
  let message = ''
  let diffKind: SurveyDiffKind | null = null
  let expected = '-'

  if (!asset) {
    result = '대장 미등록'
    diffKind = '대장 미등록'
    message = `대장에 없는 자산입니다 — 신규 등록 대상 (${code})`
  } else if (asset.location !== location) {
    result = '차이'
    diffKind = '위치 불일치'
    expected = asset.location
    message = `위치 불일치 — 대장 ${asset.location} / 실사 ${location}`
  } else if (['유휴', '반납대기'].includes(asset.status) && location !== '본사 3F 자산창고') {
    result = '차이'
    diffKind = '상태 불일치'
    expected = `${asset.status} (창고 보관)`
    message = `상태 불일치 — 대장 ${asset.status}이나 현장에서 확인됨`
  } else {
    message = `일치 확인 — ${asset.model} (${asset.owner})`
  }

  s.surveyScans.unshift({
    id, roundId, code, assetNo: asset?.assetNo, scannedAt: stamp(), location, by: session.name, result,
  })
  round.scanned += 1

  // 라벨을 스캔했다는 것은 실물을 확인했다는 것 — 위치 불일치(차이)여도 최근 실측일을 갱신하고
  // 대장 이력에 실측 확인을 남긴다. 이로써 '장기 미실측'(유령 자산) 판정이 실사 데이터에 근거하게 된다.
  if (asset) {
    asset.lastVerifiedAt = today()
    asset.history.push({ date: today(), kind: '점검', detail: `재물조사 실측 확인 — ${round.name} (${result})`, actor: session.name })
  }

  if (diffKind) {
    s.surveyDiffs.push({
      id: nextId('DIF'),
      roundId,
      kind: diffKind,
      assetNo: code,
      model: asset?.model ?? '미상 (라벨만 확인)',
      expected,
      actual: diffKind === '위치 불일치' || diffKind === '대장 미등록' ? location : '현장 확인',
      status: '미조치',
    })
    round.mismatched += 1
  }

  // 감사 추적 — 실측 스캔은 최근 실측일 갱신(장기 미실측 판정 근거)·차이 레코드 생성을 남기므로 중앙 감사 로그에 적재한다
  // (§07 감사 추적성 · Discovery runScan·형제 조정 액션과 동형. 그동안 스캔은 surveyScans·자산 이력에만 남고 감사 로그엔 빠져 있었다).
  appendAudit({ actor: session.name, action: `재물조사 실측 스캔 — ${round.name} · ${code} (${result}${diffKind ? ` · ${diffKind}` : ''})`, target: asset?.assetNo ?? code })
  revalidatePath('/', 'layout')
  return { ok: true, result, message }
}

/** 차이 조정 결재 상신 — 필수 결재 (결재선: 자산담당 → IT기획팀장) */
export async function raiseAdjustment(roundId: string) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('재고 · 재물조사', '저장', session.role))) return { ok: false, message: '차이 조정 상신 권한이 없습니다 (자산담당·Admin).' }
  const s = getStore()
  const pending = s.surveyDiffs.filter((d) => d.roundId === roundId && d.status === '미조치')
  // 사유 없이 끝내지 않는다 — 이미 상신했거나 다른 화면이 조정을 끝냈으면 버튼이 무반응이 된다.
  if (pending.length === 0) return { ok: false, message: '조정 상신할 미조치 차이가 없습니다.' }

  const round = s.inventoryRounds.find((r) => r.id === roundId)
  // 필수 결재선(AL-07 차이 조정: 자산담당 → IT기획팀장)의 첫 결재 단계에서 시작한다 — 폐기·격리와 동형(마지막 단계 하드코딩 제거).
  const line = s.approvalLines.find((l) => l.kind === '차이 조정')
  const firstStep = line?.steps.find((st) => st !== '신청자' && st !== 'Discovery 엔진') ?? '자산담당'
  const aprId = nextApprovalId()
  s.approvals.unshift({
    id: aprId,
    kind: '차이 조정',
    title: `${round?.name ?? roundId} 차이 ${pending.length}건 조정`,
    requester: session.name,
    dept: session.dept,
    requestedAt: today(),
    status: '대기',
    currentStep: `${firstStep} 검토`,
    refId: roundId,
  })
  for (const d of pending) d.status = '조정 상신'

  appendAudit({ actor: session.name, action: `재물조사 차이 조정 상신 (${pending.length}건)`, target: roundId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `차이 ${pending.length}건 조정 상신 — 결재함에서 진행 상태를 확인하세요.` }
}

/** 조사 회차 완료 처리 — 미해결 차이(미조치·조정 상신)가 남아 있으면 마감할 수 없다.
 *  실사와 차이 조정이 모두 끝나야 회차를 닫는다(제품안내서 §03 재물조사 마감). */
export async function completeRound(roundId: string) {
  const session = await getSession()
  if (!session || (!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('재고 · 재물조사', '저장', session.role))) {
    return { ok: false, message: '조사 완료 권한이 없습니다 (자산담당·Admin).' }
  }
  const s = getStore()
  const round = s.inventoryRounds.find((r) => r.id === roundId)
  if (!round) return { ok: false, message: '조사 회차를 찾을 수 없습니다.' }
  if (round.status !== '진행중') return { ok: false, message: `진행 중인 회차가 아닙니다 (${round.status}).` }

  const open = s.surveyDiffs.filter((d) => d.roundId === roundId && d.status !== '조정 완료')
  if (open.length > 0) {
    return { ok: false, message: `미해결 차이 ${open.length}건이 남아 있어 완료할 수 없습니다 — 조정 결재까지 마쳐야 합니다.` }
  }

  // 미실사 대상 마감 가드(§03 재물조사 완결성) — 회차 대상 중 아직 실사되지 않고 이탈 처리(분실·폐기)도 안 된 대장 자산이 남으면
  // 마감할 수 없다. 실사 스캔하거나 분실 신고(미실사 남은 대상 카드)로 처리해야 회차가 전 대상을 실제로 계상하고 종결된다.
  const scanned = new Set(s.surveyScans.filter((x) => x.roundId === roundId).map((x) => x.assetNo).filter(Boolean))
  const unaccounted = (round.targets ?? []).filter((no) => {
    if (scanned.has(no)) return false
    const a = s.assets.find((x) => x.assetNo === no)
    // 손 떠난 자산 판정은 lib/types 한 곳에서 온다 — 여기에 상태 목록을 다시 적으면 상태가 늘 때
    //  마감 가드만 옛 목록을 보고 새 상태 자산을 미실사로 잡아, 회차를 영원히 닫지 못하게 된다.
    return a !== undefined && !GONE_STATUSES.includes(a.status)
  })
  if (unaccounted.length > 0) {
    return { ok: false, message: `미실사 대상 ${unaccounted.length}건이 남아 있어 마감할 수 없습니다 — 실사 스캔 또는 분실 신고로 처리하세요.` }
  }

  round.status = '완료'

  // 완료 즉시 '재물조사 결과 요약' 리포트를 산출해 담당·주관 부서에 배포한다 —
  // 실사 종료가 종결 표시로 끝나지 않고 결과 보고서(증적)로 남는다. (그동안 리포트는 스케줄·수동 생성뿐이었다.)
  const reportId = await createReport('재물조사 결과 요약', session.name)
  dispatch({ channel: '이메일', to: `${round.assignee} · IT기획팀`, subject: `${round.name} 완료 — 재물조사 결과 요약 리포트 배포 (${reportId})`, kind: '리포트 배포', ref: reportId })

  appendAudit({ actor: session.name, action: `재물조사 완료 (스캔 ${round.scanned}/${round.planned}) · 결과 요약 리포트 ${reportId} 배포`, target: roundId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${round.name} 완료 — 스캔 ${round.scanned}/${round.planned}건, 차이 전건 조정 완료 · 결과 요약 리포트 ${reportId} 자동 배포` }
}
