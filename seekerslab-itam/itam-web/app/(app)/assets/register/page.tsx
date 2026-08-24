import { Card, ScreenHeader } from '@/components/ui'
import { daysUntil, isMaintenanceDue, isMaintenanceOverdue, isWarrantyExpiring, isStaleVerify, today } from '@/lib/dates'
import { isEolTarget } from '@/lib/eol'
import { canExport } from '@/lib/exports'
import { hasDataIssue } from '@/lib/quality'
import { criticalDependencies } from '@/lib/cmdb'
import { replacementCandidates } from '@/lib/reports'
import { compositeRiskAssetNos } from '@/lib/risk'
import { requireView } from '@/lib/authz'
import { pendingDisposalNos } from '@/lib/stock'
import { requiresApproval } from '@/lib/approval'
import { eolNoticeTargets, maintenanceRemindTargets, receiptRemindTargets } from '@/lib/reminders'
import { getStore } from '@/lib/store'
import { BulkImport } from './BulkImport'
import { RegisterView } from './RegisterView'

export const dynamic = 'force-dynamic'

export default async function AssetRegisterPage({ searchParams }: { searchParams: Promise<{ q?: string; sel?: string; cat?: string; status?: string; warranty?: string; dq?: string; os?: string; crit?: string; maint?: string; spof?: string; replace?: string; stale?: string; receipt?: string; loanext?: string; loanret?: string; risk?: string }> }) {
  const session = await requireView('/assets/register', 'USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const { q, sel, cat, status, warranty, dq, os, crit, maint, spof, replace, stale, receipt, loanext, loanret, risk } = await searchParams
  const s = getStore()
  // 자산 운영 권한 — 대장의 조작 컨트롤과 CSV 일괄 등록 패널이 같은 판정을 쓴다(서버 액션의 역할 집합과 일치).
  const canManage = ['ASSET_MGR', 'ADMIN'].includes(session.role)
  // 필수 결재로 지정된 종류는 직접 실행이 서버에서 거부된다 — 컨트롤을 그대로 내주면 눌러야 거부되는 막다른 길이 된다.
  const loanNeedsApproval = requiresApproval('대여')
  const moveNeedsApproval = requiresApproval('이동')
  // 화면·기능 단위 최소권한 — 사용자 권한그룹은 본인 보유 자산만 조회
  const scoped = session.role === 'USER' ? s.assets.filter((a) => a.owner === session.name) : s.assets
  // 연계 계약이 해지된 자산 — 상세에서 '계약 해지됨'으로 드러낸다. 라이선스는 이미 '근거 해지'를 표시하는데(LicenseTable)
  //  자산 쪽에는 같은 신호가 없어, 해지된 계약이 상세에 살아 있는 링크로만 보였다(유지보수 근거가 사라진 줄 모른다).
  //  연계 계약 선택 목록(contracts)은 해지분을 빼고 넘기므로 화면이 스스로 판단할 수 없다 — 집합을 따로 준다.
  const terminatedContracts = [...new Set(scoped.map((a) => a.contractId).filter(Boolean) as string[])]
    .filter((id) => s.contracts.some((c) => c.id === id && c.status === '해지'))
  // 수령 확인 독촉 버튼 건수 — '오늘 아직 안 보낸' 대상 수(lib/reminders). 액션과 같은 소스라 누른 만큼 줄고 0 이면 버튼이 사라진다.
  //  그전엔 화면이 미확인 자산 전부를 세고 액션만 당일 발송분을 제외해, 한 번 보낸 뒤에도 같은 건수로 남아 누르면 '대상 없음'이 됐다.
  const receiptPendingCount = canManage ? receiptRemindTargets().length : 0
  // 수령(인수) 미확인 — 불출 배정 후 사용자 인수 확인이 안 된 사용 중 자산(체인 오브 커스터디 공백). 대시보드 큐(?receipt=1)·어시스턴트 링크와 같은 판정.
  const receiptNos = scoped.filter((a) => a.receiptPending && a.status === '사용중').map((a) => a.assetNo)
  // 대여 셀프서비스 요청 대기 — 대여자가 올린 반환 기한 연장 요청·반납 신청. 대시보드 큐(?loanext=1·?loanret=1)와 같은 판정으로, 큐 건수=목록.
  const loanExtNos = scoped.filter((a) => a.loanExtendRequest).map((a) => a.assetNo)
  const loanRetNos = scoped.filter((a) => a.returnRequest).map((a) => a.assetNo)
  // ?sel= 로 특정 자산을 바로 선택 — 상세·구성변경 딥링크. 스코프 밖 자산번호는 무시된다.
  const initialSel = sel && scoped.some((a) => a.assetNo === sel) ? sel : undefined
  // 장기 미실측(유령 자산 후보) — 대장 필터·재물조사 편성이 공유하는 lib/dates 의 isStaleVerify 기준
  const staleNos = scoped.filter((a) => isStaleVerify(a, s.opsPolicy.staleVerifyDays)).map((a) => a.assetNo)
  // 보증 만료 임박·경과 — 운영 중 자산 중 보증 만료가 알림 창(운영 정책 expiryWindowDays) 안(경과 포함). 통지·대시보드와 같은 lib/dates 판정.
  const warrantyNos = scoped.filter((a) => isWarrantyExpiring(a, s.opsPolicy.expiryWindowDays)).map((a) => a.assetNo)
  // 정합성 미흡(필드 누락·불일치) — 대장·대시보드가 공유하는 lib/quality 의 hasDataIssue 기준
  const dqNos = scoped.filter(hasDataIssue).map((a) => a.assetNo)
  // EOL OS(지원 종료 경과) — 운영 중 자산 중 OS 지원 종료가 지난 것. 미패치 취약점 상시 노출 → 교체·업그레이드 대상. (제품안내서 §05 취약점 우선순위)
  const eolNos = scoped
    .filter((a) => isEolTarget(a.status, a.os, today()))
    .map((a) => a.assetNo)
  // 핵심·중요 자산 — 운영자가 지정한 업무 중요도(§05 자산 중요도 축). DR·패치 우선순위·감사 대상 식별.
  // EOL 업그레이드 통보 버튼 건수 — EOL 필터 칩(eolNos, 브라우즈용 전량)과 달리 '오늘 아직 안 보낸' 발송 대상 수다(lib/reminders).
  const eolNoticeCount = canManage ? eolNoticeTargets().length : 0
  const critNos = scoped.filter((a) => a.criticality === '핵심' || a.criticality === '중요').map((a) => a.assetNo)
  // 정기 점검 대상 — 예방 정비 예정일 도래(30일 내·경과) 자산. 대시보드 나눔 드릴다운(?maint=1)과 대장 필터가 공유.
  const maintenanceNos = scoped.filter((a) => isMaintenanceDue(a, s.opsPolicy.maintenanceWindowDays)).map((a) => a.assetNo)
  // 단일 장애점(SPOF) — CMDB 의존 그래프상 blast radius 2대 이상(전체 그래프로 산출) 중 조회 범위 내 자산. 대시보드 큐(?spof=1) 드릴다운과 대장 필터가 공유.
  const scopedNoSet = new Set(scoped.map((a) => a.assetNo))
  const spofNos = criticalDependencies().map((x) => x.asset.assetNo).filter((no) => scopedNoSet.has(no))
  // 교체 대상(수명예측 fn03) — 내용연수 초과·보증 경과·장애 이력. AI 분석 패널·연간 교체 계획 리포트와 같은 replacementCandidates() 근거로 대장에서 브라우즈·반출(조달 계획). 패널(?replace=1) 링크와 공유.
  const replaceNos = replacementCandidates().cands.map((x) => x.a.assetNo).filter((no) => scopedNoSet.has(no))
  // 정기 점검 독촉 버튼 건수 — 경과(미시행) 자산 중 오늘 아직 안 보낸 대상 수(lib/reminders · 액션과 같은 소스).
  const maintOverdueCount = canManage ? maintenanceRemindTargets().length : 0
  // 복합 위험(≥2 신호) — 정합성 미흡·EOL·보증·점검·SPOF·교체·미실측 주의 신호가 2개 이상 겹치는 자산. 대장 필터·도시어 요약·대시보드 큐가 lib/risk 단일 소스 공유(임계값 재계산 없음).
  const riskNos = compositeRiskAssetNos(scoped)
  // 폐기 절차(대상 선정~소거 대기) 진행 중 — 재불출·대여 가드(dispatchAsset·loanAsset)가 거부하는 자산.
  //  화면이 이 자산에 대여 컨트롤을 그대로 내주면 눌러야 거부되는 막다른 길이 된다(lib/stock 단일 기준).
  const disposalNos = [...pendingDisposalNos(s.disposals)].filter((no) => scopedNoSet.has(no))
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
      {/* CSV 일괄 등록은 bulkRegisterAssets(자산담당·Admin)를 부른다 — 보안담당에게 내주면 붙여넣고 눌러야 거부된다 */}
      {canManage && <BulkImport />}
      <Card pad={false}>
        <RegisterView assets={scoped} initialQuery={q ?? ''} canEdit={session.role !== 'USER'} canConfig={['ASSET_MGR', 'ADMIN'].includes(session.role)} canDoc={['ASSET_MGR', 'ADMIN'].includes(session.role)} canQuarantine={['SEC_MGR', 'ADMIN'].includes(session.role)} canManage={canManage} loanNeedsApproval={loanNeedsApproval} moveNeedsApproval={moveNeedsApproval} terminatedContracts={terminatedContracts} canExport={canExport('assets', session.role)} initialSel={initialSel} staleNos={staleNos} initialStale={stale === '1'} warrantyNos={warrantyNos} initialWarranty={warranty === 'soon'} expiryWindowDays={s.opsPolicy.expiryWindowDays} dqNos={dqNos} initialDq={dq === '1'} eolNos={eolNos} initialEol={os === 'eol'} critNos={critNos} initialCrit={crit === '1'} contracts={s.contracts.filter((c) => c.status !== '해지').map((c) => ({ id: c.id, name: c.name, kind: c.kind }))} today={today()} initialCat={cat} initialStatus={status} receiptPendingCount={receiptPendingCount} receiptNos={receiptNos} initialReceipt={receipt === '1'} loanExtNos={loanExtNos} initialLoanExt={loanext === '1'} loanRetNos={loanRetNos} initialLoanRet={loanret === '1'} maintenanceNos={maintenanceNos} initialMaint={maint === '1'} maintOverdueCount={maintOverdueCount} eolNoticeCount={eolNoticeCount} spofNos={spofNos} initialSpof={spof === '1'} replaceNos={replaceNos} initialReplace={replace === '1'} riskNos={riskNos} initialRisk={risk === '1'} disposalNos={disposalNos} licenseSeatsByAsset={licenseSeatsByAsset} users={session.role === 'USER' ? undefined : s.users.map((u) => ({ name: u.name, dept: u.dept }))} />
      </Card>
    </>
  )
}
