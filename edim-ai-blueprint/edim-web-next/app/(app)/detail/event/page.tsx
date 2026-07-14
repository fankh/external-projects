import Link from 'next/link'
import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'

export const dynamic = 'force-dynamic'

interface EventRow { eventId: number; procName: string; code: string; project: string; title: string; owner: string; deadline: string; delayed: boolean; status: string }
interface EventFlow { current: string; currentCode: string; prev: string[]; next: string[] }

const statusColor = (s: string) => s === '지연' ? 'var(--err)' : s === 'DONE' ? 'var(--run)' : 'var(--title-navy)'

function FlowNode({ label, tone }: { label: string; tone: 'prev' | 'cur' | 'next' }) {
  const bg = tone === 'cur' ? '#EDF7F1' : '#F3F7FC'
  const bd = tone === 'cur' ? 'var(--run)' : '#4A6FA5'
  return <div style={{ padding: '6px 12px', border: `1.5px solid ${bd}`, background: bg, borderRadius: 3, fontSize: 11, fontWeight: tone === 'cur' ? 700 : 400, whiteSpace: 'nowrap' }}>{label}</div>
}

export default async function EventDetailPage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  let events: EventRow[] = []
  let err: string | null = null
  try {
    events = await apiServer<EventRow[]>('/erp/events')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const sp = await searchParams
  const wantId = sp.eventId ? Number(sp.eventId) : undefined
  const sel = events.find((e) => e.eventId === wantId) ?? events[0]
  let flow: EventFlow | null = null
  if (sel) {
    try { flow = await apiServer<EventFlow>(`/erp/events/${sel.eventId}/flow`) } catch { /* flow optional */ }
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="이벤트 상세 (E-4)" count={err ? undefined : events.length} countLabel="event" source="/erp/events · /erp/events/{id}/flow" />
      {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 6, padding: 6 }}>
          <div className="gb" style={{ width: 320, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>이벤트 목록</div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <table className="g"><thead><tr><th>공정</th><th>제목</th><th>담당</th><th>상태</th></tr></thead>
                <tbody>{events.map((e) => (
                  <tr key={e.eventId} style={{ background: e.eventId === sel?.eventId ? 'var(--edit-cell)' : undefined }}>
                    <td className="code"><Link href={`/detail/event?eventId=${e.eventId}`} style={{ color: 'var(--title-navy)', textDecoration: 'none' }}>{e.code}</Link></td>
                    <td>{e.title}</td><td className="c">{e.owner}</td>
                    <td className="c" style={{ color: statusColor(e.status) }}>{e.status}</td>
                  </tr>
                ))}</tbody></table>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sel ? (
              <div className="gb" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--title-navy)' }}>{sel.procName} — {sel.title}</div>
                <div style={{ fontSize: 11, display: 'flex', gap: 16 }}>
                  <span>프로젝트 <b>{sel.project}</b></span><span>담당 <b>{sel.owner}</b></span>
                  <span>기한 <b style={{ color: sel.delayed ? 'var(--err)' : undefined }}>{sel.deadline}{sel.delayed ? ' (지연)' : ''}</b></span>
                  <span>상태 <b style={{ color: statusColor(sel.status) }}>{sel.status}</b></span>
                </div>
              </div>
            ) : <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>이벤트가 없습니다</div>}
            {flow ? (
              <div className="gb" style={{ padding: 10, flex: 1, minHeight: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>공정 흐름 (erp_process_edge)</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {flow.prev.length ? flow.prev.map((p) => <FlowNode key={p} label={p} tone="prev" />) : <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>(선행 없음)</span>}
                  <span style={{ fontSize: 14, color: 'var(--txt-mute)' }}>→</span>
                  <FlowNode label={`${flow.current} (${flow.currentCode})`} tone="cur" />
                  <span style={{ fontSize: 14, color: 'var(--txt-mute)' }}>→</span>
                  {flow.next.length ? flow.next.map((n) => <FlowNode key={n} label={n} tone="next" />) : <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>(후행 없음)</span>}
                </div>
              </div>
            ) : sel ? <div className="gb" style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>공정 흐름 정보 없음</div> : null}
          </div>
        </div>
      )}
    </div>
  )
}
