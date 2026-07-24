'use client'

/** Head 관리 (M-14-6E) — 요구 #14/#19/#21.
 *  목록·등록·상태기계(DRAFT→REVIEW→APPROVED→PUBLISHED)·패널 바인딩.
 *  게시 게이트(#19)는 서버가 강제한다 — 화면은 사유를 그대로 보여준다. */
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip, GroupBox } from '@/components/controls'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { usePermission } from '@/components/PermissionProvider'
import {
  addBinding, createHead, deleteHead, removeBinding, requestHeadApproval, saveHeadDesign,
  seedHeads, setHeadStatus, type ActState, type HeadDetail, type HeadRow,
} from '@/lib/headActions'

const TONE: Record<string, 'ok' | 'warn' | 'info'> = {
  PUBLISHED: 'ok', APPROVED: 'info', REVIEW: 'warn', DRAFT: 'info', RETIRED: 'warn',
}
const PANELS = ['LEFT', 'CENTER', 'RIGHT'] as const

const KPI_KEYS = ['runs', 'approvals', 'todos', 'projects', 'handoffs', 'anomalies'] as const
const KPI_LABEL: Record<string, string> = {
  runs: '진행 중 Run', approvals: '결재 대기', todos: '내 To-Do',
  projects: '활성 프로젝트', handoffs: 'ERP 수신 대기', anomalies: '이상 경고',
}

