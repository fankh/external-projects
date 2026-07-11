/** 타이틀바 알림 벨 (SVC-13) — 60초 폴링, 클릭 = 읽음 + 해당 화면 이동, 모두 읽음 (B6). */
import { useEffect, useRef, useState } from 'react'
import { notificationService, type Notification, type NotificationDigest } from '../api/services'
import { Chip } from '../components/controls'
import { useI18n } from '../i18n/I18nContext'
import { useShell, type ModuleId } from './ShellContext'

const MODULE_IDS = ['cpq', 'plm', 'code', 'erp', 'toolbox', 'common']

export function NotificationBell() {
  const shell = useShell()
  const { t } = useI18n()
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [digest, setDigest] = useState<NotificationDigest | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const load = () => {
    void notificationService.list(filterType).then(setItems)
    void notificationService.digest().then(setDigest)
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [filterType])   // eslint-disable-line react-hooks/exhaustive-deps

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
          <div className="gt">{t('bell.title', '알림')}<span className="sp" />
            <span style={{ fontWeight: 500, color: 'var(--txt-mute)', fontSize: 10 }}>
              {t('bell.unreadPoll', '미읽음 {n} · 60s 폴링').replace('{n}', String(unread))}
            </span>
            {unread > 0 ? (
              <span data-read-all role="button" style={{
                marginLeft: 8, cursor: 'pointer', fontSize: 10, color: 'var(--title-navy)',
                fontWeight: 700, textDecoration: 'underline',
              }} onClick={(e) => { e.stopPropagation(); readAll() }}>{t('bell.readAll', '모두 읽음')}</span>
            ) : null}
          </div>
          {digest && (digest.overdue > 0 || digest.high > 0) ? (
            <div data-digest style={{ padding: '4px 9px', fontSize: 10.5, background: 'var(--warn-bg, #FCF3DF)',
              borderBottom: '1px solid var(--line)', color: 'var(--txt-dim)', display: 'flex', gap: 8 }}>
              {digest.high > 0 ? <span style={{ color: 'var(--err)', fontWeight: 700 }}>
                {t('bell.high', '긴급')} {digest.high}</span> : null}
              {digest.overdue > 0 ? <span>{t('bell.overdue', '지연 이벤트')} {digest.overdue}</span> : null}
              <span className="sp" style={{ flex: 1 }} />
              <span style={{ color: 'var(--mute)' }}>{t('bell.digest', '요약')}</span>
            </div>
          ) : null}
          <div style={{ padding: '3px 9px', borderBottom: '1px solid var(--line-soft)' }}>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
              aria-label="알림 유형 필터" style={{ fontSize: 10.5, width: '100%' }}>
              <option value="">{t('bell.allTypes', '전체 유형')}</option>
              <option value="ESCALATION">{t('bell.typeEsc', '에스컬레이션')}</option>
              <option value="DEADLINE_WARN">{t('bell.typeDdl', '기한 경고')}</option>
              <option value="APPROVAL_REQUEST">{t('bell.typeAppr', '승인 요청')}</option>
              <option value="APPROVAL_RESULT">{t('bell.typeApprRes', '승인 결과')}</option>
              <option value="TASK_ASSIGNED">{t('bell.typeTask', '업무 배정')}</option>
            </select>
          </div>
          <div className="gc p0" style={{ maxHeight: 280, overflow: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('bell.empty', '알림 없음')}</div>
            ) : (
              <table className="g">
                <tbody>
                  {items.map((n) => (
                    <tr key={n.id} className={n.read ? undefined : 'sel'}
                      style={{ cursor: 'pointer' }} onClick={() => clickItem(n)}>
                      <td style={{ width: 74 }} className="c">{n.at}</td>
                      <td>
                        {n.priority === 'HIGH' ? <Chip tone="err">!</Chip> : (n.read ? null : <Chip tone="warn">N</Chip>)}{' '}
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
