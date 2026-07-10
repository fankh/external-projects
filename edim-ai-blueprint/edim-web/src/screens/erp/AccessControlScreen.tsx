/** M-14-6 사용자·권한 관리 (W-23, 슬라이드 57·72) — 레벨 4단계 × 리소스 4유형 ×
 *  액션 4종 (권한승인정의서 모델) · 감사 기록. */
import { useEffect, useMemo, useState } from 'react'
import { AUDIT_LOG, ROLE_MATRIX, type UserRow } from '../../api/mock/dataMore'
import { userService } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function AccessControlScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [users, setUsers] = useState<UserRow[]>([])
  const [dept, setDept] = useState('전체')
  const [selLogin, setSelLogin] = useState<string | null>(null)

  useEffect(() => {
    void userService.list().then((rows) => {
      setUsers(rows)
      setSelLogin(rows[0]?.login ?? null)
    })
  }, [])

  const rows = useMemo(
    () => users.filter((u) => dept === '전체' || u.dept === dept),
    [users, dept],
  )
  const sel = users.find((u) => u.login === selLogin) ?? null

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
    F8: () => shell.setStatusMsg(`조회 — 사용자 ${rows.length}명`),
  }), [rows.length])) // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('access.search', '검색')}</label>
        <input className="in" style={{ width: 140 }} placeholder={t('access.searchPh', 'login·이름')}
          aria-label="사용자 검색" />
        <label>{t('dash.dept', '부서')}</label>
        <Combo width={72} value={dept}
          options={[{ value: '전체', label: t('enum.all', '전체') }, '기술', '영업', '재무']}
          onChange={setDept} />
        <label>{t('access.level', '레벨')}</label>
        <Combo width={90} value="전체"
          options={[{ value: '전체', label: t('enum.all', '전체') }, 'ADMIN', 'SETUP', 'GENERAL']} />
        <span style={{ flex: 1 }} />
        <Btn variant="pri">{t('access.addUser', '＋ 사용자 등록')}</Btn>
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
                <tr><th>{t('access.resource', '리소스')}</th><th style={{ width: 50 }}>VIEW</th><th style={{ width: 50 }}>EDIT</th><th style={{ width: 62 }}>APPROVE</th><th style={{ width: 52 }}>SETUP</th></tr>
              </thead>
              <tbody>
                {ROLE_MATRIX.map((m) => (
                  <tr key={m.resource}>
                    <td className="code">{m.resource}</td>
                    {[m.view, m.edit, m.approve, m.setup].map((v, i) => (
                      <td key={i} className="c">
                        <input type="checkbox" defaultChecked={v}
                          aria-label={`${m.resource}-${i}`}
                          onChange={() => shell.setStatusMsg('권한 변경 — 즉시 반영 + 감사 기록 (SYS-005)')} />
                      </td>
                    ))}
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
              <Btn onClick={() => shell.setStatusMsg(`초대 메일 발송 — ${sel?.login}`)}>{t('access.inviteMail', '초대 메일')}</Btn>
              <Btn disabled={sel?.status !== 'LOCKED'} onClick={unlock}>{t('access.unlock', '잠금 해제')}</Btn>
              <Btn style={{ borderColor: 'var(--err)', color: 'var(--err)' }}
                onClick={() => shell.setStatusMsg(`비활성화 — ${sel?.login} (ADMIN 확인 필요)`)}>{t('access.deactivate', '비활성화')}</Btn>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
              <label style={{ fontSize: 10.5 }}>{t('access.level', '레벨')}</label>
              <Combo width={92} value={newLevel}
                options={['PLATFORM', 'ADMIN', 'SETUP', 'GENERAL']}
                onChange={(v) => setNewLevel(v as UserRow['level'])} />
              <Btn disabled={!sel || sel.level === newLevel} onClick={changeLevel}>
                {t('access.changeLevel', '레벨 변경 (감사)')}
              </Btn>
            </div>
          </GroupBox>
          <GroupBox title={t('access.auditLog', '최근 감사 로그')} noPad>
            <table className="g">
              <thead><tr><th>{t('access.at', '일시')}</th><th>{t('access.action', '작업')}</th></tr></thead>
              <tbody>
                {AUDIT_LOG.map((a, i) => (
                  <tr key={i}><td className="c">{a.at}</td><td>{a.action}</td></tr>
                ))}
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
    </div>
  )
}
