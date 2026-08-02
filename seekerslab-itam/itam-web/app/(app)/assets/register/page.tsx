import { Card, ScreenHeader } from '@/components/ui'
import { isStaleVerify, today } from '@/lib/dates'
import { canExport } from '@/lib/exports'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { RegisterView } from './RegisterView'

export const dynamic = 'force-dynamic'

export default async function AssetRegisterPage({ searchParams }: { searchParams: Promise<{ q?: string; sel?: string }> }) {
  const session = (await getSession())!
  const { q, sel } = await searchParams
  const s = getStore()
  // 화면·기능 단위 최소권한 — 사용자 권한그룹은 본인 보유 자산만 조회
  const scoped = session.role === 'USER' ? s.assets.filter((a) => a.owner === session.name) : s.assets
  // ?sel= 로 특정 자산을 바로 선택 — 상세·구성변경 딥링크. 스코프 밖 자산번호는 무시된다.
  const initialSel = sel && scoped.some((a) => a.assetNo === sel) ? sel : undefined
  // 장기 미실측(유령 자산 후보) — 대장 필터·재물조사 편성이 공유하는 lib/dates 의 isStaleVerify 기준
  const staleNos = scoped.filter(isStaleVerify).map((a) => a.assetNo)

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
      <Card pad={false}>
        <RegisterView assets={scoped} initialQuery={q ?? ''} canEdit={session.role !== 'USER'} canConfig={['ASSET_MGR', 'ADMIN'].includes(session.role)} canExport={canExport('assets', session.role)} initialSel={initialSel} staleNos={staleNos} today={today()} />
      </Card>
    </>
  )
}
