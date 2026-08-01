'use client'
import { useState, useTransition } from 'react'
import { ROLE_LABEL } from '@/lib/types'
import type { MenuPermission, PermAction, PermCell, PermMenu, Role } from '@/lib/types'
import { setPermission } from './actions'

const ROLES: Role[] = ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN']
/** 클릭 순환 — 허용 → 부분 → 불가 → 허용 */
const NEXT: Record<PermCell, PermCell> = { y: 'p', p: 'n', n: 'y' }
const GLYPH: Record<PermCell, string> = { y: '✓', p: '본인', n: '·' }

export function MatrixEditor(props: {
  rows: MenuPermission[]
  actions: readonly PermAction[]
  /** 실제로 서버가 강제하는 (메뉴 × 기능) 조합 — 나머지는 화면 가드가 담당한다 */
  enforced: string[]
  locked: string[]
  /** 해당 화면이 제공하지 않는 기능 — 권한 부여가 무의미하므로 흐리게 표시 */
  na: string[]
}) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const click = (menu: PermMenu, action: PermAction, role: Role, cur: PermCell) => {
    if (props.locked.includes(`${menu}|${action}|${role}`)) {
      setMsg('Admin 의 권한·정책 조회/저장 권한은 회수할 수 없습니다 (잠금 방지).')
      return
    }
    startTransition(async () => {
      const r = await setPermission(menu, action, role, NEXT[cur])
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
                  const locked = props.locked.includes(key)
                  const enforced = props.enforced.includes(`${row.menu}|${action}`)
                  const na = props.na.includes(`${row.menu}|${action}`)
                  return (
                    <td
                      key={`${r}-${i}`}
                      className={c}
                      title={locked ? '잠금 — 회수 불가'
                        : na ? `${row.menu} 화면에 '${action}' 기능이 없다 (메뉴 관리에서 부여 필요)`
                        : enforced ? `${row.menu} × ${action} — 서버가 강제하는 권한`
                        : '클릭하여 변경 (허용 → 본인 → 불가)'}
                      style={{
                        ...(i === 0 ? { borderLeft: '1px solid var(--line-strong)' } : {}),
                        cursor: locked || pending ? 'default' : 'pointer',
                        opacity: pending ? 0.55 : na ? 0.28 : 1,
                        ...(enforced ? { textDecoration: 'underline', textUnderlineOffset: 3 } : {}),
                      }}
                      onClick={() => !pending && click(row.menu, action, r, c)}
                    >
                      {GLYPH[c]}{locked && <span className="mut" style={{ fontSize: 10 }}> 🔒</span>}
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
