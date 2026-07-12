/** D4 검사·품질 기록 (QC Inspection) — 규칙이 판정이 되는 고리.
 *  수입(INCOMING)·공정(PROCESS)·출하(OUTGOING) 검사 결과(합/부/조건부·측정값).
 *  불합격·조건부 시 품질 관리자 알림(이상 고리). */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { qcService, type QcInspection } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const RESULT_TONE: Record<string, 'ok' | 'warn' | 'err'> = {
  PASS: 'ok', CONDITIONAL: 'warn', FAIL: 'err',
}
const TYPE_LABEL: Record<string, string> = {
  INCOMING: '수입검사', PROCESS: '공정검사', OUTGOING: '출하검사',
}

export function QualityInspectionScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [rows, setRows] = useState<QcInspection[]>([])
  const [filter, setFilter] = useState('')
  const [sel, setSel] = useState<string | null>(null)

  const load = useCallback(() => {
    void qcService.list(filter).then((r) => { if (r) setRows(r) })
  }, [filter])
  useEffect(() => { load() }, [load])

  const register = useCallback(() => {
    const ty = (window.prompt('검사 유형 — INCOMING(수입) / PROCESS(공정) / OUTGOING(출하)', 'INCOMING') || '').trim().toUpperCase()
    if (!ty) return
    const itemName = window.prompt('검사 대상 (품목/도면명)', '')?.trim() || ''
    const refNo = window.prompt('참조번호 (PO/WO/도면, 생략 가능)', '')?.trim() || undefined
    const res = (window.prompt('판정 — PASS(합격) / FAIL(불합격) / CONDITIONAL(조건부)', 'PASS') || '').trim().toUpperCase()
    if (!res) return
    const measured = window.prompt('측정값·판정 근거 (생략 가능)', '')?.trim() || undefined
    void qcService.create({ inspType: ty, result: res, itemName, refNo, measured })
      .then((no) => {
        if (no === false) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
        load()
        shell.setStatusMsg(res === 'PASS'
          ? `검사 등록 ✓ — ${no} ${TYPE_LABEL[ty] ?? ty} 합격`
          : `검사 등록 ✓ — ${no} ${res === 'FAIL' ? '불합격' : '조건부'} (품질 관리자 알림 — 이상 고리)`)
      })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [load, shell])

  useFKeys(active, useMemo(() => ({ F8: load, F2: register }), [load, register]))

  const cols: GridColumn<QcInspection>[] = [
    { key: 'no', header: 'QC No', width: 84, code: true, render: (r) => r.inspNo },
    { key: 'type', header: t('qc.type', '유형'), width: 78, align: 'center', render: (r) => TYPE_LABEL[r.inspType] ?? r.inspType },
    { key: 'item', header: t('qc.item', '검사 대상'), render: (r) => r.itemName || r.itemCode || '-' },
    { key: 'ref', header: t('qc.ref', '참조'), width: 100, render: (r) => r.refNo || '-' },
    {
      key: 'res', header: t('qc.result', '판정'), width: 74, align: 'center',
      render: (r) => <Chip tone={RESULT_TONE[r.result] ?? 'info'}>{r.result}</Chip>,
    },
    { key: 'meas', header: t('qc.measured', '측정값·근거'), render: (r) => r.measured || '-' },
    { key: 'insp', header: t('qc.inspector', '검사자'), width: 80, render: (r) => r.inspector || '-' },
    { key: 'at', header: t('qc.at', '검사일'), width: 92, align: 'center', render: (r) => r.inspectedAt },
  ]

  const cnt = (res: string) => rows.filter((r) => r.result === res).length

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('qc.header', '검사·품질 기록')}</label>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          {t('qc.hint', '수입·공정·출하 검사 · 합/부/조건부 판정 (불합격·조건부 시 품질 관리자 알림) (D4)')}
        </span>
        <span style={{ flex: 1 }} />
        <Combo value={filter} onChange={setFilter} width={120} options={[
          { value: '', label: '전체 판정' },
          { value: 'PASS', label: '합격' },
          { value: 'FAIL', label: '불합격' },
          { value: 'CONDITIONAL', label: '조건부' },
        ]} />
        <Btn onClick={register}>{t('qc.registerF2', '검사 등록 F2')}</Btn>
        <Btn onClick={load}>{t('common.query', '조회')} F8</Btn>
      </div>
      <div className="fill-col" style={{ padding: 6, gap: 6, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { l: t('qc.kpiPass', '합격'), v: cnt('PASS'), c: 'var(--ok)' },
            { l: t('qc.kpiCond', '조건부'), v: cnt('CONDITIONAL'), c: 'var(--warn)' },
            { l: t('qc.kpiFail', '불합격'), v: cnt('FAIL'), c: 'var(--err)' },
          ].map((k) => (
            <div key={k.l} className="gb" style={{ textAlign: 'center', padding: '8px 6px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: k.c }}>{k.v}</div>
              <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>{k.l}</div>
            </div>
          ))}
        </div>
        <GroupBox title={t('qc.listTitle', '검사 기록 — 수입·공정·출하 (qc_inspection)')} noPad>
          {rows.length ? (
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.inspNo}
              selectedKey={sel} onRowClick={(r) => setSel(r.inspNo)} />
          ) : (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
              {t('qc.empty', '검사 기록 없음 — F2 로 등록 (수입·공정·출하)')}
            </div>
          )}
        </GroupBox>
      </div>
    </div>
  )
}
