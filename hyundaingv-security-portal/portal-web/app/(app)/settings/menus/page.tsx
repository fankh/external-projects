import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { NAV } from '@/components/chrome/menus'
import { requireRole } from '@/lib/authz'
import { SCREENS } from '@/lib/screens'
import { ROLE_LABEL } from '@/lib/types'

export default async function MenusPage() {
  await requireRole('ADMIN')
  const items = NAV.flatMap((g) => g.items.map((i) => ({ group: g.label, hue: g.hue, ...i })))
  const stubs = new Set(Object.keys(SCREENS))

  return (
    <>
      <ScreenHeader kicker="환경설정" title="메뉴 · 기능 관리"
        desc="10대 업무 도메인 × 메뉴 체계 — 화면번호(경로)·권한그룹·구현 상태를 관리한다." />

      <div className="stat-row">
        <Stat value={NAV.length} label="LV1 도메인" />
        <Stat value={items.length} label="LV2 메뉴" />
        <Stat value={items.length - stubs.size} label="구현 화면" />
        <Stat value={stubs.size} label="스텁" tone={stubs.size > 0 ? 'warn' : undefined} />
      </div>

      <Card title="메뉴 체계" kicker="Menu Tree" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>도메인 (LV1)</th><th>메뉴 (LV2)</th><th>화면번호</th><th>권한그룹</th><th>상태</th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.href}>
                  <td><span className="kicker" style={{ color: i.hue }}>{i.group}</span></td>
                  <td className="strong">{i.ico} {i.label}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{i.href}</td>
                  <td>{i.roles.map((r) => ROLE_LABEL[r]).join(' · ')}</td>
                  <td>{stubs.has(i.href) ? <Chip tone="warn" bare>스텁</Chip> : <Chip tone="ok" bare>구현</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="callout">
        <b>단일 원천</b> — 메뉴 체계·권한은 <span className="mono">components/chrome/menus.ts</span> 하나로
        내비 렌더링·서버 가드·권한 매트릭스·스모크가 함께 움직인다. 메뉴 추가는 이 파일과 화면 구현으로 완결된다.
      </div>
    </>
  )
}
