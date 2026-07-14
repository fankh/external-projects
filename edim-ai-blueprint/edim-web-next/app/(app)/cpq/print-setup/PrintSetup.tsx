'use client'

import { useState, useTransition } from 'react'
import { Btn, Chip, GroupBox } from '@/components/controls'
import { openRenderedPdf } from '@/lib/pdf'
import { publishForm } from './actions'

const FORMS = ['Technical Report', '견적서 (CLT)', '작업지시서', '검사성적서']
interface FormBox { id: number; label: string; x: number; y: number; w: number; h: number; dashed?: boolean }
const DEFAULT_BOXES: FormBox[] = [
  { id: 1, label: '머리글 — 로고 · Title · DOC No.', x: 40, y: 16, w: 480, h: 36, dashed: true },
  { id: 2, label: '[Data:customer] Customer·Date·담당', x: 40, y: 66, w: 220, h: 52 },
  { id: 3, label: '[Data:input] Input Value·Result', x: 280, y: 66, w: 240, h: 52 },
  { id: 4, label: '[그래프:performance] 성능 곡선', x: 40, y: 132, w: 280, h: 140 },
  { id: 5, label: '[Table:tech] 기술 Data', x: 340, y: 132, w: 180, h: 140 },
  { id: 6, label: '바닥글 — 페이지 · 회사 정보', x: 40, y: 288, w: 480, h: 24, dashed: true },
]

export function PrintSetup() {
  const [form, setForm] = useState(FORMS[0])
  const [watermark, setWatermark] = useState(true)
  const [status, setStatus] = useState<'DRAFT' | 'PENDING'>('DRAFT')
  const [boxes] = useState<FormBox[]>(DEFAULT_BOXES)
  const [selBox, setSelBox] = useState<number | null>(2)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [pending, start] = useTransition()
  const say = (text: string, err = false) => setMsg({ text, err })

  const renderLines = () => [
    ...boxes.map((b) => b.label), '',
    `머리글·바닥글: 표준 Templet · 워터마크: ${watermark ? 'CONFIDENTIAL' : '없음'}`,
    '게시 후 SVC-11 이 실데이터로 치환 렌더한다 (CPQ-013).',
  ]
  const render = (label: string) => void openRenderedPdf(`${form} — ${label}`, renderLines(), { subtitle: `Print Set-up ${label} (S-3-4)`, confidential: watermark })
    .then((ok) => say(ok ? `${label} ✓ — ${form} 실렌더 (워터마크 ${watermark ? 'ON' : 'OFF'})` : '렌더 불가 — 백엔드 연결 필요', !ok))
  const publish = () => start(async () => {
    const r = await publishForm(form)
    if (r.error) { say(r.error, true); return }
    setStatus('PENDING'); say(`게시 승인 요청 ✓ — ${form} (승인함 등록 · 승인 후 게시, CPQ-013)`)
  })

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ gap: 6 }}>
        <label style={{ fontSize: 11 }}>양식</label>
        <select className="in" value={form} onChange={(e) => setForm(e.target.value)} style={{ height: 22, fontSize: 11 }}>
          {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}><input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} /> 워터마크</label>
        <Chip tone={status === 'DRAFT' ? 'info' : 'warn'}>{status}</Chip>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => render('Print Test')}>Print Test</Btn>
        <Btn onClick={() => render('PDF')}>PDF</Btn>
        <Btn variant="pri" disabled={pending || status === 'PENDING'} onClick={publish}>게시 (승인 후)</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ flex: 1 }}>
          <GroupBox title="양식 캔버스 — [Data]/[그래프]/[Table] 자리표시자" noPad>
            <div className="cvs" style={{ flex: 1, minHeight: 340 }}>
              {boxes.map((b) => (
                <div key={b.id} className={`m2 ${selBox === b.id ? 'sel' : ''}`} style={{ left: b.x, top: b.y, width: b.w, height: b.h, borderStyle: b.dashed ? 'dashed' : undefined, fontSize: 9.5 }} onClick={() => setSelBox(b.id)}>{b.label}</div>
              ))}
              {watermark ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: 'rgba(200,40,40,.10)', fontWeight: 800, transform: 'rotate(-20deg)', pointerEvents: 'none' }}>CONFIDENTIAL</div> : null}
            </div>
          </GroupBox>
          {msg ? <div style={{ fontSize: 11, padding: '3px 4px', color: msg.err ? 'var(--err)' : 'var(--run)' }}>{msg.text}</div> : null}
        </div>
        <div className="split-h" />
        <div className="side-scroll" style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GroupBox title="자리표시자 목록" noPad>
            <table className="g"><thead><tr><th>ID</th><th>Placeholder</th></tr></thead>
              <tbody>{boxes.map((b) => (
                <tr key={b.id} className={selBox === b.id ? 'sel' : undefined} onClick={() => setSelBox(b.id)}><td className="code">{b.id}</td><td style={{ fontSize: 10 }}>{b.label}</td></tr>
              ))}</tbody></table>
          </GroupBox>
          <GroupBox title="출력 설정">
            <div style={{ fontSize: 11, lineHeight: 2, padding: 4 }}>
              <div>용지 <b>A4 세로</b></div><div>머리글/바닥글 <b>표준 Templet</b></div>
              <div>워터마크 <b>{watermark ? 'CONFIDENTIAL' : '없음'}</b></div>
              <div style={{ fontSize: 10, color: 'var(--txt-mute)', marginTop: 4 }}>Office(xlsx/docx) 출력은 P4-1 대기 — 현재 PDF 실렌더만 지원</div>
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
