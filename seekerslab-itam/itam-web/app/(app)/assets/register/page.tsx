import { Card, ScreenHeader } from '@/components/ui'
import { daysUntil, isStaleVerify, today } from '@/lib/dates'
import { eolOsOf } from '@/lib/eol'
import { canExport } from '@/lib/exports'
import { hasDataIssue } from '@/lib/quality'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { BulkImport } from './BulkImport'
import { RegisterView } from './RegisterView'

export const dynamic = 'force-dynamic'

export default async function AssetRegisterPage({ searchParams }: { searchParams: Promise<{ q?: string; sel?: string; cat?: string; status?: string; warranty?: string; dq?: string; os?: string; crit?: string }> }) {
  const session = (await getSession())!
  const { q, sel, cat, status, warranty, dq, os, crit } = await searchParams
  const s = getStore()
  // 화면·기능 단위 최소권한 — 사용자 권한그룹은 본인 보유 자산만 조회
  const scoped = session.role === 'USER' ? s.assets.filter((a) => a.owner === session.name) : s.assets
  // ?sel= 로 특정 자산을 바로 선택 — 상세·구성변경 딥링크. 스코프 밖 자산번호는 무시된다.
  const initialSel = sel && scoped.some((a) => a.assetNo === sel) ? sel : undefined
  // 장기 미실측(유령 자산 후보) — 대장 필터·재물조사 편성이 공유하는 lib/dates 의 isStaleVerify 기준
  const staleNos = scoped.filter(isStaleVerify).map((a) => a.assetNo)
  // 보증 만료 임박·경과 — 운영 중 자산 중 보증 90일 이내(경과 포함). 보증 없는 자산(SW·가상자원)은 제외.
  const warrantyNos = scoped
    .filter((a) => !['폐기완료', '폐기예정'].includes(a.status) && a.warrantyEnd !== '-' && (daysUntil(a.warrantyEnd) ?? 999) <= 90)
    .map((a) => a.assetNo)
  // 정합성 미흡(필드 누락·불일치) — 대장·대시보드가 공유하는 lib/quality 의 hasDataIssue 기준
  const dqNos = scoped.filter(hasDataIssue).map((a) => a.assetNo)
  // EOL OS(지원 종료 경과) — 운영 중 자산 중 OS 지원 종료가 지난 것. 미패치 취약점 상시 노출 → 교체·업그레이드 대상. (제품안내서 §05 취약점 우선순위)
  const eolNos = scoped
    .filter((a) => !['폐기완료', '폐기예정'].includes(a.status) && eolOsOf(a.os, today()))
    .map((a) => a.assetNo)
  // 핵심·중요 자산 — 운영자가 지정한 업무 중요도(§05 자산 중요도 축). DR·패치 우선순위·감사 대상 식별.
  const critNos = scoped.filter((a) => a.criticality === '핵심' || a.criticality === '중요').map((a) => a.assetNo)

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
        <RegisterView assets={scoped} initialQuery={q ?? ''} canEdit={session.role !== 'USER'} canConfig={['ASSET_MGR', 'ADMIN'].includes(session.role)} canExport={canExport('assets', session.role)} initialSel={initialSel} staleNos={staleNos} warrantyNos={warrantyNos} initialWarranty={warranty === 'soon'} dqNos={dqNos} initialDq={dq === '1'} eolNos={eolNos} initialEol={os === 'eol'} critNos={critNos} initialCrit={crit === '1'} contracts={s.contracts.filter((c) => c.status !== '해지').map((c) => ({ id: c.id, name: c.name, kind: c.kind }))} today={today()} initialCat={cat} initialStatus={status} />
      </Card>
    </>
  )
}
