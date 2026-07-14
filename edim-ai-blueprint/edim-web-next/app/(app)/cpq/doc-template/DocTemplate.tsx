'use client'

import { useState } from 'react'
import { Btn, GroupBox } from '@/components/controls'
import { Cvs } from '@/components/Cvs'
import { openRenderedPdf } from '@/lib/pdf'

/** 건공기 밀도 근사 — 승인 Macro(TBX-011) 계산 */
function density(tempC: number, humidity: number): number {
  const rho = 353.05 / (273.15 + tempC) * (1 - 0.0035 * (humidity - 50) / 50)
  return Math.round(rho * 1000) / 1000
}

export function DocTemplate() {
  const [temp, setTemp] = useState('20')
  const [humid, setHumid] = useState('50')
  const [rho, setRho] = useState<number | null>(1.204)
  const [status, setStatus] = useState<{ text: string; err?: boolean } | null>(null)
  const say = (text: string, err = false) => setStatus({ text, err })

  const calc = () => {
    const t = Number(temp), h = Number(humid)
    if (Number.isNaN(t) || Number.isNaN(h)) { say('숫자 입력 필요', true); return }
    const r = density(t, h); setRho(r); say(`Macro 계산 ✓ — Density ${r} kg/m³ (승인 Macro 실행, TBX-011)`)
  }
  const print = () => void openRenderedPdf('Technical Data Sheet — 습공기 밀도', [
    `Temperature: ${temp} ℃`, `Humidity: ${humid} %RH`,
    `Density ρ = ${rho ?? '—'} kg/m³ (승인 Macro TBX-011 계산값)`, '',
    'Print Form(S-3-4) 표준 Templet · 머리글/바닥글 적용',
  ], { subtitle: 'C-3 Document Templet — Input→Macro→Output 실렌더' })
    .then((ok) => say(ok ? `Print ✓ — Density ${rho} 포함 실렌더 (SVC-11)` : '렌더 불가 — 백엔드 연결 필요', !ok))

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
          <GroupBox title="Input Data → Output Data (Macro 계산)">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 600 }}>Temperature*</label>
              <input className="in" style={{ width: 64 }} value={temp} aria-label="Temperature" onChange={(e) => setTemp(e.target.value)} />
              <span className="unit">℃</span>
              <label style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 600 }}>Humidity*</label>
              <input className="in" style={{ width: 64 }} value={humid} aria-label="Humidity" onChange={(e) => setHumid(e.target.value)} />
              <span className="unit">%</span>
              <Btn variant="run" onClick={calc}>▶ Macro 계산 F9</Btn>
              <span style={{ color: 'var(--txt-mute)' }}>→</span>
              <label style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 600 }}>Density</label>
              <input className="in ro" style={{ width: 76, border: '1.5px solid var(--err)', textAlign: 'right' }} value={rho ?? ''} readOnly aria-label="Density" />
              <span className="unit">kg/m³</span>
            </div>
          </GroupBox>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, flex: 1, minHeight: 0 }}>
            <GroupBox title="습공기 선도 — 계산점 표시">
              <Cvs blocks={rho != null ? [{ id: 'pt', name: `${temp}℃/${humid}%`, sub: `ρ=${rho}`, x: 40 + Number(temp) * 4, y: 150 - Number(humid), w: 74, h: 30 }] : []} style={{ height: '100%', minHeight: 180 }} />
            </GroupBox>
            <GroupBox title="스프레드시트 (A~L — 중간 계산)" noPad>
              <table className="g">
                <thead><tr><th></th><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead>
                <tbody>
                  <tr><td className="c"><b>1</b></td><td>T(K)</td><td className="num">{(Number(temp) + 273.15).toFixed(2)}</td><td>RH</td><td className="num">{humid}%</td></tr>
                  <tr><td className="c"><b>2</b></td><td>P(kPa)</td><td className="num">101.325</td><td>보정</td><td className="num">{(1 - 0.0035 * (Number(humid) - 50) / 50).toFixed(4)}</td></tr>
                  <tr><td className="c"><b>3</b></td><td>ρ(kg/m³)</td><td className="num edit">{rho ?? '—'}</td><td></td><td></td></tr>
                </tbody>
              </table>
            </GroupBox>
          </div>
          {status ? <div style={{ fontSize: 11, color: status.err ? 'var(--err)' : 'var(--run)' }}>{status.text}</div> : null}
        </div>
        <div className="split-h" />
        <div className="side-scroll" style={{ width: 290, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GroupBox title="Document Code">
            <input className="in ro" style={{ width: '100%', fontFamily: 'Consolas, monospace' }} value="EU-3-2020-450-6-21-4-SR-7" readOnly aria-label="Document Code" />
          </GroupBox>
          <GroupBox title="Print 미리보기" right={<Btn style={{ height: 18, fontSize: 10 }} onClick={print}>🖨</Btn>}>
            <div className="cvs" style={{ height: 150 }}>
              <div style={{ position: 'absolute', inset: 8, border: '1px dashed var(--line)', fontSize: 9.5, color: 'var(--txt-mute)', padding: 6, lineHeight: 1.8 }}>
                Technical Data Sheet<br />습공기 밀도 계산서<br />ρ = {rho ?? '—'} kg/m³<br />Print Form(S-3-4) 표준 Templet
              </div>
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
