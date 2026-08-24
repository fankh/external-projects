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

/** CSV 한 줄을 필드로 나눈다 — 값에 쉼표가 들어가면 Excel 은 따옴표로 감싸 내보낸다(RFC4180).
 *  split(',') 로 자르면 '"ThinkPad T14, Gen4"' 같은 모델명이 두 조각으로 쪼개져 모델·시리얼이 통째로 밀린다.
 *  조용히 어긋난 값이 그대로 대장에 등록되므로(검증은 유형·모델 유무만 본다) 여기서 제대로 나눈다.
 *  따옴표 안의 따옴표는 두 번 겹쳐 표기한다("") — 같은 규약으로 되돌린다. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

  const parsed = useMemo(() => {
    const out: { row: Row; valid: boolean; reason: string }[] = []
    // 템플릿(/api/asset-template.csv)은 Excel 이 한글을 깨지 않도록 BOM 을 붙여 내려간다 — 그 파일을 그대로
    //  붙여넣으면 첫 글자가 보이지 않는 BOM 이라 헤더 판정이 빗나가고, 헤더 행이 데이터로 읽혀 유형 오류로
    //  건너뛴다(사용자는 왜 1행이 빠졌는지 알 수 없다). 앞머리 BOM 을 걷어낸 뒤 파싱한다.
    const body = text.replace(/^\uFEFF/, '')
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line) continue
      const c = splitCsvLine(line).map((v) => v.trim())
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
          <div className="hstack" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="mut" style={{ fontSize: 11.5, flex: 1, minWidth: 180 }}>형식: <span className="mono">유형,모델,시리얼,소유자,부서,위치</span> (유형·모델 필수 · 헤더 자동 무시 · 시리얼 비우면 자동 채번). 유형: {CATS.join(' · ')}</span>
            <a className="btn sm ghost" href="/api/asset-template.csv" download title="작성용 CSV 템플릿 내려받기">⤓ 샘플 CSV</a>
            <label className="btn sm" title="CSV 파일 불러오기" style={{ cursor: 'pointer' }}>
              📁 CSV 파일
              <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} disabled={pending}
                onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return
                  const rd = new FileReader()
                  rd.onload = () => { setText(String(rd.result ?? '').replace(/^﻿/, '')); setPreview(false); setMsg(null) }
                  rd.readAsText(f, 'utf-8')
                  e.target.value = ''
                }} />
            </label>
          </div>
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
