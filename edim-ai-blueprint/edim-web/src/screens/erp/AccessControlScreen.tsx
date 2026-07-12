/** M-14-6 사용자·권한 관리 (W-23, 슬라이드 57·72) — 레벨 4단계 × 리소스 4유형 ×
 *  액션 4종 (권한승인정의서 모델) · 감사 기록. */
import { useEffect, useMemo, useState } from 'react'
import { type UserRow } from '../../api/mock/dataMore'
import { historyService, menuService, roleService, sysService, userService, type HistoryRow, type RoleRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { AccessDenied, usePermission } from '../../shell/PermissionContext'
import { useEscapeClose } from '../../shell/useEscapeClose'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function AccessControlScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const perm = usePermission()
  const [users, setUsers] = useState<UserRow[]>([])
  const [dept, setDept] = useState('전체')
  const [levelFilter, setLevelFilter] = useState('전체')
  const [query, setQuery] = useState('')
  const [selLogin, setSelLogin] = useState<string | null>(null)
  const [showReg, setShowReg] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  // C11 — 감사 로그 실데이터 (sys_history, 계정·보안 액션 필터)
  const [audit, setAudit] = useState<HistoryRow[]>([])
  const SEC_ACTION = /LOGIN|LOCK|UNLOCK|PW_CHANGE|LEVEL|PERM|ROLE|USER_|INVITE|ACTIVAT|STATUS/i
  const loadAudit = () => {
    if (!perm.canReadAdmin) return
    void historyService.recent().then((rows) => {
      const acc = rows.filter((r) => r.target === 'sys_user' || SEC_ACTION.test(r.action))
      setAudit((acc.length ? acc : rows).slice(0, 12))
    })
  }
  const load = () => {
    if (!perm.canReadAdmin) return   // F3 — GENERAL 은 GET /users 자체가 403 (진입 가드로 안내)
    void userService.list().then((rows) => {
      setUsers(rows)
      setSelLogin((cur) => cur ?? rows[0]?.login ?? null)
    })
    loadAudit()   // 계정 작업(재조회/변경) 시 감사 로그 동반 갱신
  }
  useEffect(load, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // 권한 매트릭스 실데이터 (B14 — sys_role/sys_role_permission)
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [rbacOffline, setRbacOffline] = useState(false)
  const loadRoles = () => {
    if (!perm.canReadAdmin) return
    void roleService.list().then((r) => {
      if (r === null) setRbacOffline(true)
      else { setRbacOffline(false); setRoles(r) }
    })
  }
  useEffect(() => { loadRoles() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const RESOURCES = [
    'cpq-selection', 'plm-design', 'code-subcode', 'code-datatable',
    'tbx-macro', 'erp-price', 'com-approval', 'erp-access',
  ]
  const CYCLE: Record<string, string> = { NONE: 'READ', READ: 'WRITE', WRITE: 'NONE' }
  const cellOf = (role: RoleRow, key: string): string =>
    (role.permissions['*'] === 'WRITE' ? '*' : (role.permissions[key] ?? 'NONE'))
  const clickCell = (role: RoleRow, key: string) => {
    if (role.permissions['*'] === 'WRITE') {
      shell.setStatusMsg(`${role.name} — 전체 권한(와일드카드) 역할은 셀 편집 불가`)
      return
    }
    const next = CYCLE[cellOf(role, key)]
    void roleService.setPermissions(role.name, { [key]: next })
      .then((ok) => {
        if (!ok) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>권한 변경 불가 — 백엔드 연결 필요</span>)
          return
        }
        loadRoles()
        shell.setStatusMsg(`권한 변경 ✓ — ${role.name}/${key} → ${next} (sys_role_permission · PERM_CHANGE 감사)`)
      })
  }

  const rows = useMemo(
    () => users.filter((u) => (dept === '전체' || u.dept === dept)
      && (levelFilter === '전체' || u.level === levelFilter)
      && (!query.trim()
        || u.login.toLowerCase().includes(query.trim().toLowerCase())
        || u.name.toLowerCase().includes(query.trim().toLowerCase()))),
    [users, dept, levelFilter, query],
  )
  const sel = users.find((u) => u.login === selLogin) ?? null

  // D10 — 선택 사용자의 표시 모듈 구성 (sys_menu_config)
  const [menuMods, setMenuMods] = useState<string[]>([])
  const [menuRestricted, setMenuRestricted] = useState(false)
  const [allMods, setAllMods] = useState<{ id: string; label: string }[]>([])
  useEffect(() => { void menuService.modules().then(setAllMods) }, [])
  useEffect(() => {
    if (!selLogin || !perm.canReadAdmin) { setMenuMods([]); setMenuRestricted(false); return }
    void menuService.getConfig(selLogin).then((c) => {
      if (c) { setMenuMods(c.modules); setMenuRestricted(c.restricted) }
      else { setMenuMods([]); setMenuRestricted(false) }
    })
  }, [selLogin, perm.canReadAdmin])
  const toggleMod = (id: string) => setMenuMods((prev) =>
    prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id])
  const saveMenuConfig = () => {
    if (!sel) return
    void menuService.setConfig(sel.login, menuMods).then((ok) => {
      if (!ok) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
      setMenuRestricted(menuMods.length > 0)
      loadAudit()
      shell.setStatusMsg(menuMods.length
        ? `표시 모듈 저장 ✓ — ${sel.login}: ${menuMods.join(', ')} (본인 재로그인 시 적용)`
        : `표시 제한 해제 ✓ — ${sel.login}: 전체 모듈 표시`)
    }).catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  // B21 — 선택 사용자의 다중 역할 (sys_user_role)
  const [selRoles, setSelRoles] = useState<string[] | null>(null)
  useEffect(() => {
    if (!selLogin) { setSelRoles(null); return }
    void sysService.roles(selLogin).then(setSelRoles)
  }, [selLogin])

  const unlock = () => {
    if (!sel || sel.status !== 'LOCKED') return
    void (async () => {
      await userService.unlock(sel.login)
      setUsers((prev) => prev.map((u) => (u.login === sel.login ? { ...u, status: 'ACTIVE' } : u)))
      shell.setStatusMsg(`잠금 해제 — ${sel.login} (sys_user.status=ACTIVE, 감사 기록)`)
    })()
  }

  const [newLevel, setNewLevel] = useState<UserRow['level']>('SETUP')
  const changeLevel = () => {
    if (!sel) return
    void (async () => {
      try {
        const ok = await userService.changeLevel(sel.login, newLevel)
        if (!ok) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
            레벨 변경 실패 — 백엔드 연결 필요 (MOCK 모드는 sys_user 를 변경할 수 없음)</span>)
          return
        }
        setUsers((prev) => prev.map((u) => (u.login === sel.login ? { ...u, level: newLevel } : u)))
        shell.setStatusMsg(`레벨 변경 — ${sel.login} → ${newLevel} (sys_history LEVEL_CHANGE 감사)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          레벨 변경 실패 — {e instanceof Error ? e.message : String(e)}</span>)
      }
    })()
  }

  useFKeys(active, useMemo(() => ({
    F2: () => {
      if (!perm.isAdmin) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{perm.denyAdmin}</span>)
        return
      }
      setShowReg(true)
    },
    F8: () => {
      load()
      loadRoles()
      shell.setStatusMsg('사용자·권한 재조회 (sys_user·sys_role_permission)')
    },
  }), [perm.isAdmin])) // eslint-disable-line react-hooks/exhaustive-deps

  const cols: GridColumn<UserRow>[] = [
    { key: 'login', header: 'login', width: 70, code: true, render: (r) => r.login },
    { key: 'name', header: t('access.name', '이름'), width: 70, render: (r) => r.name },
    { key: 'dept', header: t('dash.dept', '부서'), width: 44, align: 'center', render: (r) => r.dept },
    {
      key: 'level', header: t('access.level', '레벨'), width: 76, align: 'center',
      render: (r) => <Chip tone="info">{r.level}</Chip>,
    },
    { key: 'role', header: t('access.role', '역할'), render: (r) => r.role },
    {
      key: 'status', header: t('prj.status', '상태'), width: 62, align: 'center',
      render: (r) => (r.status === 'ACTIVE'
        ? <Chip tone="ok">ACTIVE</Chip> : <Chip tone="warn">LOCKED</Chip>),
    },
  ]

  // F3 — 진입 가드: GENERAL 은 읽기(GET /users)도 403 — 403 안내 화면
  if (!perm.canReadAdmin) {
    return <AccessDenied screen="사용자·권한 (M-14-6)" need="SETUP" />
  }

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('access.search', '검색')}</label>
        <input className="in" style={{ width: 140 }} placeholder={t('access.searchPh', 'login·이름')}
          aria-label="사용자 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label>{t('dash.dept', '부서')}</label>
        <Combo width={72} value={dept}
          options={[{ value: '전체', label: t('enum.all', '전체') }, '기술', '영업', '재무']}
          onChange={setDept} />
        <label>{t('access.level', '레벨')}</label>
        <Combo width={90} value={levelFilter}
          options={[{ value: '전체', label: t('enum.all', '전체') }, 'ADMIN', 'SETUP', 'GENERAL']}
          onChange={setLevelFilter} />
        <span style={{ flex: 1 }} />
        <Btn variant="pri" disabled={!perm.isAdmin}
          title={perm.isAdmin ? undefined : perm.denyAdmin}
          onClick={() => setShowReg(true)}>{t('access.addUser', '＋ 사용자 등록')}</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
          <GroupBox title={t('access.userCount', '사용자 — {n}명').replace('{n}', String(rows.length))} noPad>
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.login}
              selectedKey={selLogin} onRowClick={(r) => setSelLogin(r.login)} />
          </GroupBox>
          <GroupBox title={t('access.roleEdit', '역할 편집 — {n} (기본값: 권한승인정의서 98메뉴 매트릭스)')
            .replace('{n}', sel?.role ?? '—')} noPad>
            <table className="g">
              <thead>
                <tr>
                  <th>{t('access.resource', '리소스')}</th>
                  {roles.map((r) => <th key={r.name} style={{ width: 62 }}>{r.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {rbacOffline ? (
                  <tr><td colSpan={roles.length + 1} style={{ padding: 10, color: 'var(--txt-mute)' }}>
                    백엔드 연결 필요 — 권한 매트릭스는 실DB(sys_role_permission)에서만 표시됩니다
                  </td></tr>
                ) : RESOURCES.map((key) => (
                  <tr key={key}>
                    <td className="code">{key}</td>
                    {roles.map((r) => {
                      const v = cellOf(r, key)
                      return (
                        <td key={r.name} className="c" data-perm={`${r.name}:${key}`}
                          style={{ cursor: v === '*' ? 'default' : 'pointer', userSelect: 'none' }}
                          title={v === '*' ? '전체 권한' : '클릭 = NONE→READ→WRITE 순환'}
                          onClick={() => clickCell(r, key)}>
                          {v === '*' ? <Chip tone="info">ALL</Chip>
                            : v === 'WRITE' ? <Chip tone="ok">W</Chip>
                              : v === 'READ' ? <Chip tone="warn">R</Chip>
                                : <span style={{ color: 'var(--txt-mute)' }}>—</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 290, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title={t('access.accountActions', '계정 작업 — {n}').replace('{n}', sel?.login ?? '—')}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Btn disabled={!sel} onClick={() => {
                // B21 — 인앱 초대 알림 (메일 서버 미설정 환경의 정직한 범위)
                if (!sel) return
                void sysService.invite(sel.login).then((ok) => shell.setStatusMsg(ok
                  ? `초대 발송 ✓ — ${sel.login} 인앱 알림 + 감사 기록 (메일 서버 미설정 — 인앱 채널)`
                  : <span style={{ color: 'var(--err)' }}>초대 불가 — 백엔드 연결 필요</span>))
              }}>{t('access.inviteMail', '초대 (인앱)')}</Btn>
              <Btn disabled={!sel || !perm.isAdmin}
                title={perm.isAdmin ? undefined : perm.denyAdmin}
                onClick={() => setShowEdit(true)}>{t('access.editUser', '정보 수정')}</Btn>
              <Btn disabled={sel?.status !== 'LOCKED' || !perm.isAdmin}
                title={perm.isAdmin ? undefined : perm.denyAdmin}
                onClick={unlock}>{t('access.unlock', '잠금 해제')}</Btn>
              <Btn style={{ borderColor: 'var(--err)', color: 'var(--err)' }}
                disabled={!sel || !perm.isAdmin}
                title={perm.isAdmin ? undefined : perm.denyAdmin}
                onClick={() => {
                  if (!sel) return
                  const activate = sel.status === 'DISABLED'
                  void sysService.setActive(sel.login, activate)
                    .then((ok) => {
                      if (!ok) {
                        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>처리 불가 — 백엔드 연결 필요</span>)
                        return
                      }
                      load()
                      shell.setStatusMsg(`${sel.login} ${activate ? '재활성 ✓' : '비활성화 ✓ — 로그인 거부'} (sys_user, 감사 기록)`)
                    })
                    .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
                }}>{sel?.status === 'DISABLED' ? t('access.reactivate', '재활성') : t('access.deactivate', '비활성화')}</Btn>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
              <label style={{ fontSize: 10.5 }}>{t('access.level', '레벨')}</label>
              <Combo width={92} value={newLevel}
                options={['PLATFORM', 'ADMIN', 'SETUP', 'GENERAL']}
                onChange={(v) => setNewLevel(v as UserRow['level'])} />
              <Btn disabled={!sel || sel.level === newLevel || !perm.isAdmin}
                title={perm.isAdmin ? undefined : perm.denyAdmin} onClick={changeLevel}>
                {t('access.changeLevel', '레벨 변경 (감사)')}
              </Btn>
            </div>
            {/* B21 — 다중 역할 할당 (sys_user_role) */}
            <div data-user-roles style={{ marginTop: 6, borderTop: '1px solid var(--line-soft)', paddingTop: 6 }}>
              <label style={{ fontSize: 10.5 }}>{t('access.roles', '역할 (다중, sys_user_role)')}</label>
              {selRoles === null ? (
                <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}> {t('dwg.needBackend', '백엔드 연결 필요')}</span>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                  {['PLATFORM', 'ADMIN', 'SETUP', 'GENERAL'].map((rname) => (
                    <label key={rname} style={{ fontSize: 10.5, display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                      <input type="checkbox" checked={selRoles.includes(rname)}
                        aria-label={`역할 ${rname}`} disabled={!sel}
                        onChange={(e) => {
                          if (!sel) return
                          const next = e.target.checked
                            ? [...selRoles, rname] : selRoles.filter((x) => x !== rname)
                          void sysService.assignRoles(sel.login, next).then((ok) => {
                            if (!ok) {
                              shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>역할 변경 불가 — 백엔드 연결 필요</span>)
                              return
                            }
                            setSelRoles(next)
                            shell.setStatusMsg(`역할 할당 ✓ — ${sel.login}: ${next.join(', ') || '(없음)'} (ROLE_ASSIGN 감사)`)
                          })
                        }} />
                      {rname}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </GroupBox>
          {/* D10 — 표시 모듈 구성 (sys_menu_config) */}
          <GroupBox title={t('access.menuConfig', '표시 모듈 (Head 메뉴 · D10)')}
            right={<Chip tone={menuRestricted ? 'warn' : 'ok'}>{menuRestricted ? '제한' : '전체'}</Chip>}>
            <div style={{ fontSize: 10, color: 'var(--txt-dim)', marginBottom: 4 }}>
              {t('access.menuConfigHint', '선택 = 표시 · 미선택 전부 = 전체 표시 (공통은 항상 표시)')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allMods.map((m) => (
                <label key={m.id} style={{ fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 3,
                  opacity: (!sel || m.id === 'common') ? 0.55 : 1 }}>
                  <input type="checkbox" aria-label={`모듈 ${m.label}`} disabled={!sel || m.id === 'common'}
                    checked={m.id === 'common' || menuMods.includes(m.id)}
                    onChange={() => toggleMod(m.id)} />
                  {m.label}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 6 }}>
              <Btn style={{ height: 20, fontSize: 10 }} disabled={!sel || !perm.canWrite('erp-access')}
                onClick={() => setMenuMods([])}>{t('access.menuClear', '제한 해제')}</Btn>
              <Btn variant="pri" style={{ height: 20, fontSize: 10 }} disabled={!sel || !perm.canWrite('erp-access')}
                onClick={saveMenuConfig}>{t('access.menuSave', '표시 모듈 저장')}</Btn>
            </div>
          </GroupBox>
          <GroupBox title={t('access.auditLog', '최근 감사 로그')} noPad
            right={<Chip tone="ok">sys_history</Chip>}>
            <table className="g">
              <thead><tr><th>{t('access.at', '일시')}</th><th>{t('access.action', '작업')}</th></tr></thead>
              <tbody>
                {audit.map((a, i) => (
                  <tr key={a.historyId ?? i}><td className="c">{a.at}</td>
                    <td>{a.action}{a.target && a.target !== 'sys_user' ? ` · ${a.target}` : ''}{a.by ? ` (${a.by})` : ''}</td></tr>
                ))}
                {audit.length === 0 ? (
                  <tr><td className="c" colSpan={2} style={{ color: 'var(--txt-mute)' }}>기록 없음</td></tr>
                ) : null}
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title={t('access.principles', '원칙')}>
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
              · {t('access.principle1', '레벨 4단계 PLATFORM/ADMIN/SETUP/GENERAL')}<br />
              · {t('access.principle2', '권한 없는 메뉴는 미표시 — 프론트 숨김은 보안이 아님(서비스 재검사)')}<br />
              · {t('access.principle3', '테넌트 관리(ADM-001)는 Platform 전용')}
            </div>
          </GroupBox>
        </div>
      </div>
      {showReg ? (
        <UserRegDialog
          onClose={() => setShowReg(false)}
          onSaved={(u) => {
            setShowReg(false)
            setSelLogin(u.login)
            load()
            shell.setStatusMsg(`사용자 등록 ✓ — ${u.login} · ${u.level} (sys_user + USER_CREATE 감사)`)
          }} />
      ) : null}
      {showEdit && sel ? (
        <UserEditDialog user={sel}
          onClose={() => setShowEdit(false)}
          onSaved={(fields) => {
            setShowEdit(false)
            load()
            shell.setStatusMsg(`정보 수정 ✓ — ${sel.login}: ${fields.join(', ')} (USER_UPDATE 감사)`)
          }} />
      ) : null}
    </div>
  )
}

// ── F2 — 사용자 등록 다이얼로그 (초기 비밀번호는 관리자 지정, 첫 로그인 후 변경 권장) ──
function UserRegDialog(props: { onClose: () => void; onSaved: (u: UserRow) => void }) {
  const { t } = useI18n()
  useEscapeClose(true, props.onClose)
  const [form, setForm] = useState({
    login: '', name: '', department: '기술', email: '', level: 'GENERAL', initialPassword: '',
  })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = () => {
    if (!form.login.trim() || !form.name.trim() || !form.initialPassword) {
      setErr(t('access.regNeedFields', 'login·이름·초기 비밀번호는 필수입니다'))
      return
    }
    setBusy(true)
    void userService.create({ ...form, login: form.login.trim(), name: form.name.trim() })
      .then((u) => {
        if (!u) {
          setErr(t('common.needBackend', '백엔드 연결 필요 (mock 모드)'))
          setBusy(false)
          return
        }
        props.onSaved(u)
      })
      .catch((e: Error) => { setErr(e.message); setBusy(false) })
  }

  return (
    <div data-user-reg style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={props.onClose}>
      <div style={{ width: 380, background: '#fff', border: '1px solid var(--line-strong)', boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
          <b>{t('access.regTitle', '사용자 등록 — sys_user')}</b><span className="sp" />
          <span style={{ cursor: 'pointer' }} onClick={props.onClose}>✕</span>
        </div>
        <div className="frm" style={{ padding: 10 }}>
          <label>login<i>*</i></label>
          <input className="in req" value={form.login} autoFocus aria-label="등록 login"
            placeholder={t('access.regLoginPh', '소문자·숫자·._- 3자 이상')}
            onChange={(e) => setForm({ ...form, login: e.target.value })} />
          <label>{t('access.name', '이름')}<i>*</i></label>
          <input className="in req" value={form.name} aria-label="등록 이름"
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label>{t('dash.dept', '부서')}</label>
          <Combo value={form.department} options={['기술', '영업', '재무']}
            onChange={(v) => setForm({ ...form, department: v })} />
          <label>{t('access.email', '이메일')}</label>
          <input className="in" value={form.email} aria-label="등록 이메일"
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <label>{t('access.level', '레벨')}</label>
          <Combo value={form.level} options={['GENERAL', 'SETUP', 'ADMIN']}
            onChange={(v) => setForm({ ...form, level: v })} />
          <label>{t('access.initPw', '초기 비밀번호')}<i>*</i></label>
          <input className="in req" type="password" value={form.initialPassword}
            aria-label="초기 비밀번호" placeholder={t('access.initPwPh', '4자 이상 — 전달 후 변경 권장')}
            onChange={(e) => setForm({ ...form, initialPassword: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
        </div>
        {err ? <div style={{ color: 'var(--err)', fontSize: 11, padding: '0 10px 6px' }}>{err}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, padding: '0 10px 10px' }}>
          <Btn onClick={props.onClose}>{t('price.cancel', '취소')}</Btn>
          <Btn variant="pri" disabled={busy} onClick={submit}>{t('prj.regSubmit', '등록 F12')}</Btn>
        </div>
      </div>
    </div>
  )
}

// ── F2 — 사용자 정보 수정 다이얼로그 (이름·부서·이메일 — 레벨/상태는 계정 작업에서) ──
function UserEditDialog(props: {
  user: UserRow; onClose: () => void; onSaved: (fields: string[]) => void
}) {
  const { t } = useI18n()
  useEscapeClose(true, props.onClose)
  const [name, setName] = useState(props.user.name)
  const [department, setDepartment] = useState(props.user.dept === '-' ? '기술' : props.user.dept)
  const [email, setEmail] = useState(props.user.email ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = () => {
    if (!name.trim()) {
      setErr(t('access.regNeedName', '이름은 비울 수 없습니다'))
      return
    }
    setBusy(true)
    void userService.update(props.user.login, { name: name.trim(), department, email: email.trim() })
      .then((ok) => {
        if (!ok) {
          setErr(t('common.needBackend', '백엔드 연결 필요 (mock 모드)'))
          setBusy(false)
          return
        }
        props.onSaved(['name', 'department', 'email'])
      })
      .catch((e: Error) => { setErr(e.message); setBusy(false) })
  }

  return (
    <div data-user-edit style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={props.onClose}>
      <div style={{ width: 360, background: '#fff', border: '1px solid var(--line-strong)', boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
          <b>{t('access.editTitle', '정보 수정 — {n}').replace('{n}', props.user.login)}</b><span className="sp" />
          <span style={{ cursor: 'pointer' }} onClick={props.onClose}>✕</span>
        </div>
        <div className="frm" style={{ padding: 10 }}>
          <label>{t('access.name', '이름')}<i>*</i></label>
          <input className="in req" value={name} autoFocus aria-label="수정 이름"
            onChange={(e) => setName(e.target.value)} />
          <label>{t('dash.dept', '부서')}</label>
          <Combo value={department} options={['기술', '영업', '재무']} onChange={setDepartment} />
          <label>{t('access.email', '이메일')}</label>
          <input className="in" value={email} aria-label="수정 이메일"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
        </div>
        {err ? <div style={{ color: 'var(--err)', fontSize: 11, padding: '0 10px 6px' }}>{err}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, padding: '0 10px 10px' }}>
          <Btn onClick={props.onClose}>{t('price.cancel', '취소')}</Btn>
          <Btn variant="pri" disabled={busy} onClick={submit}>{t('access.editSubmit', '저장 F12')}</Btn>
        </div>
      </div>
    </div>
  )
}
