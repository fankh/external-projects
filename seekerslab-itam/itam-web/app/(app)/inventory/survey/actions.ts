'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { nowMinute, today } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore, nextApprovalId, nextId } from '@/lib/store'
import type { SurveyDiffKind } from '@/lib/types'

/** 스캔 시각 — 표준시 처리는 lib/dates 에 위임한다 (프로세스 TZ 에 의존하지 않도록) */
const stamp = nowMinute

/** 바코드/QR 스캔 실사 — 스캐너는 HID 키보드로 동작하므로 코드 입력 + Enter가 실제 조작과 동일하다.
 *  대장과 대조해 위치·상태 차이를 즉시 판정하고, 대장에 없는 코드는 미등록으로 기록한다. */
export async function scanAsset(roundId: string, rawCode: string, location: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '실사 권한이 없습니다.' }

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

  revalidatePath('/', 'layout')
  return { ok: true, result, message }
}

/** 차이 조정 결재 상신 — 필수 결재 (결재선: 자산담당 → IT기획팀장) */
export async function raiseAdjustment(roundId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return
  const s = getStore()
  const pending = s.surveyDiffs.filter((d) => d.roundId === roundId && d.status === '미조치')
  if (pending.length === 0) return

  const round = s.inventoryRounds.find((r) => r.id === roundId)
  const aprId = nextApprovalId()
  s.approvals.unshift({
    id: aprId,
    kind: '차이 조정',
    title: `${round?.name ?? roundId} 차이 ${pending.length}건 조정`,
    requester: session.name,
    dept: session.dept,
    requestedAt: today(),
    status: '대기',
    currentStep: 'IT기획팀장 결재',
    refId: roundId,
  })
  for (const d of pending) d.status = '조정 상신'

  appendAudit({ actor: session.name, action: `재물조사 차이 조정 상신 (${pending.length}건)`, target: roundId })
  revalidatePath('/', 'layout')
}

/** 조사 회차 완료 처리 — 미해결 차이(미조치·조정 상신)가 남아 있으면 마감할 수 없다.
 *  실사와 차이 조정이 모두 끝나야 회차를 닫는다(제품안내서 §03 재물조사 마감). */
export async function completeRound(roundId: string) {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) {
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

  round.status = '완료'
  appendAudit({ actor: session.name, action: `재물조사 완료 (스캔 ${round.scanned}/${round.planned})`, target: roundId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${round.name} 완료 — 스캔 ${round.scanned}/${round.planned}건, 차이 전건 조정 완료` }
}
