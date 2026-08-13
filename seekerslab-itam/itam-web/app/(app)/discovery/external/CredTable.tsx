'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { CRED_RESPONSE, type CredentialFinding } from '@/lib/types'
import { respondToCredential } from './actions'

const SEV_TONE = { 높음: 'err', 중간: 'warn', 낮음: 'neutral' } as const

export function CredTable({ credentials, canRespond }: { credentials: CredentialFinding[]; canRespond: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()

  const open = (c: CredentialFinding) => { setOpenId(c.id); setNote(CRED_RESPONSE[c.service]); setMsg(null) }
  const submit = (id: string) => {
    startTransition(async () => {
      const r = await respondToCredential(id, note)
      setMsg(r.message)
      if (r.ok) { setOpenId(null); setNote('') }
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>서비스</th><th>호스트</th><th className="num">포트</th><th>점검 판정</th>
              <th className="c">심각도</th><th>수집일</th><th className="c">대응</th>
            </tr>
          </thead>
          <tbody>
            {credentials.map((c) => (
              <tr key={c.id}>
                <td className="strong">{c.service}</td>
                <td>
                  {c.host}
                  {c.note && <div className="mut" style={{ fontSize: 10.5, whiteSpace: 'normal' }}>{c.note}</div>}
                </td>
                <td className="num tnum">{c.port}</td>
                <td><Chip tone={c.issue === '인증 없음' ? 'err' : 'warn'} bare>{c.issue}</Chip></td>
                <td className="c"><Chip tone={SEV_TONE[c.severity]}>{c.severity}</Chip></td>
                <td className="tnum">{c.foundAt}</td>
                <td className="c" style={{ minWidth: 160 }}>
                  {c.status === '조치 완료' ? (
                    <span>
                      <Chip tone="ok">조치 완료</Chip>
                      <div className="mut" style={{ fontSize: 10.5, marginTop: 2, whiteSpace: 'normal' }}>{c.respondedBy} · {c.response}</div>
                    </span>
                  ) : !canRespond ? (
                    <Chip tone="err">미조치</Chip>
                  ) : openId === c.id ? (
                    <span className="vstack" style={{ gap: 5 }}>
                      <input className="input" style={{ width: 190 }} value={note} autoFocus disabled={pending}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) submit(c.id) }} />
                      <span className="hstack" style={{ gap: 4 }}>
                        <button className="btn sm danger" disabled={pending || !note.trim()} onClick={() => submit(c.id)}>대응 확정</button>
                        <button className="btn sm ghost" disabled={pending} onClick={() => setOpenId(null)}>취소</button>
                      </span>
                    </span>
                  ) : (
                    <button className="btn sm danger" disabled={pending} onClick={() => open(c)}>대응</button>
                  )}
                </td>
              </tr>
            ))}
            {credentials.length === 0 && <tr><td colSpan={7}><div className="empty">점검된 크리덴셜 노출이 없습니다</div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ margin: 14 }}>
        <b>오픈 포트에 한해 점검.</b> 2단계 스캔에서 생존·서비스가 확인된 오픈 포트에만 기본·취약 크리덴셜을
        점검합니다(SSH·DB·FTP·HTTP Basic·Redis·SMTP 등). <b>보안담당</b>이 서비스별 표준 조치를 확정하며,
        대응 사실은 보안운영팀 통지와 감사 로그에 남습니다.
      </div>
    </>
  )
}
