'use client'
import { useMemo, useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import { entityHref } from '@/lib/reflink'
import { canOpenRoute } from '@/components/chrome/menus'
import type { Role } from '@/lib/types'
import type { Dispatch } from '@/lib/types'
import { resendDispatch } from './actions'

/** 알림 발송 이력 — 발송이 쌓이므로 그대로 나열하면 스캔이 불가능하다.
 *  수신·제목·연결문서 검색 + 종류·채널 필터로 발송 증적 추적을 실사용 가능하게 한다.
 *  전달 실패(반송·게이트웨이 오류) 건은 상태로 드러내고 재발송으로 닫는다(§06 이메일·문자 발송 신뢰성). */
/** 대시보드 '알림 전달 실패' 큐 → 이 화면 딥링크(?dispatch=failed)를 전달 상태 필터로 매핑.
 *  큐가 "전달 실패 1건"이라 말하면 링크가 여는 화면도 그 1건을 보여야 한다(라이선스 큐 ?lic= 규약과 동일). */
const DELIVERY_PARAM: Record<string, '전체' | '실패'> = { failed: '실패' }

export function NotificationLog({ dispatches, canExport, canManage, role, openable, deliveryParam }: { dispatches: Dispatch[]; canExport?: boolean; canManage?: boolean; role: Role; openable?: string[]; deliveryParam?: string }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const resend = (id: string) => startTransition(async () => setMsg((await resendDispatch(id)).message))
  const failed = dispatches.filter((m) => m.deliveryStatus === '실패').length
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState<'전체' | '이메일' | '문자'>('전체')
  const [kind, setKind] = useState('전체')
  // 기간(발송 증적 감사) — 발송 시각(YYYY-MM-DD HH:MM)의 날짜 부분으로 from~to 범위 필터
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [delivery, setDelivery] = useState<'전체' | '실패'>((deliveryParam && DELIVERY_PARAM[deliveryParam]) || '전체')

  const kinds = useMemo(() => ['전체', ...[...new Set(dispatches.map((m) => m.kind))]], [dispatches])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return dispatches.filter((m) => {
      if (delivery === '실패' && m.deliveryStatus !== '실패') return false
      if (channel !== '전체' && m.channel !== channel) return false
      if (kind !== '전체' && m.kind !== kind) return false
      const d = m.at.slice(0, 10)
      if (from && d < from) return false
      if (to && d > to) return false
      if (!needle) return true
      return [m.to, m.subject, m.ref ?? ''].some((f) => f.toLowerCase().includes(needle))
    })
  }, [dispatches, q, channel, kind, from, to, delivery])

  // 내보내기는 지금 화면에 보이는 필터를 그대로 반영한다 (v1.49 감사 로그 반출과 동일)
  const exportHref = `/api/dispatch-export?${new URLSearchParams({ q: q.trim(), channel, kind, from, to, delivery }).toString()}`
  const filtered = q.trim() !== '' || channel !== '전체' || kind !== '전체' || from !== '' || to !== '' || delivery !== '전체'

  return (
    <Card kicker="Notifications" title={`알림 발송 이력 ${dispatches.length}건${failed > 0 ? ` · 전달 실패 ${failed}` : ''}`} pad={false}
      actions={canExport && dispatches.length > 0
        ? <a className="btn sm" href={exportHref} download>발송 이력 엑셀{filtered ? ` (${rows.length}건)` : ''}</a>
        : undefined}>
      {dispatches.length === 0 ? (
        <div className="empty">발송 이력이 없습니다.</div>
      ) : (
        <>
          {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
          <div className="hstack" style={{ gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="수신·제목·연결 문서 검색"
              value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="발송 이력 필터" className="input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ maxWidth: 160 }}>
              {kinds.map((k) => <option key={k} value={k}>{k === '전체' ? '종류 전체' : k}</option>)}
            </select>
            <div className="hstack" style={{ gap: 4 }}>
              {(['전체', '이메일', '문자'] as const).map((c) => (
                <button key={c} className={`btn sm ${channel === c ? 'pri' : 'ghost'}`} onClick={() => setChannel(c)}>{c}</button>
              ))}
            </div>
            <label className="hstack" style={{ gap: 4, fontSize: 12 }} title="발송 증적 기간 시작일">기간
              <input className="input" type="date" style={{ width: 140, height: 28 }} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <span className="mut">~</span>
            <input className="input" type="date" style={{ width: 140, height: 28 }} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="발송 증적 기간 종료일" />
            {(from || to) && <button className="btn sm ghost" onClick={() => { setFrom(''); setTo('') }}>기간 해제</button>}
            {/* 전달 실패만 — 대시보드 재발송 큐의 드릴다운 대상. 실패 건이 없으면 컨트롤을 내주지 않는다(대상 없는 유령 필터 방지). */}
            {dispatches.some((m) => m.deliveryStatus === '실패') && (
              <button className={`btn sm ${delivery === '실패' ? 'err' : 'ghost'}`}
                title="전달 실패(반송·게이트웨이 오류) 건만 — 재발송 대상"
                onClick={() => setDelivery((d) => (d === '실패' ? '전체' : '실패'))}>
                {delivery === '실패' ? '✓ ' : ''}전달 실패 {failed}
              </button>
            )}
            <span className="mut" style={{ fontSize: 12 }}>{rows.length} / {dispatches.length}건</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>발송 ID</th><th className="c">채널</th><th className="c">종류</th><th>수신</th><th>제목</th><th>연결 문서</th><th>발송 시각</th><th className="c">전달</th></tr></thead>
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
                        // 열 수 없는 화면으로 가는 참조는 링크로 내주지 않는다 — 보안담당이 감사 로그의 계약 참조를 누르면
                        //  계약 화면 권한이 없어 대시보드로 튕긴다. 참조 번호는 텍스트로 그대로 남긴다(증적 가치 유지).
                        if (link && !link.external && (!canOpenRoute(link.href, role) || !(openable ?? []).includes(link.href.split('?')[0]))) return m.ref ?? '-'
                        if (!link) return m.ref ?? '-'
                        return (
                          <a href={link.href} title="연결 문서 열기" style={{ color: 'var(--accent-deep)' }}
                            {...(link.external ? { target: '_blank', rel: 'noopener' } : {})}>{m.ref}</a>
                        )
                      })()}
                    </td>
                    <td className="tnum">{m.at}</td>
                    <td className="c" style={{ whiteSpace: 'nowrap' }}>
                      {m.deliveryStatus === '실패' ? (
                        <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                          <Chip tone="err">전달 실패</Chip>
                          {canManage && <button className="btn sm" disabled={pending} onClick={() => resend(m.id)} title="배치·연동 서버로 다시 발송합니다">재발송</button>}
                        </span>
                      ) : <Chip tone="ok">발송</Chip>}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={8}><div className="empty">조건에 맞는 발송 이력이 없습니다</div></td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}
