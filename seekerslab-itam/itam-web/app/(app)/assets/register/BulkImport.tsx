'use client'
import { useMemo, useState, useTransition } from 'react'
import { bulkRegisterAssets } from './actions'

const CATS = ['단말', '서버', '네트워크', '주변기기', 'SW', '가상자원']
type Row = { category: string; model: string; serial: string; owner: string; dept: string; location: string }

/** CSV 일괄 자산 등록 — 기존 자산을 대장으로 온보딩. 붙여넣기 → 미리보기(클라 검증) → 등록(서버 재검증·중복 차단).
 *  형식: 유형,모델,시리얼,소유자,부서,위치 (유형·모델 필수). 헤더 행은 자동 무시. */
export function BulkImport() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const parsed = useMemo(() => {
    const out: { row: Row; valid: boolean; reason: string }[] = []
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line) continue
      const c = line.split(',').map((v) => v.trim())
      // 헤더 행(유형·모델 등 라벨) 건너뛰기
      if (c[0] === '유형' && (c[1] === '모델' || c[1] === '')) continue
      const row: Row = { category: c[0] ?? '', model: c[1] ?? '', serial: c[2] ?? '', owner: c[3] ?? '', dept: c[4] ?? '', location: c[5] ?? '' }
      let reason = ''
      if (!CATS.includes(row.category)) reason = `유형 오류 '${row.category || '-'}'`
      else if (!row.model) reason = '모델 누락'
      out.push({ row, valid: !reason, reason })
    }
    return out
  }, [text])
  const validRows = parsed.filter((p) => p.valid).map((p) => p.row)

  const submit = () => startTransition(async () => {
    const r = await bulkRegisterAssets(validRows)
    setMsg({ ok: r.ok, text: r.message + (r.skipped.length ? ` — 서버 건너뜀: ${r.skipped.map((x) => `${x.line}행(${x.reason})`).join(', ')}` : '') })
    if (r.ok) { setText(''); setPreview(false) }
  })

  return (
    <div className="callout" style={{ margin: '0 0 12px', padding: 0, overflow: 'hidden' }}>
      <div className="hstack" style={{ justifyContent: 'space-between', padding: '10px 14px', flexWrap: 'wrap', gap: 8 }}>
        <b>일괄 등록 (CSV) — 기존 자산 대장 온보딩</b>
        <button className="btn sm pri" onClick={() => { setOpen((o) => !o); setMsg(null) }}>{open ? '닫기' : '＋ 일괄 등록'}</button>
      </div>
      {open && (
        <div className="vstack" style={{ gap: 8, padding: '0 14px 14px' }}>
          <div className="mut" style={{ fontSize: 11.5 }}>형식: <span className="mono">유형,모델,시리얼,소유자,부서,위치</span> (유형·모델 필수, 나머지 선택 · 헤더 행 자동 무시 · 시리얼 비우면 자동 채번). 유형: {CATS.join(' · ')}</div>
          <textarea className="input" style={{ height: 110, padding: '8px 10px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'var(--mono, monospace)', fontSize: 12 }}
            placeholder={'단말,ThinkPad T14 Gen4,SN-IMP001,김민준,플랫폼개발팀,본사 8F\n서버,PowerEdge R760,,인프라운영팀,인프라운영팀,IDC-A Rack 20'}
            value={text} disabled={pending} onChange={(e) => { setText(e.target.value); setPreview(false); setMsg(null) }} />
          <div className="hstack" style={{ gap: 8 }}>
            <button className="btn sm" disabled={pending || text.trim() === ''} onClick={() => setPreview(true)}>미리보기</button>
            {preview && <span className="mut" style={{ fontSize: 12 }}>파싱 {parsed.length}행 · 유효 {validRows.length} · 오류 {parsed.length - validRows.length}</span>}
            <span className="right" style={{ marginLeft: 'auto' }} />
            {preview && <button className="btn sm pri" disabled={pending || validRows.length === 0} onClick={submit}>{validRows.length}건 등록</button>}
          </div>
          {preview && parsed.length > 0 && (
            <div className="tbl-wrap" style={{ maxHeight: 240, overflow: 'auto' }}>
              <table className="tbl">
                <thead><tr><th className="c">#</th><th>유형</th><th>모델</th><th>시리얼</th><th>소유자</th><th>부서</th><th className="c">검증</th></tr></thead>
                <tbody>
                  {parsed.map((p, i) => (
                    <tr key={i}>
                      <td className="c mut">{i + 1}</td>
                      <td>{p.row.category}</td>
                      <td className="strong">{p.row.model}</td>
                      <td className="code">{p.row.serial || <span className="mut">자동</span>}</td>
                      <td>{p.row.owner || <span className="mut">-</span>}</td>
                      <td className="mute">{p.row.dept || <span className="mut">자산관리팀</span>}</td>
                      <td className="c">{p.valid ? <span style={{ color: 'var(--ok)' }}>✓</span> : <span style={{ color: 'var(--err)', fontSize: 11 }}>{p.reason}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {msg && <div className={`callout ${msg.ok ? '' : 'warn'}`} style={{ margin: 0 }}>{msg.text}</div>}
        </div>
      )}
    </div>
  )
}
