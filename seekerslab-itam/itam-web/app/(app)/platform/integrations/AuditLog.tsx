'use client'
import { useMemo, useState } from 'react'
import { Card, Chip } from '@/components/ui'
import { entityHref } from '@/lib/reflink'
import { canOpenRoute } from '@/components/chrome/menus'
import type { Role } from '@/lib/types'
import type { AuditLog as AuditLogEntry } from '@/lib/types'

/** 감사 로그 — 액션마다 쌓이므로 그대로 나열하면 스캔이 불가능하다.
 *  수행자·동작·대상 검색 + 수행자·결과 필터로 컴플라이언스 추적을 실사용 가능하게 한다. */
export function AuditLog({ logs, canExport, role, openable }: { logs: AuditLogEntry[]; canExport?: boolean; role: Role; openable?: string[] }) {
  const [q, setQ] = useState('')
  const [result, setResult] = useState<'전체' | '성공' | '실패'>('전체')
  const [actor, setActor] = useState('전체')
  // 기간(감사 대응) — 로그 일시(YYYY-MM-DD HH:MM:SS)의 날짜 부분으로 from~to 범위 필터
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const actors = useMemo(() => ['전체', ...[...new Set(logs.map((l) => l.actor))].sort()], [logs])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return logs.filter((l) => {
      if (result !== '전체' && l.result !== result) return false
      if (actor !== '전체' && l.actor !== actor) return false
      const d = l.at.slice(0, 10)
      if (from && d < from) return false
      if (to && d > to) return false
      if (!needle) return true
      return [l.actor, l.action, l.target].some((f) => f.toLowerCase().includes(needle))
    })
  }, [logs, q, result, actor, from, to])

  // 내보내기는 지금 화면에 보이는 필터를 그대로 반영한다 (필터로 좁힌 그 집합을 반출)
  const exportHref = `/api/audit-export?${new URLSearchParams({ q: q.trim(), actor, result, from, to }).toString()}`
  const filtered = q.trim() !== '' || actor !== '전체' || result !== '전체' || from !== '' || to !== ''

  return (
    <Card kicker="Audit" title="감사 로그" pad={false}
      actions={<span className="hstack" style={{ gap: 8 }}>
        {canExport && <a className="btn sm" href={exportHref} download>감사 로그 엑셀{filtered ? ` (${rows.length}건)` : ''}</a>}
        <span className="chip neutral bare">전자결재 · 자산 이력 · AI 로그 추적성</span>
      </span>}>
      <div className="hstack" style={{ gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="수행자·동작·대상 검색"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={actor} onChange={(e) => setActor(e.target.value)} style={{ maxWidth: 170 }}>
          {actors.map((a) => <option key={a} value={a}>{a === '전체' ? '수행자 전체' : a}</option>)}
        </select>
        <div className="hstack" style={{ gap: 4 }}>
          {(['전체', '성공', '실패'] as const).map((r) => (
            <button key={r} className={`btn sm ${result === r ? 'pri' : 'ghost'}`} onClick={() => setResult(r)}>{r}</button>
          ))}
        </div>
        <label className="hstack" style={{ gap: 4, fontSize: 12 }} title="감사 대응 기간 시작일">기간
          <input className="input" type="date" style={{ width: 140, height: 28 }} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <span className="mut">~</span>
        <input className="input" type="date" style={{ width: 140, height: 28 }} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="감사 대응 기간 종료일" />
        {(from || to) && <button className="btn sm ghost" onClick={() => { setFrom(''); setTo('') }}>기간 해제</button>}
        <span className="mut" style={{ fontSize: 12 }}>{rows.length} / {logs.length}건</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>일시</th><th>수행자</th><th>동작</th><th>대상</th><th>접근 IP</th><th className="c">결과</th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="tnum">{l.at}</td>
                <td className="strong">{l.actor}</td>
                <td>{l.action}</td>
                <td className="code">
                  {(() => {
                    const link = entityHref(l.target)
                        // 열 수 없는 화면으로 가는 참조는 링크로 내주지 않는다 — 보안담당이 감사 로그의 계약 참조를 누르면
                        //  계약 화면 권한이 없어 대시보드로 튕긴다. 참조 번호는 텍스트로 그대로 남긴다(증적 가치 유지).
                        if (link && !link.external && (!canOpenRoute(link.href, role) || !(openable ?? []).includes(link.href.split('?')[0]))) return l.target ?? '-'
                    if (!link) return l.target
                    return (
                      <a href={link.href} title="대상으로 이동" style={{ color: 'var(--accent-deep)' }}
                        {...(link.external ? { target: '_blank', rel: 'noopener' } : {})}>{l.target}</a>
                    )
                  })()}
                </td>
                <td className="tnum mute">{l.ip}</td>
                <td className="c"><Chip tone={l.result === '성공' ? 'ok' : 'err'}>{l.result}</Chip></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6}><div className="empty">조건에 맞는 감사 로그가 없습니다</div></td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
