import { Card, ScreenHeader } from '@/components/ui'
import { daysUntil, isMaintenanceDue, isMaintenanceOverdue, isStaleVerify, today } from '@/lib/dates'
import { isEolTarget } from '@/lib/eol'
import { canExport } from '@/lib/exports'
import { hasDataIssue } from '@/lib/quality'
import { criticalDependencies } from '@/lib/cmdb'
import { replacementCandidates } from '@/lib/reports'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { BulkImport } from './BulkImport'
import { RegisterView } from './RegisterView'

export const dynamic = 'force-dynamic'

export default async function AssetRegisterPage({ searchParams }: { searchParams: Promise<{ q?: string; sel?: string; cat?: string; status?: string; warranty?: string; dq?: string; os?: string; crit?: string; maint?: string; spof?: string; replace?: string; stale?: string; receipt?: string; loanext?: string; loanret?: string; risk?: string }> }) {
  const session = (await getSession())!
  const { q, sel, cat, status, warranty, dq, os, crit, maint, spof, replace, stale, receipt, loanext, loanret, risk } = await searchParams
  const s = getStore()
  // 화면·기능 단위 최소권한 — 사용자 권한그룹은 본인 보유 자산만 조회
  const scoped = session.role === 'USER' ? s.assets.filter((a) => a.owner === session.name) : s.assets
  // 수령 미확인(불출 후 인수 대기) 자산 수 — 자산담당 수령 확인 독촉 버튼 노출/집계용
  const receiptPendingCount = scoped.filter((a) => a.receiptPending && a.status === '사용중').length
  // 수령(인수) 미확인 — 불출 배정 후 사용자 인수 확인이 안 된 사용 중 자산(체인 오브 커스터디 공백). 대시보드 큐(?receipt=1)·어시스턴트 링크와 같은 판정.
  const receiptNos = scoped.filter((a) => a.receiptPending && a.status === '사용중').map((a) => a.assetNo)
  // 대여 셀프서비스 요청 대기 — 대여자가 올린 반환 기한 연장 요청·반납 신청. 대시보드 큐(?loanext=1·?loanret=1)와 같은 판정으로, 큐 건수=목록.
  const loanExtNos = scoped.filter((a) => a.loanExtendRequest).map((a) => a.assetNo)
  const loanRetNos = scoped.filter((a) => a.returnRequest).map((a) => a.assetNo)
  // ?sel= 로 특정 자산을 바로 선택 — 상세·구성변경 딥링크. 스코프 밖 자산번호는 무시된다.
  const initialSel = sel && scoped.some((a) => a.assetNo === sel) ? sel : undefined
  // 장기 미실측(유령 자산 후보) — 대장 필터·재물조사 편성이 공유하는 lib/dates 의 isStaleVerify 기준
  const staleNos = scoped.filter((a) => isStaleVerify(a, s.opsPolicy.staleVerifyDays)).map((a) => a.assetNo)
  // 보증 만료 임박·경과 — 운영 중 자산 중 보증 90일 이내(경과 포함). 보증 없는 자산(SW·가상자원)은 제외.
  const warrantyNos = scoped
    .filter((a) => !['폐기완료', '폐기예정'].includes(a.status) && a.warrantyEnd !== '-' && (daysUntil(a.warrantyEnd) ?? 999) <= 90)
    .map((a) => a.assetNo)
  // 정합성 미흡(필드 누락·불일치) — 대장·대시보드가 공유하는 lib/quality 의 hasDataIssue 기준
  const dqNos = scoped.filter(hasDataIssue).map((a) => a.assetNo)
  // EOL OS(지원 종료 경과) — 운영 중 자산 중 OS 지원 종료가 지난 것. 미패치 취약점 상시 노출 → 교체·업그레이드 대상. (제품안내서 §05 취약점 우선순위)
  const eolNos = scoped
    .filter((a) => isEolTarget(a.status, a.os, today()))
    .map((a) => a.assetNo)
  // 핵심·중요 자산 — 운영자가 지정한 업무 중요도(§05 자산 중요도 축). DR·패치 우선순위·감사 대상 식별.
  const critNos = scoped.filter((a) => a.criticality === '핵심' || a.criticality === '중요').map((a) => a.assetNo)
  // 정기 점검 대상 — 예방 정비 예정일 도래(30일 내·경과) 자산. 대시보드 나눔 드릴다운(?maint=1)과 대장 필터가 공유.
  const maintenanceNos = scoped.filter((a) => isMaintenanceDue(a, s.opsPolicy.maintenanceWindowDays)).map((a) => a.assetNo)
  // 단일 장애점(SPOF) — CMDB 의존 그래프상 blast radius 2대 이상(전체 그래프로 산출) 중 조회 범위 내 자산. 대시보드 큐(?spof=1) 드릴다운과 대장 필터가 공유.
  const scopedNoSet = new Set(scoped.map((a) => a.assetNo))
  const spofNos = criticalDependencies().map((x) => x.asset.assetNo).filter((no) => scopedNoSet.has(no))
  // 교체 대상(수명예측 fn03) — 내용연수 초과·보증 경과·장애 이력. AI 분석 패널·연간 교체 계획 리포트와 같은 replacementCandidates() 근거로 대장에서 브라우즈·반출(조달 계획). 패널(?replace=1) 링크와 공유.
  const replaceNos = replacementCandidates().cands.map((x) => x.a.assetNo).filter((no) => scopedNoSet.has(no))
  // 정기 점검 경과(미시행) 대수 — 예정일을 넘긴 자산. 자산담당 정기 점검 독촉 버튼 노출/집계용(임박은 제외).
  const maintOverdueCount = scoped.filter(isMaintenanceOverdue).length
  // 복합 위험(≥2 신호) — 취약·EOL·보증·점검·SPOF·교체·미실측 주의 신호가 2개 이상 겹치는 자산. 다중 이슈 우선 트리아지(도시어 '위험 신호' 요약과 같은 7신호 단일 소스 재사용).
  const riskTally = new Map<string, number>()
  for (const set of [staleNos, warrantyNos, dqNos, eolNos, maintenanceNos, spofNos, replaceNos]) for (const no of set) riskTally.set(no, (riskTally.get(no) ?? 0) + 1)
  const riskNos = [...riskTally.entries()].filter(([, c]) => c >= 2).map(([no]) => no)
  // 자산별 배정 라이선스(좌석) — 라이선스 화면의 좌석 배정(로56)을 자산 관점에서 역조회. 상세에서 이 자산에
  //  어떤 SW 라이선스가 배정됐는지 보여준다(오프보딩·감사: 회수·재배정 대상 식별). 해지 라이선스는 제외.
  const licenseSeatsByAsset: Record<string, { id: string; name: string; vendor: string }[]> = {}
  for (const l of s.licenses) {
    if (l.status === '해지' || !l.seats) continue
    for (const st of l.seats) {
      if (session.role === 'USER' && !scoped.some((a) => a.assetNo === st.assetNo)) continue
      ;(licenseSeatsByAsset[st.assetNo] ??= []).push({ id: l.id, name: l.name, vendor: l.vendor })
    }
  }

  return (
    <>
      <ScreenHeader
        kicker="자산관리 · Asset Register"
        title="자산 대장"
        desc="H/W(단말·서버·네트워크) · S/W · 가상자원 대장 — 자산번호 · 구성정보 · 소유자 · 위치 이력"
      />
      {session.role === 'USER' && (
        <div className="callout"><b>사용자 권한 범위.</b> 본인 보유 자산만 표시됩니다. 자산 신청·반납·이동 요청은 워크플로 › 신청·결재에서 상신할 수 있습니다.</div>
      )}
      {session.role !== 'USER' && <BulkImport />}
      <Card pad={false}>
        <RegisterView assets={scoped} initialQuery={q ?? ''} canEdit={session.role !== 'USER'} canConfig={['ASSET_MGR', 'ADMIN'].includes(session.role)} canExport={canExport('assets', session.role)} initialSel={initialSel} staleNos={staleNos} initialStale={stale === '1'} warrantyNos={warrantyNos} initialWarranty={warranty === 'soon'} dqNos={dqNos} initialDq={dq === '1'} eolNos={eolNos} initialEol={os === 'eol'} critNos={critNos} initialCrit={crit === '1'} contracts={s.contracts.filter((c) => c.status !== '해지').map((c) => ({ id: c.id, name: c.name, kind: c.kind }))} today={today()} initialCat={cat} initialStatus={status} receiptPendingCount={receiptPendingCount} receiptNos={receiptNos} initialReceipt={receipt === '1'} loanExtNos={loanExtNos} initialLoanExt={loanext === '1'} loanRetNos={loanRetNos} initialLoanRet={loanret === '1'} maintenanceNos={maintenanceNos} initialMaint={maint === '1'} maintOverdueCount={maintOverdueCount} spofNos={spofNos} initialSpof={spof === '1'} replaceNos={replaceNos} initialReplace={replace === '1'} riskNos={riskNos} initialRisk={risk === '1'} licenseSeatsByAsset={licenseSeatsByAsset} users={session.role === 'USER' ? undefined : s.users.map((u) => ({ name: u.name, dept: u.dept }))} />
      </Card>
    </>
  )
}
