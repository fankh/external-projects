'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { LEAK_RESPONSE, type LeakFinding } from '@/lib/types'
import { reopenLeak, respondToLeak, respondToLeakMany } from './actions'

const CONF_TONE = { 높음: 'err', 중간: 'warn', 낮음: 'neutral' } as const

export function LeakTable({ leaks, canRespond, openOnly: openOnlyParam }: { leaks: LeakFinding[]; canRespond: boolean; openOnly?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [bulkNote, setBulkNote] = useState('대량 유출 사고 일괄 대응 — 계정 재설정·시크릿 로테이션·침해 점검')
  const [pending, startTransition] = useTransition()
  // 미조치만 보기 — 대시보드 '유출 · 침해 미조치' 큐의 드릴다운. 조치 완료분까지 함께 쌓이는 표라 큐가 말한 건수를
  //  화면에서 다시 세어야 했다(발견 자산 화면의 네 조치 표와 같은 규약).
  const [openOnly, setOpenOnly] = useState(Boolean(openOnlyParam))
  const openCount = leaks.filter((x) => x.status !== '조치 완료').length
  const shown = openOnly ? leaks.filter((x) => x.status !== '조치 완료') : leaks

  // 미조치 건만 선택 대상 — 대량 유출 사고(다크웹 덤프 등)에서 다수 건을 같은 표준 조치로 한 번에 처리한다
  const selectable = leaks.filter((l) => l.status !== '조치 완료')
  const toggle = (id: string) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSel = selectable.length > 0 && selectable.every((l) => checked.has(l.id))

  const open = (l: LeakFinding) => { setOpenId(l.id); setNote(LEAK_RESPONSE[l.kind]); setMsg(null) }
  const submit = (id: string) => {
    startTransition(async () => {
      const r = await respondToLeak(id, note)
      setMsg(r.message)
      if (r.ok) { setOpenId(null); setNote('') }
    })
  }
  const bulkAct = () => startTransition(async () => {
    const r = await respondToLeakMany([...checked], bulkNote)
    setMsg(r.message); if (r.ok) setChecked(new Set())
  })
  const reopen = (id: string) => {
    startTransition(async () => {
      const r = await reopenLeak(id)
      setMsg(r.message)
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn sm ${openOnly ? 'pri' : 'ghost'}`} onClick={() => setOpenOnly((v) => !v)}
          title="조치가 끝나지 않은 건만 — 대시보드 '유출 · 침해 미조치' 큐와 같은 집합">
          {openOnly ? '✓ ' : ''}미조치만 {openCount}
        </button>
        <span className="mut" style={{ fontSize: 12 }}>{shown.length} / {leaks.length}건</span>
      </div>
      {canRespond && checked.size > 0 && (
        <div className="hstack" style={{ margin: 14, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="mut" style={{ fontSize: 12.5 }}>선택 {checked.size}건 일괄 대응:</span>
          <input className="input" style={{ width: 320 }} value={bulkNote} disabled={pending} onChange={(e) => setBulkNote(e.target.value)} title="선택 건에 일괄 적용할 표준 조치" />
          <button className="btn sm danger" disabled={pending || !bulkNote.trim()} onClick={bulkAct}>일괄 대응 ({checked.size})</button>
          <button className="btn sm ghost" disabled={pending} onClick={() => setChecked(new Set())}>선택 해제</button>
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {canRespond && <th className="c" style={{ width: 32 }}>
                <input type="checkbox" checked={allSel} disabled={pending || selectable.length === 0} aria-label="미조치 유출 건 전체 선택"
                  onChange={(e) => setChecked(e.target.checked ? new Set(selectable.map((l) => l.id)) : new Set())} />
              </th>}
              <th>구분</th><th>내용</th><th>소스</th><th className="c">신뢰도</th><th>수집일</th>
              <th className="c">대응</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id}>
                {canRespond && <td className="c" onClick={(e) => e.stopPropagation()}>
                  {l.status !== '조치 완료' && <input type="checkbox" checked={checked.has(l.id)} disabled={pending} aria-label={`${l.kind} 선택`} onChange={() => toggle(l.id)} />}
                </td>}
                <td className="strong">{l.kind}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 460 }}>{l.detail}</td>
                <td className="mute">{l.source}</td>
                <td className="c"><Chip tone={CONF_TONE[l.confidence]}>{l.confidence}</Chip></td>
                <td className="tnum">{l.foundAt}</td>
                <td className="c" style={{ minWidth: 160 }}>
                  {l.status === '조치 완료' ? (
                    <span>
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <Chip tone="ok">조치 완료</Chip>
                        {canRespond && <button className="btn sm ghost" disabled={pending} onClick={() => reopen(l.id)} title="오조치였다면 대응을 취소하고 미조치로 되돌립니다">재개</button>}
                      </span>
                      <div className="mut" style={{ fontSize: 10.5, marginTop: 2, whiteSpace: 'normal' }}>{l.respondedBy} · {l.response}</div>
                    </span>
                  ) : !canRespond ? (
                    <Chip tone="err">미조치</Chip>
                  ) : openId === l.id ? (
                    <span className="vstack" style={{ gap: 5 }}>
                      <input className="input" style={{ width: 190 }} value={note} autoFocus disabled={pending}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) submit(l.id) }} />
                      <span className="hstack" style={{ gap: 4 }}>
                        <button className="btn sm danger" disabled={pending || !note.trim()} onClick={() => submit(l.id)}>대응 확정</button>
                        <button className="btn sm ghost" disabled={pending} onClick={() => setOpenId(null)}>취소</button>
                      </span>
                    </span>
                  ) : (
                    <button className="btn sm danger" disabled={pending} onClick={() => open(l)}>대응</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ margin: 14 }}>
        <b>검출에서 대응까지.</b> 유출 수집은 신뢰도 점수화·중복 제거를 거쳐 알려진 자산에 위협 맥락을 부여하고,
        <b> 보안담당</b>이 유형별 표준 조치(계정 재설정·시크릿 로테이션·침해 대응)를 확정합니다. 대응 사실은
        보안운영팀 통지와 감사 로그에 남습니다.
      </div>
    </>
  )
}
