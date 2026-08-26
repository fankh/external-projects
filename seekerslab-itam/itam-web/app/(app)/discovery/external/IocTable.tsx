'use client'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import type { IocMatch } from '@/lib/types'
import { reopenIoc, respondToIoc, respondToIocMany } from './actions'

const CONF_TONE = { 높음: 'err', 중간: 'warn', 낮음: 'neutral' } as const

export function IocTable({ iocs, canRespond, openOnly: openOnlyParam }: { iocs: IocMatch[]; canRespond: boolean; openOnly?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  // 미조치만 보기 — 대시보드 'IOC 상관 미조치' 큐의 드릴다운. 조치 완료분까지 함께 쌓이는 표라 큐가 말한 건수를
  //  화면에서 다시 세어야 했다(발견 자산 화면의 네 조치 표와 같은 규약).
  const [openOnly, setOpenOnly] = useState(Boolean(openOnlyParam))
  const openCount = iocs.filter((x) => !x.action).length
  const shown = openOnly ? iocs.filter((x) => !x.action) : iocs

  // 미조치 건만 선택 대상 — 위협 인텔 피드 갱신으로 다수 IOC가 한꺼번에 상관되면 선택해 한 번에 차단/조사한다
  const selectable = iocs.filter((i) => !i.action)
  const toggle = (id: string) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSel = selectable.length > 0 && selectable.every((i) => checked.has(i.id))

  const act = (id: string, kind: '차단' | '조사') => {
    setBusy(id)
    startTransition(async () => {
      const r = await respondToIoc(id, kind)
      setMsg(r.message); setBusy(null)
    })
  }
  const bulkAct = (kind: '차단' | '조사') => startTransition(async () => {
    const r = await respondToIocMany([...checked], kind)
    setMsg(r.message); if (r.ok) setChecked(new Set())
  })
  const reopen = (id: string) => {
    startTransition(async () => {
      const r = await reopenIoc(id)
      setMsg(r.message)
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn sm ${openOnly ? 'pri' : 'ghost'}`} onClick={() => setOpenOnly((v) => !v)}
          title="조치가 끝나지 않은 건만 — 대시보드 'IOC 상관 미조치' 큐와 같은 집합">
          {openOnly ? '✓ ' : ''}미조치만 {openCount}
        </button>
        <span className="mut" data-queue="open=ioc" style={{ fontSize: 12 }}>{shown.length} / {iocs.length}건</span>
      </div>
      {canRespond && checked.size > 0 && (
        <div className="hstack" style={{ margin: 14, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="mut" style={{ fontSize: 12.5 }}>선택 {checked.size}건 일괄 대응:</span>
          <button className="btn sm danger" disabled={pending} onClick={() => bulkAct('차단')}>차단 ({checked.size})</button>
          <button className="btn sm" disabled={pending} onClick={() => bulkAct('조사')}>조사 착수 ({checked.size})</button>
          <button className="btn sm ghost" disabled={pending} onClick={() => setChecked(new Set())}>선택 해제</button>
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {canRespond && <th className="c" style={{ width: 32 }}>
                <input type="checkbox" checked={allSel} disabled={pending || selectable.length === 0} aria-label="미조치 IOC 전체 선택"
                  onChange={(e) => setChecked(e.target.checked ? new Set(selectable.map((i) => i.id)) : new Set())} />
              </th>}
              <th className="c">IOC 유형</th><th>지표값</th><th>위협 행위자 귀속</th><th>관측·상관</th>
              <th>상관 자산</th><th className="c">신뢰도</th><th className="c">심각도</th>
              {canRespond && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id}>
                {canRespond && <td className="c" onClick={(e) => e.stopPropagation()}>
                  {!i.action && <input type="checkbox" checked={checked.has(i.id)} disabled={pending} aria-label={`${i.iocValue} 선택`} onChange={() => toggle(i.id)} />}
                </td>}
                <td className="c"><Chip tone="neutral" bare>{i.iocType}</Chip></td>
                <td className="code" style={{ whiteSpace: 'normal', maxWidth: 220 }}>
                  {i.iocValue}
                  {i.note && <div className="mut" style={{ fontSize: 10.5, whiteSpace: 'normal' }}>{i.note}</div>}
                </td>
                <td className="strong">{i.threatActor}</td>
                <td><Chip tone="info" bare>{i.matchType}</Chip> <span className="mut" style={{ fontSize: 10.5 }}>{i.source}</span></td>
                <td>{i.matchedAsset} <span className="dim">· {i.dept}</span></td>
                <td className="c"><Chip tone={CONF_TONE[i.confidence]}>{i.confidence}</Chip></td>
                <td className="c"><RiskChip risk={i.severity} /></td>
                {canRespond && (
                  <td className="c" style={{ whiteSpace: 'nowrap' }}>
                    {i.action ? (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <Chip tone={i.action.startsWith('차단') ? 'err' : 'info'}>{i.action}</Chip>
                        <button className="btn sm ghost" disabled={pending} onClick={() => reopen(i.id)} title="오조치였다면 조치를 취소하고 미조치로 되돌립니다">재개</button>
                      </span>
                    ) : (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <button className="btn sm danger" disabled={pending} onClick={() => act(i.id, '차단')}>{busy === i.id ? '…' : '차단'}</button>
                        <button className="btn sm" disabled={pending} onClick={() => act(i.id, '조사')}>조사 착수</button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={canRespond ? 9 : 7}><div className="empty">{iocs.length === 0 ? '상관된 IOC 가 없습니다' : '필터에 맞는 항목이 없습니다 — 필터를 해제하면 전체가 보입니다'}</div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ margin: 14 }}>
        <b>알려진 자산에 위협 맥락 부여.</b> 외부 위협 인텔 피드의 IOC(IP·도메인·파일 해시)를 조직 자산·관측(프록시·EDR 로그)과
        상관해 위협 행위자를 귀속합니다. 신규 자산 발견이 아니라 <b>아는 자산의 악성 통신·감염 징후</b>를 드러냅니다.
        <b> 보안담당</b>이 <b>차단</b>(프록시·방화벽·EDR) 또는 <b>조사 착수</b>(침해 대응)로 조치하며, 사실은 보안운영팀 통지·감사에 남습니다.
      </div>
    </>
  )
}
