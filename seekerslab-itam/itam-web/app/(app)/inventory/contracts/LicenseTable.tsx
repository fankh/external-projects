'use client'
import { useMemo, useState } from 'react'
import { Chip } from '@/components/ui'
import { contractHref } from '@/lib/reflink'
import type { SwLicense } from '@/lib/types'
import { LicenseAction, LicenseRecontract, LicenseRenew, LicenseRetire, LicenseSeats } from './LicenseActions'

// 근거 계약 해지 여부·대기 결재는 서버에서 미리 계산해 넘긴다(클라이언트는 계약·결재 원본을 모른다)
type LicRow = SwLicense & { d: number | null; baseTerminated: boolean; pendingApproval?: string }

type Verdict = '전체' | '초과' | '미사용' | '만료'
// 대시보드 라이선스 큐 → 계약·라이선스 화면 딥링크(?lic=)를 판정 필터로 매핑. over=초과 사용, under=미사용 보유, expired=만료 경과.
const LIC_PARAM: Record<string, Verdict> = { over: '초과', under: '미사용', expired: '만료' }

export function LicenseTable({ rows, sel, canEdit, expiryWindowDays, lic }: { rows: LicRow[]; sel?: string; canEdit: boolean; expiryWindowDays: number; lic?: string }) {
  const [fstatus, setFstatus] = useState<'전체' | '유효' | '해지'>('전체')
  const [fexpiring, setFexpiring] = useState(false)
  const [fverdict, setFverdict] = useState<Verdict>((lic && LIC_PARAM[lic]) || '전체')
  const [fq, setFq] = useState('')

  const derive = (l: LicRow) => {
    const retired = l.status === '해지'
    const expired = !retired && l.expiry !== '-' && l.d !== null && l.d < 0
    const over = !retired && l.used > l.purchased
    const low = !retired && !over && l.used / l.purchased < 0.6
    return { retired, expired, over, low }
  }

  const filtered = useMemo(() => {
    const needle = fq.trim().toLowerCase()
    return rows.filter((l) => {
      const { retired, expired, over, low } = derive(l)
      if (fstatus === '해지' && !retired) return false
      if (fstatus === '유효' && retired) return false
      if (fexpiring && !(!retired && l.expiry !== '-' && l.d !== null && l.d <= expiryWindowDays)) return false
      if (fverdict === '초과' && !over) return false
      if (fverdict === '미사용' && !low) return false
      if (fverdict === '만료' && !expired) return false
      if (!needle) return true
      return [l.id, l.name, l.vendor, l.contractId].some((f) => f?.toLowerCase().includes(needle))
    })
  }, [rows, fstatus, fexpiring, fverdict, fq, expiryWindowDays])

  const filterActive = fstatus !== '전체' || fexpiring || fverdict !== '전체' || fq.trim() !== ''
  const expiringCount = rows.filter((l) => l.status !== '해지' && l.expiry !== '-' && l.d !== null && l.d <= expiryWindowDays).length

  return (
    <>
      <div className="qbar" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
        <select aria-label="라이선스 상태 필터" className="select" value={fstatus} onChange={(e) => setFstatus(e.target.value as '전체' | '유효' | '해지')} style={{ maxWidth: 130 }}>
          <option value="전체">상태 — 전체</option>
          <option value="유효">유효(구독 중)</option>
          <option value="해지">해지</option>
        </select>
        <select aria-label="라이선스 판정 필터" className="select" value={fverdict} onChange={(e) => setFverdict(e.target.value as Verdict)} style={{ maxWidth: 150 }}>
          <option value="전체">판정 — 전체</option>
          <option value="초과">초과 사용 (감사 리스크)</option>
          <option value="미사용">미사용 보유 (회수 후보)</option>
          <option value="만료">만료 경과 (갱신 필요)</option>
        </select>
        {expiringCount > 0 && (
          <button className={`btn sm ${fexpiring ? 'warn' : ''}`} onClick={() => setFexpiring((v) => !v)}
            title={`만료 ${expiryWindowDays}일 이내(경과 포함)·해지 제외`}>{fexpiring ? '✓ ' : ''}만료 임박 {expiringCount}</button>
        )}
        <input className="input" style={{ width: 200 }} placeholder="라이선스명·공급사·근거계약 검색" value={fq} onChange={(e) => setFq(e.target.value)} />
        {filterActive && <button className="btn sm ghost" onClick={() => { setFstatus('전체'); setFexpiring(false); setFverdict('전체'); setFq('') }}>필터 해제</button>}
        <span className="cnt">{filtered.length}건 / 전체 {rows.length}건</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>라이선스</th><th>공급사</th><th>근거 계약</th><th className="num">보유</th><th className="num">사용</th>
              <th style={{ width: 220 }}>보유–사용 대사</th><th>만료일</th><th className="c">판정</th><th className="c">조치</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => {
              const ratio = Math.min((l.used / l.purchased) * 100, 100)
              const { retired, expired, over, low } = derive(l)
              return (
                <tr key={l.id} className={`${l.id === sel ? 'sel' : ''}`} style={retired ? { opacity: 0.6 } : undefined}>
                  <td className="strong">{l.name}</td>
                  <td className="mute">{l.vendor}</td>
                  <td className="code">{l.contractId
                    ? <span className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
                        <a href={contractHref(l.contractId)} style={{ color: 'var(--accent-deep)' }} title="근거 계약으로 이동">{l.contractId}</a>
                        {l.baseTerminated && <Chip tone="err" bare>근거 해지</Chip>}
                      </span>
                    : <Chip tone="warn" bare>미연계</Chip>}</td>
                  <td className="num tnum">{l.purchased.toLocaleString()}</td>
                  <td className="num tnum" style={over ? { color: 'var(--err)', fontWeight: 700 } : undefined}>{l.used.toLocaleString()}</td>
                  <td>
                    <div className="meter">
                      <div className="bar"><i className={over ? 'over' : low ? 'low' : ''} style={{ width: `${ratio}%` }} /></div>
                      <div className="lbl"><span>{Math.round((l.used / l.purchased) * 100)}%</span><span>{over ? `${l.used - l.purchased}석 초과` : `${l.purchased - l.used}석 여유`}</span></div>
                    </div>
                    {!retired && <LicenseSeats id={l.id} name={l.name} purchased={l.purchased} used={l.used} seats={l.seats ?? []} canEdit={canEdit} />}
                  </td>
                  <td><LicenseRenew id={l.id} expiry={l.expiry} renewals={l.renewals?.length ?? 0} canEdit={!retired && canEdit} /></td>
                  <td className="c">
                    <span className="hstack" style={{ gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {expired && <Chip tone="err" bare>만료</Chip>}
                      {retired ? <Chip tone="neutral">해지</Chip> : over ? <Chip tone="err">초과 사용</Chip> : low ? <Chip tone="warn">미사용 보유</Chip> : <Chip tone="ok">적정</Chip>}
                    </span>
                  </td>
                  <td className="c" style={{ minWidth: 120 }}>
                    <span className="hstack" style={{ gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {retired ? (
                        <span className="mut" style={{ fontSize: 11 }} title={`${l.terminatedAt ?? ''} 해지`}>해지됨</span>
                      ) : (
                        <>
                          <LicenseAction row={{ id: l.id, over, low, seats: Math.abs(l.used - l.purchased), pendingApproval: l.pendingApproval }} />
                          {l.baseTerminated && canEdit && <LicenseRecontract id={l.id} />}
                          {canEdit && <LicenseRetire id={l.id} />}
                        </>
                      )}
                      <a className="btn sm ghost" href={`/api/license-card/${l.id}`} target="_blank" rel="noopener" title="라이선스 컴플라이언스 카드(SAM 감사용) 인쇄">🖨</a>
                    </span>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && <tr><td colSpan={9}><div className="empty">{rows.length === 0 ? '등록된 라이선스가 없습니다' : '조건에 맞는 라이선스가 없습니다'}</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
