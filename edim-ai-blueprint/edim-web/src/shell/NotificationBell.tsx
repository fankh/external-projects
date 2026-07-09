/** 타이틀바 알림 벨 (SVC-13) — 60초 폴링, 클릭 = 읽음 + 해당 화면 이동, 모두 읽음 (B6). */
import { useEffect, useRef, useState } from 'react'
import { notificationService, type Notification } from '../api/services'
import { Chip } from '../components/controls'
import { useShell, type ModuleId } from './ShellContext'

const MODULE_IDS = ['cpq', 'plm', 'code', 'erp', 'toolbox', 'common']

export function NotificationBell() {
  const shell = useShell()
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
    // 클릭 = 해당 화면 이동 (link '/common' 등 → 모듈 전환 + 관련 탭)
    const m = (n.link ?? '').replace(/^\//, '')
    if (MODULE_IDS.includes(m)) {
      shell.setModule(m as ModuleId)
      if (n.type === 'APPROVAL_REQUEST' || n.type === 'APPROVAL_RESULT') {
        shell.openTab({ id: 'com-approval', screenId: 'com-approval', code: 'M-15-2', title: '승인함' })
      } else if (n.type === 'TASK_ASSIGNED') {
        shell.openTab({ id: 'com-tasks', screenId: 'com-tasks', code: 'M-15-3', title: '부서 업무함' })
      } else if (n.type === 'ESCALATION') {
        shell.openTab({ id: 'erp-dashboard', screenId: 'erp-dashboard', code: 'M-14-4', title: 'Dashboard' })
      }
      setOpen(false)
    }
  }

  const readAll = () => {
    void notificationService.readAll().then(load)
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
          color: 'var(--txt)', fontSize: 11.5, fontWeight: 400, textAlign: 'left',
        }}>
          <div className="gt">알림<span className="sp" />
            <span style={{ fontWeight: 500, color: 'var(--txt-mute)', fontSize: 10 }}>
              미읽음 {unread} · 60s 폴링
            </span>
            {unread > 0 ? (
              <span data-read-all role="button" style={{
                marginLeft: 8, cursor: 'pointer', fontSize: 10, color: 'var(--title-navy)',
                fontWeight: 700, textDecoration: 'underline',
              }} onClick={(e) => { e.stopPropagation(); readAll() }}>모두 읽음</span>
            ) : null}
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