export function HeadAdmin({ rows, detail, selId }: {
  rows: HeadRow[]; detail: HeadDetail | null; selId: number
}) {
  const { t } = useI18n()
  const router = useRouter()
  const perm = usePermission()
  const canWrite = perm.canWrite('code-master')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const [regSt, regAction, regPending] = useActionState(createHead, {} as ActState)

  const [panel, setPanel] = useState<string>('CENTER')
  const [kind, setKind] = useState('SCREEN')
  const [ref, setRef] = useState('')
  const [label, setLabel] = useState('')

  const cols: GridColumn<HeadRow>[] = [
    { key: 'code', header: t('head.code', '코드'), width: 96, code: true, render: (r) => r.headCode },
    { key: 'name', header: t('head.name', 'Head 이름'), render: (r) => r.headName },
    { key: 'type', header: t('head.type', '유형'), width: 74, align: 'center',
      render: (r) => <Chip tone={r.headType === 'SYSTEM' ? 'warn' : 'info'}>{r.headType}</Chip> },
    { key: 'lvl', header: t('head.minLevel', '최소 레벨'), width: 84, align: 'center', render: (r) => r.minLevel },
    { key: 'status', header: t('head.status', '상태'), width: 92, align: 'center',
      sortValue: (r) => r.status, render: (r) => <Chip tone={TONE[r.status] ?? 'info'}>{r.status}</Chip> },
    { key: 'bind', header: t('head.bindings', '바인딩'), width: 78, align: 'center',
      render: (r) => (
        <span style={{ color: r.centerBindings ? undefined : 'var(--err)' }}
          title={r.centerBindings ? undefined : t('head.noCenter', 'center 바인딩 없음 — 게시 불가 (#19)')}>
          {r.bindings}{r.centerBindings ? '' : ' ⚠'}
        </span>
      ) },
    { key: 'ord', header: t('head.order', '순서'), width: 52, align: 'right', render: (r) => r.sortOrder },
    // #18 — 표시(Design)는 구조와 분리: 여기서 바꾼 값은 승인 없이 즉시 반영된다
    { key: 'design', header: t('head.design', '표시'), width: 96, align: 'center', render: (r) => (
      <span data-head-design={r.headCode} style={{ display: 'inline-flex', gap: 3 }}>
        <span data-design-visible title={t('head.visible', '사용자 목록 표시')}
          style={{ cursor: 'pointer', opacity: r.visible === false ? 0.35 : 1 }}
          onClick={(e) => { e.stopPropagation(); act(() => saveHeadDesign(r.headId, { visible: !(r.visible !== false) })) }}>
          {r.visible === false ? '🚫' : '👁'}
        </span>
        <span data-design-pin title={t('head.pin', '상단 고정')}
          style={{ cursor: 'pointer', opacity: r.pinned ? 1 : 0.35 }}
          onClick={(e) => { e.stopPropagation(); act(() => saveHeadDesign(r.headId, { pinned: !r.pinned })) }}>
          📌
        </span>
        {r.kpiKeys?.length ? <span title={`KPI ${r.kpiKeys.length}`}>📊{r.kpiKeys.length}</span> : null}
      </span>
    ) },
  ]

  const act = (fn: () => Promise<ActState>) => start(async () => { setSt(await fn()); router.refresh() })
  const sel = rows.find((r) => r.headId === selId) ?? null

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegisterModal disabled={!canWrite} disabledTitle={perm.denyWrite}
          trigger={t('head.addBtn', '＋ Head 등록')} title={t('head.regTitle', 'Head 등록 (DRAFT)')} ok={regSt.ok}>
          {() => (
            <form action={regAction} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
              <label>{t('head.code', '코드')}</label>
              <input className="in req" name="headCode" autoFocus placeholder="OPS" />
              <label>{t('head.name', 'Head 이름')}</label>
              <input className="in req" name="headName" placeholder={t('head.namePh', '업무 (사용자)')} />
              <label>{t('head.type', '유형')}</label>
              <select className="in" name="headType" defaultValue="TENANT">
                <option value="TENANT">TENANT</option>
                <option value="SYSTEM">SYSTEM</option>
              </select>
              <label>{t('head.minLevel', '최소 레벨')}</label>
              <select className="in" name="minLevel" defaultValue="GENERAL">
                {['GENERAL', 'SETUP', 'ADMIN', 'PLATFORM'].map((l) => <option key={l}>{l}</option>)}
              </select>
              <label>{t('head.order', '순서')}</label>
              <input className="in" name="sortOrder" type="number" defaultValue={0} />
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
                {regSt.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{regSt.error}</span> : null}
                <button className="b run" type="submit" disabled={regPending}>{t('common.register', '등록')}</button>
              </div>
            </form>
          )}
        </RegisterModal>
        {rows.length === 0 ? (
          <button className="b run" data-head-seed disabled={pending || !canWrite}
            onClick={() => act(seedHeads)}>{t('head.seed', '표준 Head 생성')}</button>
        ) : null}
        <span className="sep" />
        <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>
          {sel ? `${sel.headCode} (${sel.status})` : t('head.clickSelect', '행 클릭=선택')}
        </span>
        <button className="b" data-head-review disabled={pending || !sel || sel.status !== 'DRAFT' || !canWrite}
          onClick={() => sel && act(() => requestHeadApproval(sel.headId, `Head — ${sel.headName}`))}>
          {t('head.review', '승인 요청')}
        </button>
        <button className="b" data-head-publish disabled={pending || !sel || sel.status !== 'APPROVED' || !canWrite}
          title={sel && !sel.centerBindings ? t('head.noCenter', 'center 바인딩 없음 — 게시 불가 (#19)') : undefined}
          onClick={() => sel && act(() => setHeadStatus(sel.headId, 'PUBLISHED'))}>
          {t('head.publish', '게시')}
        </button>
        <button className="b" data-head-withdraw disabled={pending || !sel || sel.status === 'DRAFT' || !canWrite}
          onClick={() => sel && act(() => setHeadStatus(sel.headId, 'DRAFT'))}>
          {t('head.withdraw', '회수 (DRAFT)')}
        </button>
        <button className="b" data-head-del disabled={pending || !sel || !canWrite}
          onClick={() => sel && confirm(`${sel.headCode} 삭제?`) && act(() => deleteHead(sel.headId))}>
          {t('common.delete', '삭제')}
        </button>
        {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }} data-head-err>{st.error}</span> : null}
        {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-heads" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.headId} selectedKey={selId || undefined}
          onRowClick={(r) => router.push(`/erp/heads?sel=${r.headId}`)}
          emptyText={t('head.empty', 'Head 가 없습니다 — 표준 Head 생성으로 시작하십시오')} />
      </div>

      {detail ? (
        <GroupBox title={`${t('head.panelBind', '패널 바인딩')} — ${detail.headName}`} noPad data-head-bindings>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: 6, flexWrap: 'wrap', fontSize: 11 }}>
            <select className="in" data-bind-panel value={panel} onChange={(e) => setPanel(e.target.value)} style={{ width: 88 }}>
              {PANELS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <select className="in" data-bind-kind value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 100 }}>
              {['SCREEN', 'PROCESS', 'TEMPLATE'].map((k) => <option key={k}>{k}</option>)}
            </select>
            <input className="in" data-bind-ref value={ref} onChange={(e) => setRef(e.target.value)}
              placeholder={kind === 'SCREEN' ? '/erp/dashboard' : kind === 'PROCESS' ? '*' : 'todo'} style={{ width: 170 }} />
            <input className="in" data-bind-label value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder={t('head.bindLabel', '표시 이름 (선택)')} style={{ width: 130 }} />
            <button className="b run" data-bind-add disabled={pending || !canWrite || detail.status === 'PUBLISHED'}
              title={detail.status === 'PUBLISHED' ? t('head.publishedLocked', '게시본은 회수 후 편집') : undefined}
              onClick={() => act(async () => {
                const r = await addBinding(detail.headId, panel, kind, ref, label)
                if (r.ok) { setRef(''); setLabel('') }
                return r
              })}>{t('head.bindAdd', '＋ 바인딩')}</button>
            {!detail.publishable ? (
              <span style={{ color: 'var(--err)' }} data-head-nocenter>
                {t('head.noCenter', 'center 바인딩 없음 — 게시 불가 (#19)')}
              </span>
            ) : null}
          </div>
          {/* #18 — KPI 선택: 표시 설정이라 승인·게시와 무관하게 즉시 저장된다 */}
          <div data-head-kpi style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 6px 6px', flexWrap: 'wrap', fontSize: 10.5 }}>
            <span style={{ color: 'var(--txt-dim)' }}>{t('head.kpi', 'KPI (표시)')}</span>
            {KPI_KEYS.map((k) => {
              const on = (sel?.kpiKeys ?? []).includes(k)
              return (
                <label key={k} style={{ display: 'inline-flex', gap: 3, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" data-kpi={k} checked={on} disabled={pending || !canWrite}
                    onChange={() => {
                      const cur = sel?.kpiKeys ?? []
                      const next = on ? cur.filter((x) => x !== k) : [...cur, k]
                      act(() => saveHeadDesign(detail.headId, { kpiKeys: next }))
                    }} />
                  {t(`head.kpi.${k}`, KPI_LABEL[k])}
                </label>
              )
            })}
          </div>
          <table className="g">
            <thead><tr>
              <th style={{ width: 80 }}>{t('head.panel', '패널')}</th>
              <th style={{ width: 92 }}>{t('head.targetKind', '유형')}</th>
              <th>{t('head.targetRef', '대상')}</th>
              <th style={{ width: 140 }}>{t('head.bindLabelCol', '표시 이름')}</th>
              <th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {detail.bindings.length ? detail.bindings.map((b) => (
                <tr key={b.bindingId} data-bind-row={b.panel}>
                  <td className="c"><Chip tone={b.panel === 'CENTER' ? 'ok' : 'info'}>{b.panel}</Chip></td>
                  <td className="c">{b.targetKind}</td>
                  <td className="code">{b.targetRef}</td>
                  <td>{b.label || '—'}</td>
                  <td className="c">
                    <button className="b" data-bind-del disabled={pending || !canWrite || detail.status === 'PUBLISHED'}
                      onClick={() => act(() => removeBinding(detail.headId, b.bindingId))}>✕</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} style={{ padding: 10, color: 'var(--txt-mute)' }}>
                  {t('head.noBindings', '바인딩이 없습니다 — 최소 CENTER 하나가 있어야 게시할 수 있습니다')}
                </td></tr>
              )}
            </tbody>
          </table>
        </GroupBox>
      ) : null}
    </div>
  )
}
