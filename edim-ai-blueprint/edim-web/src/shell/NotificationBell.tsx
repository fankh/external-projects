/** 타이틀바 알림 벨 (SVC-13) — 60초 폴링, 클릭 시 dense 드롭다운 (읽음 처리). */
import { useEffect, useRef, useState } from 'react'
import { notificationService, type Notification } from '../api/services'
import { Chip } from '../components/controls'

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const load = () => void notificationService.list().then(setItems)

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const unread = items.filter((n) => !n.read).length

  const clickItem = (n: Notification) => {
    if (!n.read) {
      void notificationService.markRead(n.id).then(load)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <span style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, color: '#B9C7E2', fontSize: 12 }}
        onClick={() => setOpen(!open)} role="button" aria-label="알림">
        🔔{unread > 0
          ? <span style={{
            background: 'var(--err)', color: '#fff', fontSize: 9, fontWeight: 800,
            borderRadius: 2, padding: '0 4px', lineHeight: '13px',
          }}>{unread}</span>
          : null}
      </span>
      {open ? (
        <div className="gb" style={{
          position: 'absolute', right: 0, top: 24, width: 330, zIndex: 100,
          boxShadow: '0 6px 20px rgba(20,26,40,.28)',
        }}>
          <div className="gt">알림<span className="sp" />
            <span style={{ fontWeight: 500, color: 'var(--txt-mute)', fontSize: 10 }}>
              미읽음 {unread} · 60s 폴링
            </span>
          </div>
          <div className="gc p0" style={{ maxHeight: 280, overflow: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>알림 없음</div>
            ) : (
              <table className="g">
                <tbody>
                  {items.map((n) => (
                    <tr key={n.id} className={n.read ? undefined : 'sel'}
                      style={{ cursor: 'pointer' }} onClick={() => clickItem(n)}>
                      <td style={{ width: 74 }} className="c">{n.at}</td>
                      <td>
                        {n.read ? null : <Chip tone="warn">N</Chip>}{' '}
                        <span style={{ fontSize: 11 }}>{n.title}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
