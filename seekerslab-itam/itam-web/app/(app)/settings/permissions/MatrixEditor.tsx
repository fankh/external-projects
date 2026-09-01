'use client'
import { useState, useTransition } from 'react'
import { ROLE_LABEL } from '@/lib/types'
import type { MenuPermission, PermAction, PermCell, PermMenu, Role } from '@/lib/types'
import { setPermission } from './actions'

const ROLES: Role[] = ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN']
/** 클릭 순환 — 허용 → (본인) → 불가 → 허용. '본인'은 범위를 좁히는 구현이 있는 칸에서만 거친다:
 *  구현 없는 칸의 'p' 는 can() 을 그대로 통과해 허용과 똑같이 동작하므로, 고를 수 있게 두면
 *  관리자가 좁혔다고 믿는 사이 전사가 열린다(lib/perm.ts PARTIAL_SCOPES). */
const nextOf = (cur: PermCell, canPartial: boolean): PermCell =>
  cur === 'y' ? (canPartial ? 'p' : 'n') : cur === 'p' ? 'n' : 'y'
const GLYPH: Record<PermCell, string> = { y: '✓', p: '본인', n: '·' }

export function MatrixEditor(props: {
  rows: MenuPermission[]
  actions: readonly PermAction[]
  /** 실제로 서버가 강제하는 (메뉴 × 기능) 조합 — 나머지는 화면 가드가 담당한다 */
  enforced: string[]
  locked: Record<string, string>
  /** 해당 화면이 제공하지 않는 기능 — 권한 부여가 무의미하므로 흐리게 표시 */
  na: string[]
  /** '본인 범위'를 실제로 좁히는 구현이 있는 칸(`메뉴|기능|권한그룹`) — 여기서만 순환이 '본인'을 거친다 */
  partial: string[]
  /** 그 칸이 좁히는 범위 설명 — 툴팁으로 보여 '무엇이 좁혀지는지'를 밝힌다 */
  partialScope: Record<string, string>
}) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const click = (menu: PermMenu, action: PermAction, role: Role, cur: PermCell) => {
    const key = `${menu}|${action}|${role}`
    if (props.locked[key]) {
      setMsg(props.locked[key])
      return
    }
    startTransition(async () => {
      const r = await setPermission(menu, action, role, nextOf(cur, props.partial.includes(key)))
      if (r.message) setMsg(r.message)
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl mx">
          <thead>
            <tr>
              <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>메뉴 (화면)</th>
              {ROLES.map((r) => (
                <th key={r} colSpan={props.actions.length} className="c" style={{ borderLeft: '1px solid var(--line-strong)' }}>{ROLE_LABEL[r]}</th>
              ))}
            </tr>
            <tr>
              {ROLES.flatMap((r) => props.actions.map((a, i) => (
                <th key={`${r}-${a}`} className="c" style={i === 0 ? { borderLeft: '1px solid var(--line-strong)' } : undefined}>{a}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={row.menu}>
                <td className="strong">{row.menu}</td>
                {ROLES.flatMap((r) => row.cells[r].map((c, i) => {
                  const action = props.actions[i]
                  const key = `${row.menu}|${action}|${r}`
                  const lockWhy = props.locked[key]
                  const locked = Boolean(lockWhy)
                  const enforced = props.enforced.includes(`${row.menu}|${action}`)
                  const na = props.na.includes(`${row.menu}|${action}`)
                  const canPartial = props.partial.includes(key)
                  return (
                    <td
                      key={`${r}-${i}`}
                      className={c}
                      // 순환 힌트는 어느 칸에나 붙는다 — '본인'을 거치는지는 그 칸에 범위를 좁히는 구현이
                      //  있는지로만 갈린다(lib/types.ts PARTIAL_SCOPES). 강제 안내와 겹쳐도 힌트를 지우지 않는다.
                      title={locked ? lockWhy
                        : na ? `${row.menu} 화면에 '${action}' 기능이 없다 (메뉴 관리에서 부여 필요)`
                        : [
                            canPartial ? `본인 범위 지정 가능 — ${props.partialScope[key]}` : '',
                            enforced ? `${row.menu} × ${action} — 서버가 강제하는 권한` : '',
                            canPartial
                              ? '클릭하여 변경 (허용 → 본인 → 불가)'
                              : '클릭하여 변경 (허용 → 불가) — 이 칸은 본인 범위를 좁히는 구현이 없어 본인을 건너뜁니다',
                          ].filter(Boolean).join(' · ')}
                      style={{
                        ...(i === 0 ? { borderLeft: '1px solid var(--line-strong)' } : {}),
                        cursor: locked || na || pending ? 'default' : 'pointer',
                        opacity: pending ? 0.55 : na ? 0.28 : 1,
                        ...(enforced ? { textDecoration: 'underline', textUnderlineOffset: 3 } : {}),
                      }}
                      //  na 칸은 누를 수 없다 — 메뉴 관리(STEP 2)가 "회수하면 매트릭스에서 na 로 잠깁니다"
                      //   라고 약속하는데 그동안 클릭이 그대로 먹혔다. 그 화면에 없는 기능에 값을 넣으면
                      //   뜻이 없을뿐더러, 나중에 STEP 2 에서 부여하는 순간 살아나는 잠재 권한이 된다.
                      //   서버(setPermission)도 같은 이유로 막지만 여기서 먼저 유혹을 없앤다.
                      onClick={() => !pending && !na && click(row.menu, action, r, c)}
                    >
                      {/* na 칸은 저장된 값 대신 해당 없음을 그린다 — 그 화면에 없는 기능이라 y/n 어느 쪽도
                          사실이 아니다. 흐린 ✓ 를 그대로 두면 관리자는 주지도 않은 허용을 읽게 된다. */}
                      {na ? <span className="mut">–</span> : GLYPH[c]}{locked && <span className="mut" style={{ fontSize: 10 }}> 🔒</span>}
                    </td>
                  )
                }))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
