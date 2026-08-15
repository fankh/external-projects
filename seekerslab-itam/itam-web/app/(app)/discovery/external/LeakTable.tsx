'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { LEAK_RESPONSE, type LeakFinding } from '@/lib/types'
import { reopenLeak, respondToLeak } from './actions'

const CONF_TONE = { 높음: 'err', 중간: 'warn', 낮음: 'neutral' } as const

export function LeakTable({ leaks, canRespond }: { leaks: LeakFinding[]; canRespond: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()

  const open = (l: LeakFinding) => { setOpenId(l.id); setNote(LEAK_RESPONSE[l.kind]); setMsg(null) }
  const submit = (id: string) => {
    startTransition(async () => {
      const r = await respondToLeak(id, note)
      setMsg(r.message)
      if (r.ok) { setOpenId(null); setNote('') }
    })
  }
  const reopen = (id: string) => {
    startTransition(async () => {
      const r = await reopenLeak(id)
      setMsg(r.message)
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>구분</th><th>내용</th><th>소스</th><th className="c">신뢰도</th><th>수집일</th>
              <th className="c">대응</th>
            </tr>
          </thead>
          <tbody>
            {leaks.map((l) => (
              <tr key={l.id}>
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
