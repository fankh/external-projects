import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { PERM_ACTIONS } from '@/lib/perm'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** 기능(Action) 사전 — STEP 1 메뉴기능관리.
 *  화면이 제공할 수 있는 버튼의 종류와 그 의미를 정의한다. (제품안내서 §02) */
const ACTION_DEF: Record<string, { desc: string; enforcedBy: string }> = {
  조회: { desc: '화면 진입과 목록·상세 조회', enforcedBy: '화면 가드 (lib/authz requireRole)' },
  저장: { desc: '신규 등록·수정 저장', enforcedBy: '화면 가드' },
  삭제: { desc: '레코드 삭제·비활성화', enforcedBy: '화면 가드' },
  엑셀: { desc: '그리드 데이터 .xlsx 내보내기', enforcedBy: '서버 — /api/export/[kind]' },
  편입: { desc: '발견 자산을 대장으로 편입 요청', enforcedBy: '서버 — requestOnboard' },
  격리요청: { desc: 'NAC 격리 요청 상신', enforcedBy: '서버 — requestQuarantine' },
  결재: { desc: '상신 건 승인·반려', enforcedBy: '서버 — decide' },
}

export default async function MenusPage() {
  await requireRole('ADMIN')
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

      <Card kicker="STEP 2 · Menu Registry" title="메뉴 정의 — 화면번호 · 카테고리 · 부여된 기능" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>화면번호</th><th className="c">카테고리</th><th>메뉴 (화면)</th><th>경로</th>
                <th>부여된 기능</th><th className="num">기능</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((d) => (
                <tr key={d.code}>
                  <td className="code">{d.code}</td>
                  <td className="c mute">{d.category}</td>
                  <td className="strong">{d.menu}</td>
                  <td className="dim">{d.path}</td>
                  <td style={{ whiteSpace: 'normal' }}>
                    {d.actions.map((a) => (
                      <span key={a} style={{ marginRight: 4, display: 'inline-block' }}>
                        {d.enforced.includes(a)
                          ? <Chip tone="ok">{a}</Chip>
                          : <Chip tone="neutral" bare>{a}</Chip>}
                      </span>
                    ))}
                  </td>
                  <td className="num tnum">{d.actions.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="callout" style={{ margin: 14 }}>
          <b>초록 칩은 서버가 직접 강제하는 기능입니다.</b> 회수하면 버튼이 사라질 뿐 아니라 API 직접 호출도 403 이 됩니다.
          나머지는 선언된 정책으로 화면 가드(<span className="mono">lib/authz</span>)가 구현합니다.
          <br />
          여기에 <b>부여되지 않은 기능</b>은 권한 매트릭스에서 권한을 켜도 의미가 없습니다 — 화면에 그 버튼 자체가 없기 때문입니다.
        </div>
      </Card>
    </>
  )
}
