'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { CRED_RESPONSE, type CredentialFinding } from '@/lib/types'
import { reopenCredential, respondToCredential, respondToCredentialMany } from './actions'

const SEV_TONE = { 높음: 'err', 중간: 'warn', 낮음: 'neutral' } as const

export function CredTable({ credentials, canRespond, openOnly: openOnlyParam }: { credentials: CredentialFinding[]; canRespond: boolean; openOnly?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [bulkNote, setBulkNote] = useState('대량 노출 일괄 대응 — 계정 재설정·세션 무효화·외부 접근 차단')
  const [pending, startTransition] = useTransition()
  // 미조치만 보기 — 대시보드 '크리덴셜 노출 미조치' 큐의 드릴다운. 조치 완료분까지 함께 쌓이는 표라 큐가 말한 건수를
  //  화면에서 다시 세어야 했다(발견 자산 화면의 네 조치 표와 같은 규약).
  const [openOnly, setOpenOnly] = useState(Boolean(openOnlyParam))
  const openCount = credentials.filter((x) => x.status !== '조치 완료').length
  const shown = openOnly ? credentials.filter((x) => x.status !== '조치 완료') : credentials

  // 미조치 건만 선택 대상 — 크리덴셜 스터핑·대량 유출 점검에서 다수 노출을 같은 표준 조치로 한 번에 처리한다
  const selectable = credentials.filter((c) => c.status !== '조치 완료')
  const toggle = (id: string) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSel = selectable.length > 0 && selectable.every((c) => checked.has(c.id))

  const open = (c: CredentialFinding) => { setOpenId(c.id); setNote(CRED_RESPONSE[c.service]); setMsg(null) }
  const submit = (id: string) => {
    startTransition(async () => {
      const r = await respondToCredential(id, note)
      setMsg(r.message)
      if (r.ok) { setOpenId(null); setNote('') }
    })
  }
  const bulkAct = () => startTransition(async () => {
    const r = await respondToCredentialMany([...checked], bulkNote)
    setMsg(r.message); if (r.ok) setChecked(new Set())
  })
  const reopen = (id: string) => {
    startTransition(async () => {
      const r = await reopenCredential(id)
      setMsg(r.message)
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn sm ${openOnly ? 'pri' : 'ghost'}`} onClick={() => setOpenOnly((v) => !v)}
          title="조치가 끝나지 않은 건만 — 대시보드 '크리덴셜 노출 미조치' 큐와 같은 집합">
          {openOnly ? '✓ ' : ''}미조치만 {openCount}
        </button>
        <span className="mut" style={{ fontSize: 12 }}>{shown.length} / {credentials.length}건</span>
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
                <input type="checkbox" checked={allSel} disabled={pending || selectable.length === 0} aria-label="미조치 크리덴셜 노출 전체 선택"
                  onChange={(e) => setChecked(e.target.checked ? new Set(selectable.map((c) => c.id)) : new Set())} />
              </th>}
              <th>서비스</th><th>호스트</th><th className="num">포트</th><th>점검 판정</th>
              <th className="c">심각도</th><th>수집일</th><th className="c">대응</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                {canRespond && <td className="c" onClick={(e) => e.stopPropagation()}>
                  {c.status !== '조치 완료' && <input type="checkbox" checked={checked.has(c.id)} disabled={pending} aria-label={`${c.service} ${c.host} 선택`} onChange={() => toggle(c.id)} />}
                </td>}
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
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <Chip tone="ok">조치 완료</Chip>
                        {canRespond && <button className="btn sm ghost" disabled={pending} onClick={() => reopen(c.id)} title="오조치였다면 대응을 취소하고 미조치로 되돌립니다">재개</button>}
                      </span>
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
            {shown.length === 0 && <tr><td colSpan={canRespond ? 8 : 7}><div className="empty">{credentials.length === 0 ? '점검된 크리덴셜 노출이 없습니다' : '필터에 맞는 항목이 없습니다 — 필터를 해제하면 전체가 보입니다'}</div></td></tr>}
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
