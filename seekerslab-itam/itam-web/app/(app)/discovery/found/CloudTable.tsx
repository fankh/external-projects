'use client'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import { CLOUD_POLICY, type CloudFinding } from '@/lib/types'
import { respondToCloudFinding, revokeCloudException } from '../actions'

const KIND_TONE = { '개인 구독·계정': 'err', '태그 미부착': 'warn', '미관리 리소스': 'warn' } as const

export function CloudTable({ items, canAct, openOnly: openOnlyParam }: { items: CloudFinding[]; canAct: boolean; openOnly?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // 미조치만 보기 — 대시보드 '미관리 클라우드 리소스 미조치' 큐의 드릴다운. 이 화면의 다른 네 조치 표(계정·미인가 SW·USB·로컬 VM)는
  //  이미 같은 필터를 갖고 있었는데 클라우드 표만 빠져 있어, 큐가 말한 건수를 조치 완료분이 섞인 표에서 눈으로 세어야 했다.
  const [openOnly, setOpenOnly] = useState(Boolean(openOnlyParam))
  const openCount = items.filter((x) => !x.action).length
  const shown = openOnly ? items.filter((x) => !x.action) : items

  const act = (id: string, kind: '태그' | '회수' | '예외 승인') => {
    setBusy(id)
    startTransition(async () => {
      const r = await respondToCloudFinding(id, kind)
      setMsg(r.message); setBusy(null)
    })
  }
  const revoke = (id: string) => { setBusy(id); startTransition(async () => { const r = await revokeCloudException(id); setMsg(r.message); setBusy(null) }) }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn sm ${openOnly ? 'pri' : 'ghost'}`} onClick={() => setOpenOnly((v) => !v)}
          title="조치가 끝나지 않은 건만 — 대시보드 '미관리 클라우드 리소스 미조치' 큐와 같은 집합">
          {openOnly ? '✓ ' : ''}미조치만 {openCount}
        </button>
        <span className="mut" data-queue="open=cloud" style={{ fontSize: 12 }}>{shown.length} / {items.length}건</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>리소스</th><th>CSP · 리전</th><th>계정 · 구독</th><th>소유자 · 부서</th><th>정책 분류</th>
              <th className="c">검출</th><th>최초 검출</th><th className="c">위험도</th>
              {canAct && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <td className="strong">
                  {c.resource}
                  {c.note && <div className="mut" style={{ fontSize: 10.5, whiteSpace: 'normal' }}>{c.note}</div>}
                </td>
                <td>{c.provider}</td>
                <td className="code">{c.account}</td>
                <td>{c.owner} <span className="dim">· {c.dept}</span></td>
                <td>
                  <Chip tone={KIND_TONE[c.kind]} bare>{c.kind}</Chip>
                  <div className="mut" style={{ fontSize: 10.5, whiteSpace: 'normal' }}>{CLOUD_POLICY[c.kind]}</div>
                </td>
                <td className="c"><Chip tone="neutral" bare>{c.detectedBy}</Chip></td>
                <td className="tnum">{c.firstSeen}</td>
                <td className="c"><RiskChip risk={c.risk} /></td>
                {canAct && (
                  <td className="c" style={{ whiteSpace: 'nowrap' }}>
                    {c.action === '예외 승인' ? (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <Chip tone="info">예외 승인</Chip>
                        <button className="btn sm ghost" disabled={pending} onClick={() => revoke(c.id)} title="예외 승인 해제 — 다시 정책(태그·회수/예외 판정) 대상으로">예외 해제</button>
                      </span>
                    ) : c.action ? (
                      <Chip tone={c.action.startsWith('회수') ? 'err' : 'info'}>{c.action}</Chip>
                    ) : (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="btn sm" disabled={pending} onClick={() => act(c.id, '태그')} title="소유자·비용센터 태그 부착·소유자 지정 요청">{busy === c.id ? '…' : '태그·소유 지정'}</button>
                        <button className="btn sm danger" disabled={pending} onClick={() => act(c.id, '회수')} title="미관리·개인 구독 리소스 종료(회수) 집행 요청">회수</button>
                        <button className="btn sm" disabled={pending} onClick={() => act(c.id, '예외 승인')}>예외 승인</button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={canAct ? 9 : 8}><div className="empty">{items.length === 0 ? '검출된 미관리 클라우드 리소스가 없습니다' : '필터에 맞는 항목이 없습니다 — 필터를 해제하면 전체가 보입니다'}</div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ margin: 14 }}>
        <b>미관리 클라우드 리소스 통제.</b> CSP API(AWS Config·Azure Resource Graph)가 태그 미부착·개인 구독·미등록 리소스를 검출합니다.
        <b>보안담당</b>이 <b>태그·소유 지정</b>(소유·비용 추적 회복), <b>회수</b>(리소스 종료), <b>예외 승인</b>(업무용 등록) 중 하나로 조치하며,
        요청 사실은 담당 채널 통지와 감사 로그에 남습니다. 개인 구독·개인 액세스키 생성 리소스는 통제·정산 사각지대입니다.
      </div>
    </>
  )
}
