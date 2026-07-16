'use client'

/** Macro Studio — 식 편집·Test Run(실평가)·저장(DRAFT)·삭제·승인 요청 (N5b 복구). */
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useFKeys } from '@/hooks/useFKeys'
import { useI18n } from '@/components/I18nProvider'
import { deleteMacro, evaluateMacro, requestMacroApproval, saveMacro, type ActState, type EvalResult } from './actions'

export interface MacroRow {
  name: string; expr: string; status: string; address: string; prompt: string
  description: string; codeText: string; flowchartDef: string; applyType: string; version: string
}

function parseVars(s: string): Record<string, number> {
  const out: Record<string, number> = {}
  s.split(/[,\n]/).forEach((pair) => {
    const [k, v] = pair.split('=').map((x) => x.trim())
    if (k && v !== undefined && !Number.isNaN(Number(v))) out[k] = Number(v)
  })
  return out
}

export function MacroGrid({ rows }: { rows: MacroRow[] }) {
  const { t } = useI18n()
  const cols: GridColumn<MacroRow>[] = [
    { key: 'name', header: 'Macro', width: 130, code: true, render: (r) => r.name },
    { key: 'apply', header: t('macro.applyCol', '적용'), width: 84, align: 'center', sortValue: (r) => r.applyType, render: (r) => r.applyType || '—' },
    { key: 'expr', header: t('macro.exprCol', '수식'), code: true, render: (r) => r.expr || '—' },
    { key: 'desc', header: t('macro.descCol', '설명'), render: (r) => r.description || '—' },
    { key: 'ver', header: 'Ver', width: 52, align: 'center', render: (r) => r.version || '—' },
    { key: 'status', header: t('macro.statusCol', '상태'), width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'APPROVED' ? 'ok' : 'info'}>{r.status}</Chip> },
  ]
  const [selName, setSelName] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [expr, setExpr] = useState('')
  const [prompt, setPrompt] = useState('')
  const [vars, setVars] = useState('')
  const [evalR, setEvalR] = useState<EvalResult | null>(null)
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()

  const select = (r: MacroRow) => {
    setSelName(r.name); setName(r.name); setExpr(r.expr); setPrompt(r.prompt); setEvalR(null)
  }

  // N6 — F-key 수신: F12 저장 · F9 Test Run (셸 상태바/키보드 디스패치)
  useFKeys({
    F12: () => start(async () => setSt(await saveMacro(name, expr, prompt))),
    F9: () => { if (expr.trim()) start(async () => setEvalR(await evaluateMacro(expr, parseVars(vars)))) },
  })

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', gap: 6 }}>
      <div style={{ flex: 1.3, minWidth: 0 }}>
        <DenseGrid prefKey="next-macros" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.name} selectedKey={selName ?? undefined}
          onRowClick={select} emptyText={t('macro.empty', 'Macro 가 없습니다')} />
      </div>
      <div className="gb" style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 6, padding: 8, fontSize: 11, overflow: 'auto' }}>
        <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('macro.editTitle', 'Macro 편집')} {selName ? `— ${selName}` : t('macro.newHint', '(행 클릭 또는 신규 이름 입력)')}</div>
        <input className="in req" placeholder={t('macro.namePh', 'Macro 이름 (TBX-…)')} value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="in" placeholder={t('macro.exprPh', '=IF(A>0, A*B, 0) — Excel 호환 식')} value={expr} onChange={(e) => setExpr(e.target.value)}
          style={{ fontFamily: 'Consolas, monospace', fontSize: 11, height: 70, resize: 'vertical' }} />
        <input className="in" placeholder={t('macro.promptPh', 'Prompt (자연어 설명)')} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="in" style={{ flex: 1, minWidth: 110, fontFamily: 'Consolas, monospace' }} placeholder={t('macro.varsPh', 'Test 변수: A=560, B=2')}
            value={vars} onChange={(e) => setVars(e.target.value)} />
          <button className="b" disabled={pending || !expr.trim()} onClick={() => start(async () => {
            setEvalR(await evaluateMacro(expr, parseVars(vars)))
          })}>{t('macro.testRun', '▶ Test Run')}</button>
        </div>
        {evalR ? (
          <div style={{ border: '1px solid var(--line)', padding: 6, background: '#FAFBFC' }}>
            {evalR.ok
              ? <div>{t('macro.resultLabel', '결과')} = <b style={{ color: 'var(--run)' }}>{String(evalR.value)}</b></div>
              : <div style={{ color: 'var(--err)' }}>{t('macro.errorLabel', '오류')} — {evalR.error}</div>}
            {evalR.trace?.length ? (
              <div style={{ marginTop: 3, fontFamily: 'Consolas, monospace', fontSize: 10, color: 'var(--txt-dim)' }}>
                {evalR.trace.slice(0, 6).map((t, i) => <div key={i}>{t}</div>)}
              </div>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button className="b run" disabled={pending} onClick={() => start(async () => setSt(await saveMacro(name, expr, prompt)))}>{t('macro.saveF12', '저장 (F12)')}</button>
          <button className="b" disabled={pending || !selName} onClick={() => selName && start(async () => setSt(await requestMacroApproval(selName)))}>{t('common.requestApproval', '승인 요청')}</button>
          <button className="b" disabled={pending || !selName} onClick={() => {
            if (selName && confirm(`${selName} 을 삭제하시겠습니까? (참조 시 거부)`))
              start(async () => { setSt(await deleteMacro(selName)); setSelName(null); setName(''); setExpr(''); setPrompt('') })
          }}>{t('common.delete', '삭제')}</button>
        </div>
        {st.error ? <div style={{ color: 'var(--err)' }}>{st.error}</div> : null}
        {st.ok ? <div style={{ color: 'var(--run)' }}>{st.ok}</div> : null}
      </div>
    </div>
  )
}
