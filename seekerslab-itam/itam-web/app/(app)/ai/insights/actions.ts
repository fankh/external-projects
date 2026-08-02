'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { raiseLicenseApproval } from '@/lib/license'
import { createReport } from '@/lib/reports'
import { getSession } from '@/lib/session'
import { getStore, nextApprovalId, nextId } from '@/lib/store'

/** AI 제안 판정 — 담당자 확인·결재를 거쳐야 제안이 조치로 이어진다.
 *  승인·반려 결과는 그대로 남아 재학습 신호(채택률·오탐 유형)로 집계된다.
 *  (제품안내서 §05 그림 4: 제안 → 담당자 확인·결재 → 대장 반영·조치 → 판정 결과 환류) */
export async function decideInsight(insightId: string, verdict: '승인' | '반려', reason: string) {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '제안 판정 권한이 없습니다.' }
  }

  const s = getStore()
  const ins = s.insights.find((i) => i.id === insightId)
  if (!ins) return { ok: false, message: '제안을 찾을 수 없습니다.' }
  if (ins.status !== '제안') return { ok: false, message: `이미 판정된 제안입니다 — ${ins.id} (${ins.status})` }

  if (verdict === '반려' && !reason.trim()) {
    return { ok: false, message: '반려 사유를 입력해 주세요 — 재학습 신호로 쓰입니다.' }
  }

  ins.status = verdict
  ins.decidedAt = today()
  ins.decidedBy = session.name

  if (verdict === '반려') {
    ins.rejectReason = reason.trim()
    appendAudit({ actor: session.name, action: `AI 제안 반려 (${ins.kind})`, target: ins.id })
    revalidatePath('/', 'layout')
    return { ok: true, message: `${ins.id} 반려 — 오탐 사유가 재학습 신호로 기록되었습니다.` }
  }

  // 승인은 판정에 그치지 않고 조치로 이어져야 한다. 이상탐지는 격리 요청 결재를,
  // 라이선스 최적화는 대상 라이선스의 추가 구매·회수 결재를 자동 상신하고,
  // 수명예측은 교체 대상·예산을 담은 연간 교체 계획 리포트를 생성한다.
  let action = '판정 기록 — 담당 조치 대상으로 등록'
  if (ins.kind === '수명예측') {
    // 교체 수요 예측 승인 → 근거 데이터(교체 대상·유형별 예산)를 담은 리포트 산출
    const id = await createReport('연간 교체 계획', session.name)
    action = `연간 교체 계획 리포트 생성 — ${id}`
  } else if (ins.kind === '라이선스 최적화' && ins.refId) {
    const l = s.licenses.find((x) => x.id === ins.refId)
    if (l) {
      // 초과 사용(사용>보유)은 추가 구매, 미사용 여유(사용<보유)는 회수
      const act = l.used > l.purchased ? '추가 구매' : '회수'
      const r = raiseLicenseApproval(session, l.id, act)
      if (r.approvalId) action = r.ok ? `라이선스 ${act} 상신 — ${r.approvalId}` : `기존 결재 진행 중 — ${r.approvalId}`
    }
  } else if (ins.kind === '이상탐지') {
    const host = ins.title.split('—').pop()?.trim()
    const d = host ? s.discovered.find((x) => x.hostname === host) : undefined
    if (d && d.action !== '격리요청' && d.action !== '격리완료') {
      const id = nextApprovalId()
      s.approvals.unshift({
        id,
        kind: '격리 요청',
        title: `${d.hostname} 격리 요청 — AI 이상행위 탐지 (${ins.id})`,
        requester: session.name,
        dept: session.dept,
        requestedAt: today(),
        status: '대기',
        currentStep: 'IT기획팀장 결재',
        refId: d.id,
        note: ins.detail,
      })
      d.action = '격리요청'
      action = `격리 요청 상신 — ${id}`
    }
  } else if (ins.kind === '취약점 우선순위' && ins.refId) {
    // EOL·고위험 취약점 자산 → 교체 위해 폐기 대상으로 선정(폐기 결재 게이트를 거친다)
    const asset = s.assets.find((a) => a.assetNo === ins.refId)
    if (asset && !['폐기예정', '폐기완료'].includes(asset.status) && !s.disposals.some((d) => d.assetNo === asset.assetNo)) {
      s.disposals.push({ id: nextId('DSP'), assetNo: asset.assetNo, model: asset.model, reason: `EOL·취약점 조치 1순위 — ${ins.title}`, status: '대상 선정' })
      asset.status = '폐기예정'
      action = `폐기(교체) 대상 선정 — ${asset.assetNo}`
    } else if (asset) {
      action = `이미 폐기 절차 대상 — ${asset.assetNo}`
    }
  }

  ins.action = action
  appendAudit({ actor: session.name, action: `AI 제안 승인 (${ins.kind}) — ${action}`, target: ins.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${ins.id} 승인 — ${action}` }
}
