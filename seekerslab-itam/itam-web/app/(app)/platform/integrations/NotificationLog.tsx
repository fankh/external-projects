'use client'
import { useMemo, useState } from 'react'
import { Card, Chip } from '@/components/ui'
import { entityHref } from '@/lib/reflink'
import type { Dispatch } from '@/lib/types'

/** 알림 발송 이력 — 발송이 쌓이므로 그대로 나열하면 스캔이 불가능하다.
 *  수신·제목·연결문서 검색 + 종류·채널 필터로 발송 증적 추적을 실사용 가능하게 한다. */
export function NotificationLog({ dispatches, canExport }: { dispatches: Dispatch[]; canExport?: boolean }) {
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState<'전체' | '이메일' | '문자'>('전체')
  const [kind, setKind] = useState('전체')

  const kinds = useMemo(() => ['전체', ...[...new Set(dispatches.map((m) => m.kind))]], [dispatches])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return dispatches.filter((m) => {
      if (channel !== '전체' && m.channel !== channel) return false
      if (kind !== '전체' && m.kind !== kind) return false
      if (!needle) return true
      return [m.to, m.subject, m.ref ?? ''].some((f) => f.toLowerCase().includes(needle))
    })
  }, [dispatches, q, channel, kind])

  // 내보내기는 지금 화면에 보이는 필터를 그대로 반영한다 (v1.49 감사 로그 반출과 동일)
  const exportHref = `/api/dispatch-export?${new URLSearchParams({ q: q.trim(), channel, kind }).toString()}`
  const filtered = q.trim() !== '' || channel !== '전체' || kind !== '전체'

  return (
    <Card kicker="Notifications" title={`알림 발송 이력 ${dispatches.length}건`} pad={false}
      actions={canExport && dispatches.length > 0
        ? <a className="btn sm" href={exportHref} download>발송 이력 엑셀{filtered ? ` (${rows.length}건)` : ''}</a>
        : undefined}>
      {dispatches.length === 0 ? (
        <div className="empty">발송 이력이 없습니다.</div>
      ) : (
        <>
          <div className="hstack" style={{ gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="수신·제목·연결 문서 검색"
              value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ maxWidth: 160 }}>
              {kinds.map((k) => <option key={k} value={k}>{k === '전체' ? '종류 전체' : k}</option>)}
            </select>
            <div className="hstack" style={{ gap: 4 }}>
              {(['전체', '이메일', '문자'] as const).map((c) => (
                <button key={c} className={`btn sm ${channel === c ? 'pri' : 'ghost'}`} onClick={() => setChannel(c)}>{c}</button>
              ))}
            </div>
            <span className="mut" style={{ fontSize: 12 }}>{rows.length} / {dispatches.length}건</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>발송 ID</th><th className="c">채널</th><th className="c">종류</th><th>수신</th><th>제목</th><th>연결 문서</th><th>발송 시각</th></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td className="code">{m.id}</td>
                    <td className="c"><Chip tone={m.channel === '문자' ? 'warn' : 'info'}>{m.channel}</Chip></td>
                    <td className="c mute">{m.kind}</td>
                    <td>{m.to}</td>
                    <td className="strong" style={{ maxWidth: 360 }}>{m.subject}</td>
                    <td className="code">
                      {(() => {
                        const link = entityHref(m.ref)
                        if (!link) return m.ref ?? '-'
                        return (
                          <a href={link.href} title="연결 문서 열기" style={{ color: 'var(--accent-deep)' }}
                            {...(link.external ? { target: '_blank', rel: 'noopener' } : {})}>{m.ref}</a>
                        )
                      })()}
                    </td>
                    <td className="tnum">{m.at}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7}><div className="empty">조건에 맞는 발송 이력이 없습니다</div></td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}
