'use client'

/** 사용자·권한 관리 (N4 복구) — 사용자 대장(등록·잠금해제·레벨·활성) + 권한 매트릭스(셀 토글·역할 CRUD). */
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip, GroupBox } from '@/components/controls'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import {
  changeUserLevel, createRole, createUser, deleteRole,
  saveRolePermissions, setUserActive, unlockUser, updateUser, type ActState,
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
  const { t } = useI18n()
  const [regSt, regAction, regPending] = useActionState(createUser, {} as ActState)
  const [selLogin, setSelLogin] = useState<string | null>(null)
  const [level, setLevel] = useState('GENERAL')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.login === selLogin) ?? null
  // F2 이식 — 정보 수정 다이얼로그 (이름·부서·이메일, 폼 액션)
  const [editOpen, setEditOpen] = useState(false)
  const [editSt, editAction, editPending] = useActionState(updateUser, {} as ActState)
  useEffect(() => { if (editSt.ok) setEditOpen(false) }, [editSt.ok])

  const cols: GridColumn<UserRow>[] = [
    { key: 'login', header: 'ID', width: 84, code: true, render: (r) => r.login },
    { key: 'name', header: t('access.name', '이름'), width: 90, render: (r) => r.name },
    { key: 'dept', header: t('dash.dept', '부서'), width: 90, align: 'center', render: (r) => r.dept || '—' },
    { key: 'level', header: t('access.level', '레벨'), width: 76, align: 'center', sortValue: (r) => r.level, render: (r) => <Chip tone={r.level === 'ADMIN' ? 'warn' : 'info'}>{r.level}</Chip> },
    { key: 'role', header: t('access.role', '역할'), width: 100, render: (r) => r.role || '—' },
    { key: 'status', header: t('prj.status', '상태'), width: 76, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={ST_TONE[r.status] ?? 'info'}>{r.status}</Chip> },
    { key: 'email', header: 'Email', render: (r) => r.email || '—' },
  ]

  return (
    <GroupBox title={`${t('access.userLedger', '사용자 대장')} — ${rows.length}${t('access.personUnit', '명')}`} noPad style={{ flex: 1.3, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 4, padding: 4, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
        <RegisterModal trigger={t('access.addUser', '＋ 사용자 등록')} title={t('access.userRegTitle', '사용자 등록')} ok={regSt.ok}>
          {() => (
            <form action={regAction} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
              <label>{t('access.loginId', '로그인 ID')}</label>
              <input className="in req" name="login" placeholder={t('access.loginIdPh', '로그인 ID')} autoFocus />
              <label>{t('access.name', '이름')}</label>
              <input className="in req" name="name" />
              <label>{t('dash.dept', '부서')}</label>
              <input className="in" name="department" />
              <label>Email</label>
              <input className="in" name="email" placeholder="email" />
              <label>{t('access.level', '레벨')}</label>
              <select className="in" name="level" defaultValue="GENERAL">
                {LEVELS.map((l) => <option key={l}>{l}</option>)}
              </select>
              <label>{t('access.initPw', '초기 비밀번호')}</label>
              <input className="in req" name="initialPassword" />
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
                {regSt.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{regSt.error}</span> : null}
                <button className="b run" type="submit" disabled={regPending}>{t('common.register', '등록')}</button>
              </div>
            </form>
          )}
        </RegisterModal>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, borderBottom: '1px solid var(--line)' }}>
        <span style={{ color: 'var(--txt-dim)' }}>{sel ? `${t('access.selected', '선택')} ${sel.login} (${sel.status})` : t('access.clickSelect', '행 클릭=선택')}</span>
        <button className="b" disabled={pending || !sel || sel.status !== 'LOCKED'}
          onClick={() => sel && start(async () => setSt(await unlockUser(sel.login)))}>{t('access.unlock', '잠금 해제')}</button>
        <button className="b" data-user-edit-open disabled={!sel}
          onClick={() => setEditOpen(true)}>{t('access.editUser', '정보 수정')}</button>
        <select className="in" data-level-select style={{ width: 86 }} value={level} onChange={(e) => setLevel(e.target.value)}>
          {LEVELS.map((l) => <option key={l}>{l}</option>)}
        </select>
        <button className="b" data-level-change disabled={pending || !sel}
          onClick={() => sel && start(async () => setSt(await changeUserLevel(sel.login, level)))}>{t('access.levelChange', '레벨 변경')}</button>
        <button className="b" disabled={pending || !sel}
          onClick={() => sel && start(async () => setSt(await setUserActive(sel.login, sel.status === 'DISABLED')))}>
          {sel?.status === 'DISABLED' ? t('access.reactivate', '재활성') : t('access.inactivate', '비활성')}</button>
        {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-users" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.login} selectedKey={selLogin ?? undefined}
          onRowClick={(r) => setSelLogin(r.login)} emptyText={t('access.emptyUsers', '사용자가 없습니다')} />
      </div>
      {/* F2 이식 — 정보 수정 다이얼로그 (이름·부서·이메일) */}
      {editOpen && sel ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setEditOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditOpen(false) }}>
          <form action={editAction} className="gb" data-user-edit key={sel.login}
            style={{ width: 320, padding: 12, background: '#fff', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('access.editUser', '정보 수정')} — {sel.login}</div>
            <input type="hidden" name="login" value={sel.login} />
            <div className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
              <label>{t('access.name', '이름')}</label>
              <input className="in req" name="name" aria-label="수정 이름" defaultValue={sel.name} autoFocus />
              <label>{t('dash.dept', '부서')}</label>
              <input className="in" name="department" aria-label="수정 부서" defaultValue={sel.dept || ''} />
              <label>Email</label>
              <input className="in" name="email" aria-label="수정 이메일" defaultValue={sel.email || ''} />
            </div>
            {editSt.error ? <div style={{ color: 'var(--err)' }}>{editSt.error}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button className="b" type="button" onClick={() => setEditOpen(false)}>{t('common.cancel', '취소')}</button>
              <button className="b pri" type="submit" disabled={editPending}>{t('common.save', '저장')}</button>
            </div>
          </form>
        </div>
      ) : null}
    </GroupBox>
  )
}

