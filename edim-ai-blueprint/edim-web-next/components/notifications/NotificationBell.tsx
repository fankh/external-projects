'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { listNotifications, markRead, markAllRead, type Notification } from './actions'

const PRIO_COLOR: Record<string, string> = { HIGH: 'var(--err)', MED: 'var(--warn)', LOW: 'var(--txt-mute)' }

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(initialUnread)
  const [items, setItems] = useState<Notification[]>([])
  const [loaded, setLoaded] = useState(false)
  const [, start] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  // 배경 클릭 닫기
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const toggle = () => {
    const next = !open; setOpen(next)
    if (next && !loaded) void listNotifications(false, 20).then((r) => { setItems(r); setLoaded(true) })
  }
  const onRead = (n: Notification) => start(async () => {
    if (!n.read) { await markRead(n.id); setItems((xs) => xs.map((x) => x.id === n.id ? { ...x, read: true } : x)); setUnread((u) => Math.max(0, u - 1)) }
    if (n.link) { setOpen(false); router.push(n.link) }
  })
  const allRead = () => start(async () => { await markAllRead(); setItems((xs) => xs.map((x) => ({ ...x, read: true }))); setUnread(0) })

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="b ic" title="알림" onClick={toggle} style={{ position: 'relative' }}>
        🔔{unread > 0 ? <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--err)', color: '#fff', fontSize: 8, fontWeight: 700, borderRadius: 8, minWidth: 13, height: 13, lineHeight: '13px', padding: '0 3px' }}>{unread > 99 ? '99+' : unread}</span> : null}
      </button>
      {open ? (
        <div style={{ position: 'absolute', top: 24, right: 0, width: 320, maxHeight: 400, overflow: 'auto', background: '#fff', color: 'var(--txt)', fontWeight: 400, textAlign: 'left', border: '1px solid var(--line-strong)', borderRadius: 4, boxShadow: '0 6px 24px rgba(20,26,40,.25)', zIndex: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid var(--line)' }}>
            <b style={{ fontSize: 11.5 }}>알림 {unread > 0 ? `(${unread})` : ''}</b>
            <span style={{ flex: 1 }} />
            {unread > 0 ? <button className="b" onClick={allRead} style={{ height: 18, fontSize: 10 }}>모두 읽음</button> : null}
          </div>
          {!loaded ? <div style={{ padding: 16, fontSize: 11, color: 'var(--txt-mute)', textAlign: 'center' }}>불러오는 중…</div>
            : items.length ? items.map((n) => (
              <div key={n.id} onClick={() => onRead(n)} style={{ padding: '8px 10px', borderBottom: '1px solid var(--line-soft)', cursor: n.link ? 'pointer' : 'default', background: n.read ? '#fff' : '#F4F8FD', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: PRIO_COLOR[n.priority ?? 'LOW'], marginTop: 4, flex: 'none' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: n.read ? 400 : 600 }}>{n.title}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>{n.type} · {n.at}</div>
                </div>
              </div>
            )) : <div style={{ padding: 16, fontSize: 11, color: 'var(--txt-mute)', textAlign: 'center' }}>알림이 없습니다</div>}
        </div>
      ) : null}
    </div>
  )
}
