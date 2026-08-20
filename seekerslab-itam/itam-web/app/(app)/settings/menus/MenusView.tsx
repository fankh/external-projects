'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import type { MenuDef, PermAction } from '@/lib/types'
import { toggleMenuAction } from '../actions'

const PERM_ACTIONS: PermAction[] = ['조회', '저장', '삭제', '엑셀', '편입', '격리요청', '결재']

/** STEP2 메뉴 정의 편집 — 화면별 기능(부여된 기능)을 토글한다. 서버 강제(enforced)는 초록·잠금(회수 불가),
 *  나머지 선언 기능은 클릭해 부여·회수. 부여하면 권한 매트릭스에서 그 셀이 편집 가능해지고 회수하면 na 로 잠긴다.
 *  (그동안 STEP2 는 조회 전용이라 매트릭스의 'na → 메뉴 관리에서 부여 필요' 안내가 dead-end 였다.) */
export function MenusView({ defs, canEdit }: { defs: MenuDef[]; canEdit: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const toggle = (code: string, action: PermAction) =>
    startTransition(async () => setMsg((await toggleMenuAction(code, action)).message))

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>화면번호</th><th className="c">카테고리</th><th>메뉴 (화면)</th><th>경로</th>
              <th>부여된 기능 {canEdit && <span className="mut" style={{ fontWeight: 400 }}>· 클릭해 부여·회수</span>}</th><th className="num">기능</th>
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
                  <span className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {PERM_ACTIONS.map((a) => {
                      const enforced = d.enforced.includes(a)
                      const on = d.actions.includes(a)
                      // 서버 강제 기능 — 초록·잠금(코드 바인딩이라 회수 불가)
                      if (enforced) return <span key={a} title="서버가 직접 강제 — 회수 불가(코드 바인딩·API 403)"><Chip tone="ok">{a}</Chip></span>
                      // 조회 전용(Admin 아님)은 부여된 기능만 표기
                      if (!canEdit) return on ? <Chip key={a} tone="neutral" bare>{a}</Chip> : null
                      return (
                        <button key={a} className={`btn sm ${on ? '' : 'ghost'}`} disabled={pending}
                          onClick={() => toggle(d.code, a)}
                          title={on ? `'${a}' 회수 — 권한 매트릭스에서 na 로 잠깁니다` : `'${a}' 부여 — 권한 매트릭스에서 편집 가능해집니다`}>
                          {on ? `✓ ${a}` : a}
                        </button>
                      )
                    })}
                  </span>
                </td>
                <td className="num tnum">{d.actions.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
