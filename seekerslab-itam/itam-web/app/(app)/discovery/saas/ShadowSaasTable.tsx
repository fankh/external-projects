'use client'
import { useMemo, useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import type { SaasUsage } from '@/lib/types'
import { classifyShadowSaas } from './actions'

export function ShadowSaasTable({ rows, canDecide, depts = [] }: { rows: SaasUsage[]; canDecide: boolean; depts?: string[] }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // 목록 필터 — 부서·인가 여부·검색 (다른 목록 화면과 동일 패턴). Shadow SaaS 만 부서별 노출을 좁혀 판정 대상을 고른다.
  const [fdept, setFdept] = useState('전체')
  const [fsanction, setFsanction] = useState<'전체' | '미인가' | '인가'>('전체')
  const [fq, setFq] = useState('')
  const view = useMemo(() => {
    const needle = fq.trim().toLowerCase()
    return rows.filter((x) => {
      if (fdept !== '전체' && x.dept !== fdept) return false
      if (fsanction === '미인가' && x.sanctioned) return false
      if (fsanction === '인가' && !x.sanctioned) return false
      if (needle && ![x.service, x.category, x.dept].some((f) => f.toLowerCase().includes(needle))) return false
      return true
    })
  }, [rows, fdept, fsanction, fq])

  const decide = (service: string, status: '인가' | '차단' | '검토중') => {
    setBusy(service)
    startTransition(async () => {
      const r = await classifyShadowSaas(service, status)
      setMsg(r.message || null)
      setBusy(null)
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="hstack" style={{ gap: 8, flexWrap: 'wrap', padding: '12px 14px 0' }}>
        <select className="select" value={fdept} onChange={(e) => setFdept(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="전체">부서 — 전체</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="seg">
          {(['전체', '미인가', '인가'] as const).map((v) => (
            <button key={v} className={fsanction === v ? 'on' : ''} onClick={() => setFsanction(v)}>{v}</button>
          ))}
        </div>
        <input className="input" style={{ maxWidth: 220 }} placeholder="서비스·분류·부서 검색" value={fq} onChange={(e) => setFq(e.target.value)} />
        {(fdept !== '전체' || fsanction !== '전체' || fq.trim() !== '') && (
          <button className="btn sm ghost" onClick={() => { setFdept('전체'); setFsanction('전체'); setFq('') }}>필터 해제</button>
        )}
        <span className="mut" style={{ marginLeft: 'auto', fontSize: 12 }}>{view.length}/{rows.length}건</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>서비스</th><th>분류</th><th>주 사용 부서</th><th className="num">추정 사용자</th>
              <th className="num">월 접속</th><th className="c">인가 여부</th><th className="c">위험도</th>
              {canDecide && <th className="c">판정</th>}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && <tr><td colSpan={canDecide ? 8 : 7}><div className="empty">조건에 맞는 SaaS 가 없습니다</div></td></tr>}
            {view.map((x) => (
              <tr key={x.id}>
                <td className="strong">{x.service}</td>
                <td className="mute">{x.category}</td>
                <td>{x.dept}</td>
                <td className="num tnum">{x.users.toLocaleString()}</td>
                <td className="num tnum">{x.monthlyVisits.toLocaleString()}</td>
                <td className="c">{x.sanctioned ? <Chip tone="ok">인가</Chip> : <Chip tone="err">미인가</Chip>}</td>
                <td className="c"><RiskChip risk={x.risk} /></td>
                {canDecide && (
                  <td className="c">
                    <span style={{ display: 'inline-flex', gap: 5, justifyContent: 'center' }}>
                      {!x.sanctioned && (
                        <button className="btn sm" disabled={pending} onClick={() => decide(x.service, '인가')}>
                          {busy === x.service ? '…' : '인가'}
                        </button>
                      )}
                      <button className="btn sm danger" disabled={pending} onClick={() => decide(x.service, '차단')}>차단</button>
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
