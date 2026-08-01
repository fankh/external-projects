'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { AssetCategory, IntakeLot } from '@/lib/types'
import { issueAssetNo, registerIntakeLot, toggleCheck } from './actions'

interface Label { assetNo: string; model: string; qr: string; barcode: string }
interface PC { id: string; name: string; vendor: string }

const STATUS_TONE = { '입고 대기': 'neutral', '검수 중': 'warn', '검수 완료': 'ok' } as const
const CATS: AssetCategory[] = ['단말', '서버', '네트워크', '주변기기', 'SW', '가상자원']

export function IntakeView({ lots, labels, contracts }: { lots: IntakeLot[]; labels: Label[]; contracts: PC[] }) {
  const [selId, setSelId] = useState(lots[0]?.id ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  // 입고 등록 폼
  const [regOpen, setRegOpen] = useState(false)
  const [rc, setRc] = useState(contracts[0]?.id ?? '')
  const [rmodel, setRmodel] = useState('')
  const [rcat, setRcat] = useState<AssetCategory>('단말')
  const [rqty, setRqty] = useState('1')
  const registerLot = () => {
    startTransition(async () => {
      const r = await registerIntakeLot(rc, rmodel, rcat, Number(rqty))
      setMsg({ ok: r.ok, text: r.message })
      if (r.ok) { setRegOpen(false); setRmodel(''); setRqty('1') }
    })
  }
  const sel = lots.find((l) => l.id === selId) ?? lots[0]
  const selLabels = labels.filter((l) => sel?.issued.includes(l.assetNo))
  const done = sel ? sel.checklist.filter((c) => c.checked).length : 0

  return (
    <>
      {msg?.text && <div className={`callout ${msg.ok ? '' : 'warn'}`}>{msg.text}</div>}
      <Card kicker="Arrivals" title="입고 목록" pad={false}
        actions={contracts.length > 0
          ? <button className="btn sm pri" disabled={pending} onClick={() => { setRegOpen((o) => !o); setMsg(null) }}>{regOpen ? '취소' : '입고 등록'}</button>
          : undefined}>
        {regOpen && (
          <div className="addrow" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: 14, borderBottom: '1px solid var(--line)' }}>
            <span className="dim" style={{ fontSize: 11.5, fontWeight: 600 }}>발주 연계 입고 등록</span>
            <select className="select" value={rc} disabled={pending} onChange={(e) => setRc(e.target.value)}>
              {contracts.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.name} ({c.vendor})</option>)}
            </select>
            <input className="input" style={{ width: 190 }} placeholder="모델 (예: ThinkPad T14 Gen4)" value={rmodel} disabled={pending} onChange={(e) => setRmodel(e.target.value)} />
            <select className="select" value={rcat} disabled={pending} onChange={(e) => setRcat(e.target.value as AssetCategory)}>
              {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input" type="number" min={1} max={1000} style={{ width: 80 }} value={rqty} disabled={pending} onChange={(e) => setRqty(e.target.value)} />
            <button className="btn sm pri" disabled={pending || !rmodel.trim() || !rc} onClick={registerLot}>등록</button>
            <span className="mut" style={{ fontSize: 11 }}>등록 즉시 ‘입고 대기’로 검수 대기열에 편성됩니다.</span>
          </div>
        )}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>입고번호</th><th>계약</th><th>모델</th><th>공급사</th><th className="num">수량</th><th className="num">채번</th><th>입고일</th><th className="c">상태</th><th className="c">선택</th></tr>
            </thead>
            <tbody>
              {lots.map((l) => (
                <tr key={l.id} className={`clickable ${l.id === sel?.id ? 'sel' : ''}`} onClick={() => setSelId(l.id)}>
                  <td className="code">{l.id}</td>
                  <td className="code">{l.contractId}</td>
                  <td className="strong">{l.model}</td>
                  <td className="mute">{l.vendor}</td>
                  <td className="num">{l.qty}</td>
                  <td className="num tnum">{l.issued.length}</td>
                  <td className="tnum">{l.arrivedAt}</td>
                  <td className="c"><Chip tone={STATUS_TONE[l.status]}>{l.status}</Chip></td>
                  <td className="c">{l.id === sel?.id ? <Chip tone="info" bare>선택됨</Chip> : <span className="mut">클릭</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {sel && (
        <div className="cols c2">
          <Card kicker="Inspection" title={`검수 체크리스트 — ${sel.model}`}
            actions={<Chip tone={done === sel.checklist.length ? 'ok' : 'warn'}>{done}/{sel.checklist.length} 완료</Chip>}>
            <div className="vstack" style={{ gap: 7 }}>
              {sel.checklist.map((c) => (
                <button key={c.item} disabled={pending}
                  onClick={() => startTransition(() => toggleCheck(sel.id, c.item))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12.5,
                    background: c.checked ? 'var(--ok-bg)' : '#fff',
                    color: c.checked ? 'var(--ok)' : 'var(--ink-2)',
                  }}>
                  <span style={{
                    width: 18, height: 18, flex: 'none', borderRadius: 5, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 12, fontWeight: 700,
                    border: `1.5px solid ${c.checked ? 'var(--ok)' : 'var(--line-strong)'}`,
                    background: c.checked ? 'var(--ok)' : '#fff', color: '#fff',
                  }}>{c.checked ? '✓' : ''}</span>
                  <span style={{ fontWeight: c.checked ? 600 : 500 }}>{c.item}</span>
                </button>
              ))}
            </div>
            <div className="hstack" style={{ marginTop: 14, gap: 8 }}>
              <button className="btn pri" disabled={pending || sel.status !== '검수 완료' || sel.issued.length >= sel.qty}
                onClick={() => startTransition(async () => {
                  const r = await issueAssetNo(sel.id)
                  setMsg({ ok: r.ok, text: r.message })
                })}>
                자산번호 채번 · 대장 등록
              </button>
              <span className="dim" style={{ fontSize: 11.5 }}>
                {sel.status === '검수 완료' ? `채번 ${sel.issued.length}/${sel.qty}` : '체크리스트 완료 후 채번 가능'}
              </span>
            </div>
          </Card>

          <Card kicker="Labels" title="라벨 발행 (바코드 / QR)"
            actions={selLabels.length > 0 ? <button className="btn sm" onClick={() => window.print()}>인쇄</button> : undefined}>
            {selLabels.length === 0 ? (
              <div className="empty">채번된 자산이 없습니다 — 검수 완료 후 채번하면 라벨이 발행됩니다</div>
            ) : (
              <div className="vstack" style={{ gap: 10 }}>
                {selLabels.map((l) => (
                  <div key={l.assetNo} className="asset-label">
                    <div className="qr" dangerouslySetInnerHTML={{ __html: l.qr }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="kicker mute">SEEKERSLAB · IT ASSET</div>
                      <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-deep)', margin: '2px 0 1px' }}>{l.assetNo}</div>
                      <div className="dim" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.model}</div>
                      <div className="bc" dangerouslySetInnerHTML={{ __html: l.barcode }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
