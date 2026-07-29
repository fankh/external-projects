'use server'
import { revalidatePath } from 'next/cache'
import { TODAY } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'

/** 결재 처리 — 권한그룹별: 격리 요청은 보안담당, 그 외는 자산담당/Admin */
export async function decide(approvalId: string, verdict: '승인' | '반려') {
  const session = await getSession()
  if (!session) return
  const s = getStore()
  const a = s.approvals.find((x) => x.id === approvalId)
  if (!a || a.status !== '대기') return

  const canDecide =
    session.role === 'ADMIN' ||
    (a.kind === '격리 요청' ? session.role === 'SEC_MGR' : session.role === 'ASSET_MGR')
  if (!canDecide) return

  a.status = verdict
  a.currentStep = '완료'
  a.decidedAt = TODAY
  a.decidedBy = session.name

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
        asset.history.push({ date: TODAY, kind: '점검', detail: `재물조사 차이 조정 — 위치 ${d.expected} → ${d.actual}`, actor: session.name })
      } else if (d.kind === '상태 불일치' && asset) {
        d.resolution = '대장 보정'
        asset.status = '사용중'
        asset.history.push({ date: TODAY, kind: '점검', detail: `재물조사 차이 조정 — 상태 ${d.expected} → 사용중`, actor: session.name })
      } else if (d.kind === '미확인 (실사 없음)' && asset) {
        d.resolution = '분실 처리'
        asset.status = '유휴'
        asset.history.push({ date: TODAY, kind: '점검', detail: '재물조사 미확인 — 분실 후보로 유휴 편성', actor: session.name })
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
            { date: TODAY, kind: '편입', detail: `${d.channel} 발견(${d.firstSeen}) → 소유자 확인 → 결재 편입`, actor: session.name },
          ],
        })
      }
      if (a.kind === '격리 요청' && d.action === '격리요청') d.action = '격리완료'
    }
    if (d && verdict === '반려') d.action = undefined
    const asset = s.assets.find((x) => x.assetNo === a.refId)
    if (asset && verdict === '승인') {
      if (a.kind === '반납') {
        asset.status = '유휴'
        asset.history.push({ date: TODAY, kind: '반납', detail: '반납 결재 승인 · 유휴 재고 편성', actor: session.name })
      }
      if (a.kind === '폐기') {
        asset.status = '폐기완료'
        asset.history.push({ date: TODAY, kind: '폐기', detail: '폐기 결재 승인 · 데이터 소거 진행', actor: session.name })
      }
    }
  }
  revalidatePath('/', 'layout')
}
