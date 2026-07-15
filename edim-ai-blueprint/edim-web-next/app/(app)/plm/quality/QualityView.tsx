'use client'

import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { addRule, toggleRule, verify, type VerifyResult } from './actions'

export interface VerificationRow { rule: string; macro: string; warning: string; active: boolean; verificationId?: number }

export function QualityView({ rows, drawing }: { rows: VerificationRow[]; drawing: string }) {
  const [pending, start] = useTransition()
  const [meas, setMeas] = useState('')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [ruleName, setRuleName] = useState('')
  const [macroName, setMacroName] = useState('')
  const [warning, setWarning] = useState('')

  const doAdd = () => {
    start(async () => {
      const r = await addRule(drawing, ruleName, macroName, warning)
      if (r.error) { setMsg({ text: r.error, err: true }); return }
      setMsg({ text: r.ok ?? '등록' })
      setRuleName(''); setMacroName(''); setWarning('')
    })
  }

  const doToggle = (r: VerificationRow) => {
    if (r.verificationId == null) return
    start(async () => {
      const res = await toggleRule(r.verificationId!, !r.active)
      if (res.error) setMsg({ text: res.error, err: true })
    })
  }
  const doVerify = () => {
    const measurements: Record<string, number> = {}
    meas.split(/[,\n]/).forEach((pair) => {
      const [k, v] = pair.split('=').map((s) => s.trim())
      if (k && v !== undefined && !Number.isNaN(Number(v))) measurements[k] = Number(v)
    })
    start(async () => {
      const res = await verify(drawing, measurements)
      if (res.error) { setMsg({ text: res.error, err: true }); setResult(null); return }
      setResult(res.result ?? null)
      setMsg({ text: `판정 ✓ — ${res.result?.pass}/${res.result?.evaluated} 통과 · ${res.result?.suggestion ?? ''}` })
    })
  }

  const cols: GridColumn<VerificationRow>[] = [
    { key: 'rule', header: '규칙', width: 150, code: true, render: (r) => r.rule },
    { key: 'macro', header: '매크로 식', render: (r) => <span style={{ fontFamily: 'Consolas, monospace', fontSize: 10.5 }}>{r.macro}</span> },
    { key: 'warning', header: '경고 메시지', width: 200, render: (r) => r.warning },
    { key: 'active', header: '활성', width: 72, align: 'center', sortValue: (r) => (r.active ? 1 : 0),
      render: (r) => <button className="b" disabled={pending || r.verificationId == null} onClick={() => doToggle(r)} style={{ height: 18, fontSize: 10 }}>{r.active ? '✓ ON' : 'OFF'}</button> },
  ]

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', gap: 6, padding: 6 }}>
      <div className="gb" style={{ flex: 1.4, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>검증 규칙 — {drawing} ({rows.length})</div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <DenseGrid prefKey="next-verifications" colFilter columns={cols} rows={rows}
            rowKey={(r, i) => r.verificationId ?? `${r.rule}-${i}`} emptyText="검증 규칙이 없습니다" />
        </div>
        <div style={{ display: 'flex', gap: 4, padding: 6, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--line)' }}>
          <input className="in req" style={{ width: 110 }} placeholder="규칙명" value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
          <input className="in req" style={{ width: 150, fontFamily: 'Consolas, monospace' }} placeholder="Macro 식 (=A>=…)" value={macroName} onChange={(e) => setMacroName(e.target.value)} />
          <input className="in" style={{ flex: 1, minWidth: 100 }} placeholder="경고 메시지" value={warning} onChange={(e) => setWarning(e.target.value)} />
          <button className="b run" disabled={pending} onClick={doAdd} style={{ height: 20, fontSize: 10.5 }}>＋ 규칙 등록</button>
        </div>
      </div>
      <div className="gb" style={{ width: 320, display: 'flex', flexDirection: 'column', padding: 8, gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600 }}>측정값 자동 판정 (D4)</div>
        <textarea className="in" value={meas} onChange={(e) => setMeas(e.target.value)} placeholder={'예:\nA=560\nB=800\nC=316'}
          style={{ fontFamily: 'Consolas, monospace', fontSize: 11, height: 90, resize: 'vertical' }} />
        <button className="b" disabled={pending} onClick={doVerify} style={{ height: 24, fontSize: 11 }}>▶ 판정 실행</button>
        {result ? (
          <div style={{ fontSize: 11 }}>
            <div style={{ marginBottom: 4 }}>
              <Chip tone={result.fail === 0 ? 'ok' : 'warn'}>{result.pass}/{result.evaluated} 통과</Chip>
              {result.fail > 0 ? <span style={{ color: 'var(--err)', marginLeft: 6 }}>{result.fail} 실패</span> : null}
            </div>
            <table className="g"><thead><tr><th>규칙</th><th>값</th><th>판정</th></tr></thead>
              <tbody>{result.results.map((x) => (
                <tr key={x.rule}><td className="code">{x.rule}</td><td className="num">{x.value ?? '—'}</td>
                  <td className="c" style={{ color: x.pass ? 'var(--run)' : 'var(--err)' }}>{x.pass ? '통과' : x.warning ?? '실패'}</td></tr>
              ))}</tbody></table>
          </div>
        ) : null}
        {msg ? <div style={{ fontSize: 11, color: msg.err ? 'var(--err)' : 'var(--run)' }}>{msg.text}</div> : null}
      </div>
    </div>
  )
}
