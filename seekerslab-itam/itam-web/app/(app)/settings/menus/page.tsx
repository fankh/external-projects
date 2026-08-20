import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { canExport } from '@/lib/exports'
import { ACTION_DEF, PERM_ACTIONS } from '@/lib/perm'
import { getStore } from '@/lib/store'
import { MenusView } from './MenusView'

export const dynamic = 'force-dynamic'

export default async function MenusPage() {
  const session = await requireRole('ADMIN')
  const defs = getStore().menuDefs

  const totalCells = defs.reduce((n, d) => n + d.actions.length, 0)
  const enforcedCells = defs.reduce((n, d) => n + d.enforced.length, 0)
  const cats = new Set(defs.map((d) => d.category)).size

  return (
    <>
      <ScreenHeader
        kicker="환경설정 · Menu & Function"
        title="메뉴 · 기능 관리"
        desc="STEP 1 메뉴기능관리(기능 정의) → STEP 2 메뉴관리(카테고리·화면번호·기능 부여) — 매트릭스는 이 정의 위에서만 권한을 부여한다"
        right={canExport('menus', session.role)
          ? <a className="btn sm ghost" href={`/api/export/menus`} download title="메뉴·기능 정의(STEP 1·2)를 엑셀로 반출 — 권한 매트릭스의 '엑셀' 기능">⤓ 엑셀 내보내기</a>
          : undefined}
      />

      <div className="stat-row">
        <Stat value={defs.length} label="등록 화면" delta={{ text: `카테고리 ${cats}종`, dir: 'flat' }} />
        <Stat value={PERM_ACTIONS.length} label="정의된 기능(버튼)" />
        <Stat value={totalCells} label="화면 × 기능 조합" />
        <Stat value={enforcedCells} label="서버가 강제하는 조합" tone="ok" delta={{ text: '나머지는 화면 가드', dir: 'flat' }} />
      </div>

      <Card kicker="STEP 1 · Function Dictionary" title="기능 정의 — 화면이 제공할 수 있는 버튼" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>기능</th><th>의미</th><th>강제 지점</th><th className="num">사용 화면</th></tr>
            </thead>
            <tbody>
              {PERM_ACTIONS.map((a) => {
                const used = defs.filter((d) => d.actions.includes(a)).length
                const srv = ACTION_DEF[a]?.enforcedBy.startsWith('서버')
                return (
                  <tr key={a}>
                    <td className="strong">{a}</td>
                    <td className="dim">{ACTION_DEF[a]?.desc ?? '-'}</td>
                    <td>
                      {srv
                        ? <Chip tone="ok">{ACTION_DEF[a]!.enforcedBy}</Chip>
                        : <span className="mute">{ACTION_DEF[a]?.enforcedBy ?? '-'}</span>}
                    </td>
                    <td className="num tnum">{used}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card kicker="STEP 2 · Menu Registry" title="메뉴 정의 — 화면번호 · 카테고리 · 기능 부여" pad={false}>
        <MenusView defs={defs} canEdit={session.role === 'ADMIN'} />
        <div className="callout" style={{ margin: 14 }}>
          <b>초록 칩은 서버가 직접 강제하는 기능입니다.</b> 회수하면 버튼이 사라질 뿐 아니라 API 직접 호출도 403 이 되므로
          여기서는 회수할 수 없습니다(코드 바인딩). 나머지 선언 기능은 <b>클릭해 부여·회수</b>할 수 있으며, 부여하면
          권한 매트릭스에서 그 (화면×기능) 셀이 편집 가능해지고 회수하면 <span className="mono">na</span> 로 잠깁니다.
          <br />
          부여는 매트릭스를 <b>편집 가능하게</b>만 합니다 — 실제 접근은 매트릭스(필요조건)와 코드 규칙(<span className="mono">lib/authz</span>)이 함께 결정하므로 여기 편집으로 권한이 상승하지 않습니다.
        </div>
      </Card>
    </>
  )
}
