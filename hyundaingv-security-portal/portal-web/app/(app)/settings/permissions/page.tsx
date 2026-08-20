import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { NAV, SCREEN_ACTIONS, ACTION_LABEL, TITLE_BY_HREF, type ActionKey } from '@/components/chrome/menus'
import { audit } from '@/lib/audit'
import { effectiveActionRoles, effectiveRoles, requireMenu } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { ROLE_LABEL, type Role } from '@/lib/types'

const ROLES: Role[] = ['USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN']

/** 메뉴권한 토글 (요구사항 72행) — 기본 권한(menus.ts)의 축소/복원만 가능하다.
 *  기본에 없는 권한은 부여할 수 없고(권한 상승 차단), ADMIN 은 잠금 방지를 위해 제한 불가. */
async function toggleMenuRole(formData: FormData) {
  'use server'
  const me = await requireMenu('/settings/permissions')
  const href = String(formData.get('href') ?? '')
  const role = String(formData.get('role') ?? '') as Role
  const item = NAV.flatMap((g) => g.items).find((i) => i.href === href)
  if (!item || role === 'ADMIN' || !ROLES.includes(role) || !item.roles.includes(role)) return
  const s = getStore()
  const current = s.menuOverrides[href] ?? item.roles
  const restricted = current.includes(role)
    ? current.filter((r) => r !== role)
    : [...current, role]
  // 기본과 같아지면 오버라이드를 걷어 기본 상태로 되돌린다
  if (item.roles.every((r) => restricted.includes(r))) {
    delete s.menuOverrides[href]
  } else {
    s.menuOverrides[href] = restricted
  }
  audit(me.name, '메뉴권한 변경', `${href} ${ROLE_LABEL[role]}: ${current.includes(role) ? '제한' : '복원'}`)
  revalidatePath('/', 'layout')
}

/** 기능(Action) 권한 토글 (요구사항 69·71행) — SCREEN_ACTIONS 기본의 축소/복원만. 기본에 없는 역할은 부여 불가,
 *  ADMIN 은 제한 불가. requireAction 이 같은 SCREEN_ACTIONS·actionOverrides 를 읽으므로 토글 즉시 강제에 반영된다. */
async function toggleActionPerm(formData: FormData) {
  'use server'
  const me = await requireMenu('/settings/permissions')
  const href = String(formData.get('href') ?? '')
  const action = String(formData.get('action') ?? '') as ActionKey
  const role = String(formData.get('role') ?? '') as Role
  const base = SCREEN_ACTIONS[href]?.[action]
  if (!base || role === 'ADMIN' || !ROLES.includes(role) || !base.includes(role)) return
  const s = getStore()
  const key = `${href}#${action}`
  const current = s.actionOverrides[key] ?? base
  const restricted = current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
  if (base.every((r) => restricted.includes(r))) delete s.actionOverrides[key]
  else s.actionOverrides[key] = restricted
  audit(me.name, '메뉴권한 변경', `${href} ${ACTION_LABEL[action]} ${ROLE_LABEL[role]}: ${current.includes(role) ? '제한' : '복원'}`)
  revalidatePath('/', 'layout')
}

