'use client'

/** 사용자·권한 관리 (N4 복구) — 사용자 대장(등록·잠금해제·레벨·활성) + 권한 매트릭스(셀 토글·역할 CRUD). */
import { useActionState, useMemo, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip, GroupBox } from '@/components/controls'
import {
  changeUserLevel, createRole, createUser, deleteRole,
  saveRolePermissions, setUserActive, unlockUser, type ActState,
} from './actions'

export interface UserRow {
  login: string; name: string; dept: string; level: string
  role: string; status: 'ACTIVE' | 'LOCKED' | 'DISABLED'; email?: string
}
export interface RoleRow { name: string; description: string; permissions?: Record<string, string> }

const LEVELS = ['GENERAL', 'SETUP', 'ADMIN', 'PLATFORM']
const BUILTIN = new Set(['PLATFORM', 'ADMIN', 'SETUP', 'GENERAL'])
const ST_TONE: Record<string, 'ok' | 'warn' | 'err'> = { ACTIVE: 'ok', LOCKED: 'err', DISABLED: 'warn' }

export function UsersPanel({ rows }: { rows: UserRow[] }) {
  const [regSt, regAction, regPending] = useActionState(createUser, {} as ActState)
  const [selLogin, setSelLogin] = useState<string | null>(null)
  const [level, setLevel] = useState('GENERAL')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.login === selLogin) ?? null

  const cols: GridColumn<UserRow>[] = [
    { key: 'login', header: 'ID', width: 84, code: true, render: (r) => r.login },
    { key: 'name', header: '이름', width: 90, render: (r) => r.name },
    { key: 'dept', header: '부서', width: 90, align: 'center', render: (r) => r.dept || '—' },
    { key: 'level', header: '레벨', width: 76, align: 'center', sortValue: (r) => r.level, render: (r) => <Chip tone={r.level === 'ADMIN' ? 'warn' : 'info'}>{r.level}</Chip> },
    { key: 'role', header: '역할', width: 100, render: (r) => r.role || '—' },
    { key: 'status', header: '상태', width: 76, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={ST_TONE[r.status] ?? 'info'}>{r.status}</Chip> },
    { key: 'email', header: 'Email', render: (r) => r.email || '—' },
  ]

  return (
    <GroupBox title={`사용자 대장 — ${rows.length}명`} noPad style={{ flex: 1.3, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <form action={regAction} style={{ display: 'flex', gap: 4, padding: 4, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
        <input className="in req" name="login" placeholder="로그인 ID" style={{ width: 84 }} />
        <input className="in req" name="name" placeholder="이름" style={{ width: 84 }} />
        <input className="in" name="department" placeholder="부서" style={{ width: 76 }} />
        <input className="in" name="email" placeholder="email" style={{ width: 120 }} />
        <select className="in" name="level" defaultValue="GENERAL" style={{ width: 86 }}>
          {LEVELS.map((l) => <option key={l}>{l}</option>)}
        </select>
        <input className="in req" name="initialPassword" placeholder="초기 비밀번호" style={{ width: 96 }} />
        <button className="b run" type="submit" disabled={regPending}>＋ 사용자 등록</button>
        {regSt.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{regSt.error}</span> : null}
        {regSt.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{regSt.ok}</span> : null}
      </form>
      <div style={{ display: 'flex', gap: 4, padding: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, borderBottom: '1px solid var(--line)' }}>
        <span style={{ color: 'var(--txt-dim)' }}>{sel ? `선택 ${sel.login} (${sel.status})` : '행 클릭=선택'}</span>
        <button className="b" disabled={pending || !sel || sel.status !== 'LOCKED'}
          onClick={() => sel && start(async () => setSt(await unlockUser(sel.login)))}>잠금 해제</button>
        <select className="in" style={{ width: 86 }} value={level} onChange={(e) => setLevel(e.target.value)}>
          {LEVELS.map((l) => <option key={l}>{l}</option>)}
        </select>
        <button className="b" disabled={pending || !sel}
          onClick={() => sel && start(async () => setSt(await changeUserLevel(sel.login, level)))}>레벨 변경</button>
        <button className="b" disabled={pending || !sel}
          onClick={() => sel && start(async () => setSt(await setUserActive(sel.login, sel.status === 'DISABLED')))}>
          {sel?.status === 'DISABLED' ? '재활성' : '비활성'}</button>
        {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-users" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.login} selectedKey={selLogin ?? undefined}
          onRowClick={(r) => setSelLogin(r.login)} emptyText="사용자가 없습니다" />
      </div>
    </GroupBox>
  )
}

const CYCLE: Record<string, string> = { NONE: 'READ', READ: 'WRITE', WRITE: 'NONE' }

export function RoleMatrix({ roles }: { roles: RoleRow[] }) {
  const [local, setLocal] = useState<Record<string, Record<string, string>>>(
    () => Object.fromEntries(roles.map((r) => [r.name, { ...(r.permissions ?? {}) }])))
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [newRole, setNewRole] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()

  const permKeys = useMemo(() => {
    const keys = new Set<string>()
    roles.forEach((r) => Object.keys(r.permissions ?? {}).forEach((k) => keys.add(k)))
    return [...keys].sort()
  }, [roles])

  const toggle = (role: string, key: string) => {
    setLocal((cur) => {
      const next = { ...cur, [role]: { ...cur[role], [key]: CYCLE[cur[role]?.[key] ?? 'NONE'] } }
      return next
    })
    setDirty((d) => new Set(d).add(role))
  }

  return (
    <GroupBox title={`권한 매트릭스 — 역할 ${roles.length} × 자산 ${permKeys.length} (셀 클릭 = NONE→READ→WRITE)`} noPad
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <table className="g" style={{ width: '100%' }}>
          <thead><tr><th style={{ minWidth: 110 }}>자산 \ 역할</th>
            {roles.map((r) => <th key={r.name}>{r.name}{!BUILTIN.has(r.name) ? ' ✎' : ''}</th>)}</tr></thead>
          <tbody>{permKeys.map((k) => (
            <tr key={k}>
              <td className="code">{k}</td>
              {roles.map((r) => {
                const v = local[r.name]?.[k] ?? 'NONE'
                return <td key={r.name} className="c" style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => toggle(r.name, k)}>
                  <Chip tone={v === 'WRITE' ? 'ok' : v === 'READ' ? 'info' : 'warn'}>{v}</Chip>
                </td>
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, borderTop: '1px solid var(--line)' }}>
        <button className="b run" disabled={pending || dirty.size === 0} onClick={() => start(async () => {
          for (const role of dirty) {
            const r = await saveRolePermissions(role, local[role] ?? {})
            setSt(r)
            if (r.error) return
          }
          setDirty(new Set())
        })}>변경 저장 ({dirty.size}역할)</button>
        <span className="sep" />
        <input className="in" style={{ width: 100 }} placeholder="새 역할명" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
        <button className="b" disabled={pending} onClick={() => start(async () => {
          const r = await createRole(newRole, ''); setSt(r); if (r.ok) setNewRole('')
        })}>＋ 역할</button>
        <button className="b" disabled={pending || !newRole.trim() || BUILTIN.has(newRole.trim())}
          title="입력한 이름의 커스텀 역할 삭제"
          onClick={() => start(async () => { const r = await deleteRole(newRole.trim()); setSt(r); if (r.ok) setNewRole('') })}>역할 삭제</button>
        {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
    </GroupBox>
  )
}
