'use client'

/** 감사 조회 (M-14-6A, P2 풀 포팅) — 기간/사용자/작업/대상 필터 + XLSX/선택 CSV + before/after 상세.
 *  레거시 SPA AuditQueryScreen 동등. SSR 초기 데이터 → 클라이언트 재조회(서버 액션). */
import { useEffect, useMemo, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Btn, Chip, Combo, GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { downloadCsv } from '@/lib/csv'
import { queryAudit, type AuditData } from './actions'

export interface AuditRow {
  at: string; target: string; action: string; by: string; login: string
  historyId: number
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

export function AuditPanel({ initial }: { initial: AuditData }) {
  const { t } = useI18n()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [user, setUser] = useState('')
  const [action, setAction] = useState('')
  const [target, setTarget] = useState('')
  const [data, setData] = useState<AuditData>(initial)
  const [err, setErr] = useState<string | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [selKeys, setSelKeys] = useState<Set<string | number>>(new Set())
  const [pending, start] = useTransition()

  const load = () => start(async () => {
    const r = await queryAudit({ fromDate, toDate, user, action, target, limit: 500 })
    if (r.data) { setData(r.data); setSelKeys(new Set()); setSel(null); setErr(null) }
    else setErr(r.error ?? '조회 실패')
  })

  // F8 = 조회 (셸 edim-fkey 수신)
  useEffect(() => {
    const onFKey = (e: Event) => { if ((e as CustomEvent).detail === 'F8') load() }
    window.addEventListener('edim-fkey', onFKey)
    return () => window.removeEventListener('edim-fkey', onFKey)
  })  // load 는 최신 필터 클로저 필요 — 의존성 생략(매 렌더 재구독)

  const reset = () => { setFromDate(''); setToDate(''); setUser(''); setAction(''); setTarget('') }
  const exportXlsx = () => {
    const qs = new URLSearchParams()
    if (fromDate) qs.set('fromDate', fromDate)
    if (toDate) qs.set('toDate', toDate)
    if (user) qs.set('user', user)
    if (action) qs.set('action', action)
    if (target) qs.set('target', target)
    window.open(`/api/next/xlsx?kind=audit&${qs.toString()}`, '_blank')
  }
  const exportSelected = () => {
    const chosen = data.rows.filter((r) => selKeys.has(r.historyId))
    if (!chosen.length) return
    downloadCsv('audit-selected',
      [t('audit.at', '일시'), t('audit.action', '작업'), t('audit.target', '대상'), t('audit.by', '수행자'), t('audit.login', '사번')],
      chosen.map((r) => [r.at, r.action, r.target, r.by, r.login]))
  }

  const cols: GridColumn<AuditRow>[] = useMemo(() => [
    { key: 'at', header: t('audit.at', '일시'), width: 130, align: 'center', render: (r) => r.at },
    { key: 'action', header: t('audit.action', '작업'), width: 130, align: 'center', sortValue: (r) => r.action, render: (r) => <Chip tone="info">{r.action}</Chip> },
    { key: 'target', header: t('audit.target', '대상'), render: (r) => r.target },
    { key: 'by', header: t('audit.by', '수행자'), width: 90, align: 'center', render: (r) => r.by },
    { key: 'login', header: t('audit.login', '사번'), width: 80, align: 'center', render: (r) => r.login },
  ], [t])

  const selRow = sel != null ? data.rows.find((x) => x.historyId === sel) : null

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <label>{t('audit.period', '기간')}</label>
        <input className="in" type="date" style={{ width: 122 }} value={fromDate} aria-label="시작일" onChange={(e) => setFromDate(e.target.value)} />
        <span>~</span>
        <input className="in" type="date" style={{ width: 122 }} value={toDate} aria-label="종료일" onChange={(e) => setToDate(e.target.value)} />
        <label>{t('audit.user', '사용자')}</label>
        <Combo width={90} value={user} onChange={setUser}
          options={[{ value: '', label: t('enum.all', '전체') }, ...data.users]} />
        <label>{t('audit.action', '작업')}</label>
        <Combo width={130} value={action} onChange={setAction}
          options={[{ value: '', label: t('enum.all', '전체') }, ...data.actions]} />
        <label>{t('audit.target', '대상')}</label>
        <input className="in" style={{ width: 110 }} value={target} aria-label="대상 테이블"
          placeholder="예: cst_price" onChange={(e) => setTarget(e.target.value)} />
        <span style={{ flex: 1 }} />
        <Btn onClick={reset}>{t('audit.reset', '초기화')}</Btn>
        <Btn onClick={exportSelected} disabled={selKeys.size === 0}>⬇ {t('audit.selectedCsv', '선택 CSV')}{selKeys.size ? ` (${selKeys.size})` : ''}</Btn>
        <Btn onClick={exportXlsx}>⬇ XLSX</Btn>
        <Btn variant="pri" onClick={load} disabled={pending}>{t('common.query', '조회')} F8</Btn>
        {err ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{err}</span> : null}
      </div>
      <GroupBox
        title={t('audit.title', '감사 로그 — sys_history (전 도메인 변경 이력)')}
        right={<Chip tone={data.rows.length ? 'ok' : 'warn'}>{data.rows.length}건{data.rows.length >= 500 ? ` (${t('audit.top500', '상위 500')})` : ''}</Chip>}
        noPad style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-audit" colFilter columns={cols} rows={data.rows}
          rowKey={(r) => r.historyId} selectedKey={sel} onRowClick={(r) => setSel(r.historyId)}
          multiSelect selectedKeys={selKeys} onSelectionChange={setSelKeys}
          emptyText={t('audit.empty', '조회 결과 없음 — 필터 조정 후 F8')} />
      </GroupBox>
      {selRow && (selRow.before || selRow.after) ? (
        <GroupBox title={t('audit.detail', '변경 상세 — before / after')} noPad style={{ flex: 'none', maxHeight: '40%', overflow: 'auto' }}>
          {/* F7 이식 — 필드별 diff (변경 필드 하이라이트, 레거시 M-15-9 diff 모달 동등) */}
          <div data-hist-diff style={{ padding: 6, fontSize: 10.5 }}>
            <table className="g" style={{ width: '100%' }}>
              <thead><tr>
                <th style={{ width: 120 }}>{t('audit.fieldCol', '필드')}</th>
                <th>{t('audit.before', '변경 전')}</th>
                <th>{t('audit.after', '변경 후')}</th>
              </tr></thead>
              <tbody>
                {[...new Set([...Object.keys(selRow.before ?? {}), ...Object.keys(selRow.after ?? {})])].map((k) => {
                  const bv = selRow.before?.[k]
                  const av = selRow.after?.[k]
                  const changed = JSON.stringify(bv) !== JSON.stringify(av)
                  return (
                    <tr key={k} {...(changed ? { 'data-diff-changed': '' } : {})}
                      style={changed ? { background: '#FFF3C2' } : undefined}>
                      <td style={{ fontWeight: changed ? 700 : 400 }}>{k}</td>
                      <td style={{ wordBreak: 'break-all' }}>{bv === undefined ? '—' : JSON.stringify(bv)}</td>
                      <td style={{ wordBreak: 'break-all', color: changed ? 'var(--err)' : undefined }}>{av === undefined ? '—' : JSON.stringify(av)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </GroupBox>
      ) : null}
    </div>
  )
}
