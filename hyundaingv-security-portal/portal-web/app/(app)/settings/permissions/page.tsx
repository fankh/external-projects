import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { NAV } from '@/components/chrome/menus'
import { requireRole } from '@/lib/authz'
import { ROLE_LABEL, type Role } from '@/lib/types'

const ROLES: Role[] = ['USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN']

export default async function PermissionsPage() {
  await requireRole('ADMIN')
  const items = NAV.flatMap((g) => g.items.map((i) => ({ group: g.label, ...i })))

  return (
    <>
      <ScreenHeader kicker="환경설정" title="메뉴권한"
        desc="권한그룹 × 메뉴 매트릭스 — 내비 노출·서버사이드 가드·스모크 스위트가 모두 이 단일 원천(menus.ts)을 따른다." />

      <div className="stat-row">
        <Stat value={items.length} label="메뉴" />
        <Stat value={ROLES.length} label="권한그룹" />
        <Stat value={items.filter((i) => i.roles.length === ROLES.length).length} label="전체 공개 메뉴" />
        <Stat value={items.filter((i) => i.roles.length === 1).length} label="Admin 전용" />
      </div>

      <Card title="권한 매트릭스" kicker="Role × Menu" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl mx">
            <thead>
              <tr>
                <th>도메인</th><th>메뉴</th>
                {ROLES.map((r) => <th key={r} className="c">{ROLE_LABEL[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.href}>
                  <td className="mut">{i.group}</td>
                  <td className="strong">{i.label} <span className="mut mono" style={{ fontSize: 10.5 }}>{i.href}</span></td>
                  {ROLES.map((r) => (
                    <td key={r} className={`c ${i.roles.includes(r) ? 'y' : 'n'}`}>{i.roles.includes(r) ? '●' : '－'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="callout">
        <b>최소권한 모델</b> — 화면 숨김과 별개로 모든 경로는 서버사이드 가드(requireRole)로 직접 URL
        진입을 차단하며, 스모크 스위트가 라우트 × 권한 매트릭스 전수를 검증한다.
      </div>
    </>
  )
}
