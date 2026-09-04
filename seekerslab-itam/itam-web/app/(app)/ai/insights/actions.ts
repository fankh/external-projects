'use server'
import { hasDisposalRecord } from '@/lib/stock'
import { DISPOSAL_STATUSES, HELD_STATUSES } from '@/lib/types'
import { revalidatePath } from 'next/cache'
import { appendAudit, denied } from '@/lib/audit'
import { classifyDiscoveredType } from '@/lib/classify'
import { today } from '@/lib/dates'
import { raiseLicenseApproval } from '@/lib/license'
import { recipientOf, dispatch } from '@/lib/notify'
import { createReport, replacementCandidates } from '@/lib/reports'
import { getSession } from '@/lib/session'
import { getStore, nextApprovalId, nextId } from '@/lib/store'
import { replacementNoticeTargets } from '@/lib/reminders'

/** AI 제안 판정 — 담당자 확인·결재를 거쳐야 제안이 조치로 이어진다.
 *  승인·반려 결과는 그대로 남아 재학습 신호(채택률·오탐 유형)로 집계된다.
 *  (제품안내서 §05 그림 4: 제안 → 담당자 확인·결재 → 대장 반영·조치 → 판정 결과 환류) */
export async function decideInsight(insightId: string, verdict: '승인' | '반려', reason: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '제안 판정 권한이 없습니다.' }
  if (!['ASSET_MGR', 'SEC_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, '제안 판정 권한이 없습니다.', '/ai/insights')

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
        // 격리 요청 결재선은 보안담당 → IT기획팀장(2단계, 필수). 진입 단계는 route[0]='보안담당 승인' 이어야 한다.
        // (IT기획팀장 결재로 진입하면 최종 단계로 취급돼 보안담당 사인오프를 건너뛰고 단일 결재로 NAC 격리가 집행된다 — 수기 발견 경로와 동일하게 맞춘다.)
        currentStep: '보안담당 승인',
        refId: d.id,
        note: ins.detail,
      })
      d.action = '격리요청'
      action = `격리 요청 상신 — ${id}`
    } else if (!d && ins.refId) {
      // 발견 저장소에 없는 대장 관리 자산의 이상행위(§05 기능02 '서버의 비정상 외부 통신'). 그동안 host 를 discovered 에서만
      // 찾아, 대장에만 있는 자산은 승인해도 조치 없이 no-op 이었다. refId 로 대장 자산을 지목해 자산 키 격리 요청을 상신한다.
      const asset = s.assets.find((a) => a.assetNo === ins.refId)
      if (asset && !asset.quarantinedAt && !s.approvals.some((ap) => ap.status === '대기' && ap.kind === '격리 요청' && ap.refId === asset.assetNo)) {
        const id = nextApprovalId()
        s.approvals.unshift({
          id,
          kind: '격리 요청',
          title: `${asset.assetNo} 격리 요청 — AI 이상행위 탐지 (${ins.id})`,
          requester: session.name,
          dept: session.dept,
          requestedAt: today(),
          status: '대기',
          // 발견 자산 격리와 동일한 결재선(보안담당 → IT기획팀장 2단계).
          currentStep: '보안담당 승인',
          refId: asset.assetNo,
          note: ins.detail,
        })
        action = `대장 자산 격리 요청 상신 — ${id} (${asset.assetNo})`
      } else if (asset?.quarantinedAt) {
        action = `이미 격리된 자산 — ${asset.assetNo}`
      }
    }
  } else if (ins.kind === '취약점 우선순위' && ins.refId) {
    // EOL·고위험 취약점 자산 → 교체 위해 폐기 대상으로 선정(폐기 결재 게이트를 거친다)
    const asset = s.assets.find((a) => a.assetNo === ins.refId)
    //  보유자가 쥔·파이프라인 중 자산(사용중·대여중·검수중)은 실물을 폐기할 수 없다 — 직접 선정
    //   (selectForDisposal)이 '먼저 회수·반환·검수를 마쳐야 한다'며 막는 바로 그 판정이다. 이 경로만
    //   그 게이트를 지나쳐, AI 제안 승인 한 번으로 남의 손에 있는 자산이 폐기예정이 되고(대여중이면 대여
    //   추적이 끊긴다) 회수 단계가 통째로 생략됐다. 같은 판정을 두 경로가 다르게 하지 않는다.
    if (asset && (HELD_STATUSES as readonly string[]).includes(asset.status)) {
      action = `보유 중(${asset.status}) — 회수·반환·검수 후 폐기 선정 대상 (${asset.assetNo})`
    } else if (asset && !DISPOSAL_STATUSES.includes(asset.status) && !hasDisposalRecord(s.disposals, asset.assetNo)) {
      s.disposals.push({ id: nextId('DSP'), assetNo: asset.assetNo, model: asset.model, reason: `EOL·취약점 조치 1순위 — ${ins.title}`, status: '대상 선정', prevStatus: asset.status })
      // 직접 선정(selectForDisposal)과 같은 이력을 남긴다 — AI 제안으로 편입된 자산만 타임라인이 비면 안 된다.
      asset.history.push({ date: today(), kind: '폐기', detail: `폐기(교체) 대상 선정 — AI 제안 승인 ${ins.title} (${asset.status} → 폐기예정)`, actor: session.name })
      asset.status = '폐기예정'
      action = `폐기(교체) 대상 선정 — ${asset.assetNo}`
    } else if (asset) {
      action = `이미 폐기 절차 대상 — ${asset.assetNo}`
    }
  } else if (ins.kind === '자동분류' && ins.refId) {
    // 자동분류 제안 승인 = 표준 유형 확정(§05 기능01 · 그림4). 발견 자산에 확정 유형을 저장해 편입 시 승계하고,
    // 이미 대장에 매칭된 자산이면 유형을 바로 보정한다(구성변경). 규칙 기본값 오분류를 담당자 판정으로 바로잡는 접점.
    const d = s.discovered.find((x) => x.id === ins.refId)
    if (d) {
      const cat = ins.proposedCategory ?? classifyDiscoveredType(d.type)
      d.classifiedCategory = cat
      const asset = d.matchedAssetNo ? s.assets.find((a) => a.assetNo === d.matchedAssetNo) : undefined
      if (asset && asset.category !== cat) {
        asset.history.push({ date: today(), kind: '구성변경', detail: `AI 자동분류 승인 — 유형 ${asset.category} → ${cat} (${ins.id})`, actor: session.name })
        asset.category = cat
      }
      action = `발견 자산 표준 유형 확정 — ${d.id} → ${cat}${asset ? ' · 대장 유형 보정' : ' · 편입 시 승계'}`
    }
  }

  ins.action = action
  appendAudit({ actor: session.name, action: `AI 제안 승인 (${ins.kind}) — ${action}`, target: ins.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${ins.id} 승인 — ${action}` }
}

/** 위험도 기준 관리 — 보안담당(SEC_MGR)이 취약점 우선순위 P1/P2 컷오프를 설정한다.
 *  (제품안내서 §01 역할: 보안담당 — 위험도 기준 관리). 취약점 우선순위 화면·리포트가 같은 정책을
 *  참조하므로 여기서 바꾸면 P1/P2/P3 재분류가 전 화면에 반영된다. 자산담당은 조회만. */
export async function setRiskPolicy(input: { p1MinScore: number; p2MinScore: number }) {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '위험도 기준 관리는 보안담당·Admin 만 가능합니다.' }
  }
  const p1 = Math.round(input.p1MinScore)
  const p2 = Math.round(input.p2MinScore)
  // 점수는 0~100 정규화. P2 컷오프는 P1 보다 낮아야 세 등급이 성립한다.
  if (!Number.isFinite(p1) || !Number.isFinite(p2) || p1 < 1 || p1 > 100 || p2 < 1 || p2 > 100) {
    return { ok: false, message: '점수는 1~100 사이여야 합니다.' }
  }
  if (p2 >= p1) return { ok: false, message: 'P2 기준은 P1 기준보다 낮아야 합니다 (P2 < P1).' }

  const s = getStore()
  s.riskPolicy = { p1MinScore: p1, p2MinScore: p2 }
  appendAudit({ actor: session.name, action: `위험도 기준 변경 — P1≥${p1} · P2≥${p2}`, target: '취약점 우선순위' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `위험도 기준 저장 — P1≥${p1} · P2≥${p2} (P3 <${p2})` }
}

/** 교체 검토 통보(AI 기능 03 수명예측 조치) — 내용연수·보증 경과·장애 이력으로 교체 시점이 도래한 자산의
 *  소유 부서에 교체 검토를 요청한다. 그동안 수명예측은 대시보드 '교체 대상 자산' 큐·패널로 표시만 되고(읽기 전용
 *  표로 dead-end), 소유 부서를 움직일 조치 접점이 없었다 — EOL 업그레이드 통보(register)의 수명예측 판.
 *  근거는 연간 교체 계획 리포트·패널과 동일한 replacementCandidates(). 당일 중복 발송 차단. 자산담당·Admin. */
export async function notifyReplacement() {
  const session = await getSession()
  if (!session) return { ok: false, message: '교체 검토 통보 권한이 없습니다 (자산담당·Admin).' }
  if (!['ASSET_MGR', 'ADMIN'].includes(session.role)) return denied(session.name, '교체 검토 통보 권한이 없습니다 (자산담당·Admin).', '/ai/insights')
  const t = today()
  // 대상 판정은 화면 버튼 건수와 한 소스(lib/reminders) — 교체 대상 + 당일 발송분 제외.
  let n = 0
  for (const { a, why } of replacementNoticeTargets()) {
    // 보유자 없는 자산(유휴·검수중 등 owner 미지정/-)은 '- (부서)' 로 아무에게도 아닌 발송이 되지 않게 관리 부서 앞으로(다른 owner 발송 사이트와 동일 가드).
    const to = recipientOf(a.owner, a.dept)
    dispatch({ channel: '이메일', to, subject: `자산 교체 검토 요청 — ${a.assetNo} ${a.model} (${why})`, kind: '교체 검토 통보', ref: a.assetNo })
    a.history.push({ date: t, kind: '구성변경', detail: `교체 검토 통보 발송 — ${why} (${a.owner} · ${a.dept})`, actor: session.name })
    n += 1
  }
  if (n === 0) return { ok: false, message: '교체 검토 통보 대상이 없습니다 (교체 대상 없음·오늘 발송분 제외).' }
  appendAudit({ actor: session.name, action: `교체 검토 통보 발송 (${n}건)`, target: '교체 대상 자산' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `교체 검토 통보 ${n}건 발송 — 교체 시점 도래 자산의 소유 부서에 교체 검토 요청 (발송 이력 적재)` }
}
