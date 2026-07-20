'use client'

/** 제품 코드 마스터 — 등록·상태 전이·삭제 (N4 복구). */
import { useActionState, useEffect, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { usePermission } from '@/components/PermissionProvider'
import { batchProductCodes, createProductCode, deleteProductCode, loadComposition, renameProductCode, setProductStatus, type ActState, type Composition } from './actions'
import { ApprovalStrip } from '@/components/ApprovalStrip'
import { ComposeModal } from './ComposeModal'

export interface PcRow {
  productCodeId: number; mainCode: string; codeName: string; groupCode: string
  status: string; createdAt: string; refs: number; origin?: string
}

const TONE: Record<string, 'ok' | 'warn' | 'info'> = { APPROVED: 'ok', DRAFT: 'info', INACTIVE: 'warn' }

export function PcGrid({ rows, composeGroups = [], manualGroups = [] }: {
  rows: PcRow[]; composeGroups?: string[]; manualGroups?: string[]
}) {
  const { t } = useI18n()
  const perm = usePermission()
  const cols: GridColumn<PcRow>[] = [
    { key: 'code', header: t('master.codeCol', '코드'), width: 130, code: true, render: (r) => r.mainCode },
    { key: 'name', header: t('master.name', '코드명'), editable: true, editValue: (r) => r.codeName, render: (r) => r.codeName },
    { key: 'group', header: t('master.group', '그룹'), width: 90, align: 'center', render: (r) => r.groupCode },
    // #28 — 조합 파생(COMPOSED) 인지 레거시 수기 등록(MANUAL) 인지 한눈에
    { key: 'origin', header: t('master.origin', '생성'), width: 78, align: 'center', sortValue: (r) => r.origin ?? 'MANUAL',
      render: (r) => (r.origin === 'COMPOSED'
        ? <Chip tone="ok">{t('master.composed', '조합')}</Chip>
        : <span style={{ color: 'var(--txt-dim)' }}>{t('master.manual', '수기')}</span>) },
    { key: 'status', header: t('master.status', '상태'), width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={TONE[r.status] ?? 'info'}>{r.status}</Chip> },
    { key: 'refs', header: t('master.refs', '참조'), width: 50, align: 'right', sortValue: (r) => r.refs, render: (r) => r.refs },
    { key: 'at', header: t('master.createdAt', '등록일'), width: 96, align: 'center', render: (r) => r.createdAt },
  ]
  const [regSt, regAction, regPending] = useActionState(createProductCode, {} as ActState)
  const [selId, setSelId] = useState<number | null>(null)
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.productCodeId === selId) ?? null

  // #28 — 선택 행의 조합 상세(고정 Slot·값·Revision, 해시 무결성, Revision drift)
  const [comp, setComp] = useState<Composition | null>(null)
  const [compErr, setCompErr] = useState<string | null>(null)
  useEffect(() => {
    if (!selId) { setComp(null); setCompErr(null); return }
    let live = true
    loadComposition(selId).then((r) => { if (live) { setComp(r.comp ?? null); setCompErr(r.error ?? null) } })
    return () => { live = false }
  }, [selId])

  const transition = (status: string) => sel && start(async () => setSt(await setProductStatus(sel.productCodeId, status)))

  // 일괄 작업 (POST /codes/products/batch) — 다중 선택 상태 전이/삭제
  const [msel, setMsel] = useState<Set<string | number>>(new Set())
  const [batchStatus, setBatchStatus] = useState('INACTIVE')
  const runBatch = (action: 'STATUS' | 'DELETE') => {
    const ids = [...msel].map(Number).filter((x) => !Number.isNaN(x))
    if (!ids.length) return
    if (action === 'DELETE' && !confirm(`선택 ${ids.length}건을 일괄 삭제하시겠습니까? (참조 항목은 skip)`)) return
    start(async () => {
      setSt(await batchProductCodes(ids, action, action === 'STATUS' ? batchStatus : undefined))
      setMsel(new Set())
    })
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* #28 주 경로 — 승인된 Sub Code 조합으로만 생성 (자유텍스트 없음) */}
        <ComposeModal groups={composeGroups} disabled={!perm.canWrite('code-master') || !composeGroups.length}
          disabledTitle={!perm.canWrite('code-master') ? perm.denyWrite : t('master.noComposeGroup', 'Sub Code Slot 이 정의된 그룹이 없습니다 (S-1-1)')}
          onDone={setSt} />
        {/* 레거시 경로 — Slot 이 없는 그룹만. Slot 이 있는 그룹은 서버가 422 로 거부한다 */}
        <RegisterModal disabled={!perm.canWrite('code-master') || !manualGroups.length}
          disabledTitle={!perm.canWrite('code-master') ? perm.denyWrite : t('master.noManualGroup', 'Slot 없는 그룹이 없습니다 — 조합 생성을 사용하십시오')}
          trigger={t('master.addBtn', '수동 등록')} title={t('master.regTitle', '제품 코드 수동 등록 — Slot 미정의 그룹 전용')} ok={regSt.ok}>
          {() => (
            <form action={regAction} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
              <div style={{ gridColumn: '1 / -1', fontSize: 10.5, color: 'var(--txt-dim)' }}>
                {t('master.manualHint', 'Sub Code Slot 이 정의된 그룹은 조합 생성만 허용됩니다 (#28).')}
              </div>
              <label>{t('master.codePh', '코드 (KDP …)')}</label>
              <input className="in req" name="mainCode" autoFocus />
              <label>{t('master.name', '코드명')}</label>
              <input className="in req" name="codeName" />
              <label>{t('master.groupPh', '그룹 (KOF 등)')}</label>
              <select className="in req" name="groupCode" defaultValue={manualGroups[0] ?? ''}>
                {manualGroups.map((g) => <option key={g}>{g}</option>)}
              </select>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
                {regSt.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{regSt.error}</span> : null}
                <button className="b run" type="submit" disabled={regPending}>{t('common.register', '등록')}</button>
              </div>
            </form>
          )}
        </RegisterModal>
        <span className="sep" />
        <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{sel ? `${t('master.selected', '선택')} ${sel.mainCode} (${sel.status})` : t('master.clickSelect', '행 클릭=선택')}</span>
        <button className="b" disabled={pending || !sel || sel.status === 'APPROVED'} onClick={() => transition('APPROVED')}>{t('master.approve', '승인')}</button>
        <button className="b" disabled={pending || !sel || sel.status === 'INACTIVE'} onClick={() => transition('INACTIVE')}>{t('master.inactive', '비활성')}</button>
        <button className="b" disabled={pending || !sel || sel.status === 'DRAFT'} onClick={() => transition('DRAFT')}>{t('master.restore', '복원(DRAFT)')}</button>
        <button className="b" disabled={pending || !sel} onClick={() => {
          if (sel && confirm(`${sel.mainCode} 를 삭제하시겠습니까? (참조 시 거부)`))
            start(async () => { setSt(await deleteProductCode(sel.productCodeId)); setSelId(null) })
        }}>{t('master.delete', '삭제')}</button>
        {msel.size > 0 ? (
          <span data-pc-batch style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
            <span className="sep" />
            <span style={{ color: 'var(--title-navy)', fontWeight: 600 }}>☑ {msel.size}{t('master.batchCount', '건')}</span>
            <select className="in" value={batchStatus} onChange={(e) => setBatchStatus(e.target.value)}
              style={{ height: 20, fontSize: 10.5 }} aria-label="일괄 상태">
              {['DRAFT', 'APPROVED', 'INACTIVE'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="b" data-pc-batch-status disabled={pending || !perm.canWrite('code-master')}
              title={perm.canWrite('code-master') ? undefined : perm.denyWrite}
              onClick={() => runBatch('STATUS')}>{t('master.batchApply', '일괄 전이')}</button>
            <button className="b" data-pc-batch-del disabled={pending || !perm.canWrite('code-master')}
              title={perm.canWrite('code-master') ? undefined : perm.denyWrite}
              onClick={() => runBatch('DELETE')}>{t('master.batchDelete', '일괄 삭제')}</button>
          </span>
        ) : null}
        {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
        <span className="sep" />
        <ApprovalStrip targetTable="product_code" targetId={sel?.productCodeId ?? 0}
          targetCode={sel?.mainCode ?? ''} label={`Product Code — ${sel?.mainCode ?? ''} ${sel?.codeName ?? ''}`}
          status={sel?.status} disabled={!sel} />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-pc" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.productCodeId} selectedKey={selId ?? undefined}
          multiSelect selectedKeys={msel} onSelectionChange={setMsel}
          onRowClick={(r) => setSelId(r.productCodeId)}
          onCellEdit={(r, _i, _k, v) => {
            if (!v.trim() || v.trim() === r.codeName) return
            start(async () => setSt(await renameProductCode(r.productCodeId, v)))
          }}
          emptyText={t('master.empty', '제품 코드가 없습니다')} />
      </div>
      {/* #28 — 조합 상세: 고정된 Slot·값·Revision. 조합은 불변이고, 원본 개정은 drift 로만 드러난다 */}
      {sel ? (
        <div data-pc-composition style={{ borderTop: '1px solid var(--line)', padding: '4px 2px', fontSize: 11, maxHeight: 132, overflow: 'auto' }}>
          {compErr ? <span style={{ color: 'var(--err)' }}>{compErr}</span> : null}
          {comp && comp.origin === 'COMPOSED' ? (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>{t('master.composition', '조합 구성')}</b>
                <span className="mono" style={{ color: 'var(--txt-dim)' }}>#{comp.comboHash?.slice(0, 16)}</span>
                <Chip tone={comp.intact ? 'ok' : 'warn'}>{comp.intact ? t('master.intact', '무결') : t('master.mismatch', '해시 불일치')}</Chip>
                {comp.drift.length
                  ? <Chip tone="warn">{t('master.revDrift', 'Rev 변경')} {comp.drift.join(', ')}</Chip>
                  : <Chip tone="ok">{t('master.revCurrent', 'Rev 최신')}</Chip>}
              </div>
              <table style={{ marginTop: 3, borderCollapse: 'collapse' }}>
                <tbody>
                  {comp.slots.map((s) => (
                    <tr key={s.slot} data-pc-comp-slot={s.slot}>
                      <td style={{ padding: '1px 8px 1px 0', fontWeight: 600 }}>{s.slot}</td>
                      <td style={{ padding: '1px 8px 1px 0', color: 'var(--txt-dim)' }}>{s.label}</td>
                      <td className="mono" style={{ padding: '1px 8px 1px 0' }}>{s.valueCode ?? '—'}</td>
                      <td style={{ padding: '1px 8px 1px 0', color: s.revDrift ? 'var(--warn)' : 'var(--txt-dim)' }}>
                        Rev {s.boundRevision ?? '—'}{s.revDrift ? ` → ${s.currentRevision}` : ''}
                      </td>
                      <td style={{ padding: '1px 0', color: s.currentStatus === 'APPROVED' ? 'var(--run)' : 'var(--err)' }}>{s.currentStatus ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : comp ? (
            <span style={{ color: 'var(--txt-dim)' }}>
              {t('master.manualNoComposition', '수기 등록 코드 — 조합 근거가 없습니다 (#28 이전 자산)')}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