export default async function PermissionsPage() {
  await requireMenu('/settings/permissions')
  const s = getStore()
  const items = NAV.flatMap((g) => g.items.map((i) => ({ group: g.label, ...i })))
  const restrictedCount = Object.keys(s.menuOverrides).length
  const actionRestrictedCount = Object.keys(s.actionOverrides).length

  return (
    <>
      <ScreenHeader kicker="환경설정" title="메뉴권한"
        desc="권한그룹 × 메뉴(화면) 및 × 기능(버튼) 매트릭스 — 기본 권한(menus.ts·SCREEN_ACTIONS)은 코드가 단일 원천이고, 여기서는 런타임 제한·복원만 한다 (축소 전용 · 권한 상승 불가)." />

      <div className="stat-row">
        <Stat value={items.length} label="메뉴" />
        <Stat value={ROLES.length} label="권한그룹" />
        <Stat value={restrictedCount} label="메뉴 제한" tone={restrictedCount > 0 ? 'warn' : undefined} note="화면 단위" />
        <Stat value={actionRestrictedCount} label="기능 제한" tone={actionRestrictedCount > 0 ? 'warn' : undefined} note="버튼 단위" />
      </div>

      <Card title="권한 매트릭스" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl mx">
            <thead>
              <tr>
                <th>도메인</th><th>메뉴</th>
                {ROLES.map((r) => <th key={r} className="c">{ROLE_LABEL[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const eff = effectiveRoles(i.href)
                return (
                  <tr key={i.href}>
                    <td className="mut">{i.group}</td>
                    <td className="strong">{i.label} <span className="mut mono" style={{ fontSize: 10.5 }}>{i.href}</span></td>
                    {ROLES.map((r) => {
                      if (!i.roles.includes(r)) return <td key={r} className="c n">－</td>
                      if (r === 'ADMIN') return <td key={r} className="c y" title="ADMIN 은 잠금 방지를 위해 제한 불가">●</td>
                      const active = eff.includes(r)
                      return (
                        <td key={r} className={`c ${active ? 'y' : 'n'}`}>
                          <form action={toggleMenuRole} style={{ display: 'inline' }}>
                            <input type="hidden" name="href" value={i.href} />
                            <input type="hidden" name="role" value={r} />
                            <button type="submit" className="btn sm" style={{ minWidth: 44 }}
                              title={active ? '클릭 시 이 권한그룹의 접근을 제한한다' : '클릭 시 기본 권한으로 복원한다'}>
                              {active ? '●' : '○ 제한됨'}
                            </button>
                          </form>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="기능(Action) 권한 매트릭스" pad={false}
        actions={<span className="mut" style={{ fontSize: 11 }}>화면 × 기능(버튼) 단위 — 조회는 항상 허용, 쓰기 기능만 제한</span>}>
        <div className="tbl-wrap">
          <table className="tbl mx">
            <thead>
              <tr>
                <th>메뉴</th><th>기능</th>
                {ROLES.map((r) => <th key={r} className="c">{ROLE_LABEL[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(SCREEN_ACTIONS).flatMap(([href, acts]) =>
                (Object.keys(acts) as ActionKey[]).map((action) => {
                  const base = acts[action]!
                  const eff = effectiveActionRoles(href, action)
                  const title = TITLE_BY_HREF[href]?.title ?? href
                  return (
                    <tr key={`${href}#${action}`}>
                      <td className="strong">{title} <span className="mut mono" style={{ fontSize: 10.5 }}>{href}</span></td>
                      <td><Chip tone="neutral" bare>{ACTION_LABEL[action]}</Chip></td>
                      {ROLES.map((r) => {
                        if (!base.includes(r)) return <td key={r} className="c n">－</td>
                        if (r === 'ADMIN') return <td key={r} className="c y" title="ADMIN 은 잠금 방지를 위해 제한 불가">●</td>
                        const active = eff.includes(r)
                        return (
                          <td key={r} className={`c ${active ? 'y' : 'n'}`}>
                            <form action={toggleActionPerm} style={{ display: 'inline' }}>
                              <input type="hidden" name="href" value={href} />
                              <input type="hidden" name="action" value={action} />
                              <input type="hidden" name="role" value={r} />
                              <button type="submit" className="btn sm" style={{ minWidth: 44 }}
                                title={active ? '클릭 시 이 권한그룹의 해당 기능을 제한한다' : '클릭 시 기본으로 복원한다'}>
                                {active ? '●' : '○ 제한됨'}
                              </button>
                            </form>
                          </td>
                        )
                      })}
                    </tr>
                  )
                }))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="callout">
        <b>최소권한 모델</b> — 화면 숨김과 별개로 모든 경로는 서버사이드 가드(requireMenu — menus.ts 기본
        권한 ∩ 런타임 제한)로 직접 URL 진입을 차단하며, 스모크 스위트가 라우트 × 권한 매트릭스 전수를
        검증한다. 제한은 즉시 내비와 가드에 반영되고 감사 이력에 남는다.
      </div>
    </>
  )
}