const CYCLE: Record<string, string> = { NONE: 'READ', READ: 'WRITE', WRITE: 'NONE' }

export function RoleMatrix({ roles }: { roles: RoleRow[] }) {
  const { t } = useI18n()
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
    <GroupBox title={`${t('access.permMatrix', '권한 매트릭스')} — ${t('access.roleWord', '역할')} ${roles.length} × ${t('access.assetWord', '자산')} ${permKeys.length} (${t('access.cellCycle', '셀 클릭 = NONE→READ→WRITE')})`} noPad
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <table className="g" style={{ width: '100%' }}>
          <thead><tr><th style={{ minWidth: 110 }}>{t('access.assetRole', '자산 \\ 역할')}</th>
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
        })}>{t('access.saveChanges', '변경 저장')} ({dirty.size}{t('access.roleWord', '역할')})</button>
        <span className="sep" />
        <input className="in" style={{ width: 100 }} placeholder={t('access.newRolePh', '새 역할명')} value={newRole} onChange={(e) => setNewRole(e.target.value)} />
        <button className="b" disabled={pending} onClick={() => start(async () => {
          const r = await createRole(newRole, ''); setSt(r); if (r.ok) setNewRole('')
        })}>{t('access.addRole', '＋ 역할')}</button>
        <button className="b" disabled={pending || !newRole.trim() || BUILTIN.has(newRole.trim())}
          title={t('access.deleteRoleTip', '입력한 이름의 커스텀 역할 삭제')}
          onClick={() => start(async () => { const r = await deleteRole(newRole.trim()); setSt(r); if (r.ok) setNewRole('') })}>{t('access.deleteRole', '역할 삭제')}</button>
        {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
    </GroupBox>
  )
}
