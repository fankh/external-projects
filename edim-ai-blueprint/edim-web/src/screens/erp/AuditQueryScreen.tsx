/** D9 전용 감사 조회 (M-14-6 분리 승격) — sys_history 기간/사용자/작업/대상 필터 + XLSX export.
 *  ADMIN 전용. 계정·보안뿐 아니라 전 도메인 변경 이력 추적. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { auditService, xlsxService, type AuditRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { AccessDenied, usePermission } from '../../shell/PermissionContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'
import { downloadCsv } from '../../utils/csv'

export function AuditQueryScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const perm = usePermission()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [user, setUser] = useState('')
  const [action, setAction] = useState('')
  const [target, setTarget] = useState('')
  const [rows, setRows] = useState<AuditRow[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [users, setUsers] = useState<string[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [selKeys, setSelKeys] = useState<Set<string | number>>(new Set())

  const filter = useCallback(() => ({
    fromDate, toDate, user, action, target, limit: 500,
  }), [fromDate, toDate, user, action, target])

  const load = useCallback(() => {
    if (!perm.canReadAdmin) return
    void auditService.query(filter()).then((r) => {
      if (r) { setRows(r.rows); setActions(r.actions); setUsers(r.users); setSelKeys(new Set()) }
    }).catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [filter, perm.canReadAdmin, shell])

  useEffect(() => { load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  useFKeys(active, useMemo(() => ({ F8: load }), [load]))

  const exportXlsx = () => {
    void xlsxService.download(auditService.exportPath(filter()), 'audit')
      .then((n) => shell.setStatusMsg(n < 0 ? <span style={{ color: 'var(--err)' }}>내보내기 불가</span> : `감사 로그 XLSX ✓ — ${n}건 (필터 적용)`))
  }
  const reset = () => { setFromDate(''); setToDate(''); setUser(''); setAction(''); setTarget('') }
  const exportSelected = () => {
    const chosen = rows.filter((r) => selKeys.has(r.historyId))
    if (!chosen.length) return
    downloadCsv('audit-selected',
      ['일시', '작업', '대상', '수행자', '사번'],
      chosen.map((r) => [r.at, r.action, r.target, r.by, r.login]))
    shell.setStatusMsg(`선택 ${chosen.length}행 CSV ✓`)
  }

  if (!perm.canReadAdmin) return <AccessDenied screen="감사 조회 (M-14-6)" need="SETUP" />

  const cols: GridColumn<AuditRow>[] = [
    { key: 'at', header: t('audit.at', '일시'), width: 130, code: true, render: (r) => r.at },
    { key: 'action', header: t('audit.action', '작업'), width: 130, render: (r) => <Chip tone="info">{r.action}</Chip> },
    { key: 'target', header: t('audit.target', '대상'), width: 170, render: (r) => r.target },
    { key: 'by', header: t('audit.by', '수행자'), width: 90, render: (r) => r.by },
    { key: 'login', header: t('audit.login', '사번'), width: 80, align: 'center', render: (r) => r.login },
  ]

  return (
    <div className="fill-col">
      <div className="qband" style={{ flexWrap: 'wrap' }}>
        <label>{t('audit.period', '기간')}</label>
        <input className="in" type="date" style={{ width: 130 }} value={fromDate} aria-label="시작일"
          onChange={(e) => setFromDate(e.target.value)} />
        <span>~</span>
        <input className="in" type="date" style={{ width: 130 }} value={toDate} aria-label="종료일"
          onChange={(e) => setToDate(e.target.value)} />
        <label>{t('audit.user', '사용자')}</label>
        <Combo width={90} value={user} onChange={setUser}
          options={[{ value: '', label: t('enum.all', '전체') }, ...users]} />
        <label>{t('audit.action', '작업')}</label>
        <Combo width={130} value={action} onChange={setAction}
          options={[{ value: '', label: t('enum.all', '전체') }, ...actions]} />
        <label>{t('audit.target', '대상')}</label>
        <input className="in" style={{ width: 110 }} value={target} aria-label="대상 테이블"
          placeholder="예: cst_price" onChange={(e) => setTarget(e.target.value)} />
        <span style={{ flex: 1 }} />
        <Btn onClick={reset}>{t('audit.reset', '초기화')}</Btn>
        <Btn onClick={exportSelected} disabled={selKeys.size === 0}>⬇ 선택 CSV{selKeys.size ? ` (${selKeys.size})` : ''}</Btn>
        <Btn onClick={exportXlsx}>⬇ XLSX</Btn>
        <Btn variant="pri" onClick={load}>{t('common.query', '조회')} F8</Btn>
      </div>
      <div className="fill-col" style={{ padding: 6, gap: 6, overflow: 'auto' }}>
        <GroupBox
          title={t('audit.title', '감사 로그 — sys_history (전 도메인 변경 이력)')}
          right={<Chip tone={rows.length ? 'ok' : 'warn'}>{rows.length}건{rows.length >= 500 ? ' (상위 500)' : ''}</Chip>}
          noPad>
          {rows.length ? (
            <DenseGrid prefKey="audit" columns={cols} rows={rows} rowKey={(r) => r.historyId}
              selectedKey={sel} onRowClick={(r) => setSel(r.historyId)}
              multiSelect selectedKeys={selKeys} onSelectionChange={setSelKeys} />
          ) : (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
              {t('audit.empty', '조회 결과 없음 — 필터 조정 후 F8')}
            </div>
          )}
        </GroupBox>
        {sel != null ? (() => {
          const r = rows.find((x) => x.historyId === sel)
          if (!r || (!r.before && !r.after)) return null
          return (
            <GroupBox title={t('audit.detail', '변경 상세 — before / after')} noPad>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 6, fontSize: 10.5 }}>
                <div>
                  <div style={{ color: 'var(--txt-dim)', marginBottom: 2 }}>{t('audit.before', '변경 전')}</div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{r.before ? JSON.stringify(r.before, null, 1) : '—'}</pre>
                </div>
                <div>
                  <div style={{ color: 'var(--txt-dim)', marginBottom: 2 }}>{t('audit.after', '변경 후')}</div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{r.after ? JSON.stringify(r.after, null, 1) : '—'}</pre>
                </div>
              </div>
            </GroupBox>
          )
        })() : null}
      </div>
    </div>
  )
}
