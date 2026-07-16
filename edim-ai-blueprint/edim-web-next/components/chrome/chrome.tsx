'use client'
/** 앱 크롬 — 타이틀바(모듈 링크) · 메뉴바(드롭다운) · MDI 탭 · 상태바.
 *  레거시 SPA components/chrome.tsx 포팅 (디자인시안 b03 문법, URL 라우팅 적응). */
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { MODULES, type ModuleKey } from './menus'

export function TitleBar(props: {
  user: string
  bell?: ReactNode
  right?: ReactNode           // 로그아웃 폼 등 서버 요소
  activeModule?: ModuleKey
  onModule?: (m: ModuleKey) => void
}) {
  const { t } = useI18n()
  return (
    <div className="titlebar">
      <span className="lg">E</span>
      <b>EDIM</b>
      <span style={{ color: '#8FA5CC' }}>— NOVA Solution</span>
      {props.onModule ? (
        <span style={{ display: 'inline-flex', gap: 2, marginLeft: 14 }}>
          {MODULES.map((m) => {
            const on = props.activeModule === m.id
            return (
              <span key={m.id} className={`mod ${on ? 'on' : ''}`}
                onClick={() => props.onModule?.(m.id)}
                style={{
                  cursor: 'pointer', padding: '2px 9px', borderRadius: 2, fontSize: 11.5,
                  fontWeight: on ? 700 : 500,
                  color: on ? '#fff' : '#B9C7E2',
                  background: on ? '#3A5488' : 'transparent',
                  borderBottom: on ? '2px solid #7FB2E8' : '2px solid transparent',
                }}>
                {m.id === 'common' ? t('shell.common', '공통') : m.label}
              </span>
            )
          })}
        </span>
      ) : null}
      <span className="sp" />
      {props.bell}
      <span className="u">{props.user}</span>
      {props.right}
    </div>
  )
}

export interface MenuItem {
  label: string
  hint?: string
  onClick?: () => void
  disabled?: boolean
  sep?: boolean
}

function MenuDrop(props: {
  label: string
  items: MenuItem[]
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  return (
    <span style={{ position: 'relative' }}
      className={props.open ? 'mod on' : undefined}
      onClick={props.onToggle} data-menu={props.label}>
      {props.label}
      <span aria-hidden style={{ fontSize: 8, marginLeft: 3, opacity: .55, verticalAlign: 1 }}>▾</span>
      {props.open ? (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 60, minWidth: 190,
          background: '#fff', border: '1px solid var(--line-strong)',
          boxShadow: '0 4px 12px rgba(20,26,40,.22)', padding: '3px 0',
          color: 'var(--txt)', fontWeight: 400, whiteSpace: 'nowrap',
        }}>
          {props.items.map((it, i) => it.sep ? (
            <div key={i} style={{ borderTop: '1px solid var(--line)', margin: '3px 0' }} />
          ) : (
            <div key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '3px 12px',
                fontSize: 11.5, cursor: it.disabled ? 'default' : 'pointer',
                color: it.disabled ? 'var(--txt-mute)' : 'var(--txt)',
              }}
              onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = '#EDF2FA' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
              onClick={(e) => {
                e.stopPropagation()
                if (it.disabled) return
                props.onClose()
                it.onClick?.()
              }}>
              <span style={{ flex: 1 }}>{it.label}</span>
              {it.hint ? <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{it.hint}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </span>
  )
}

export function MenuBar(props: { menus: Record<string, MenuItem[]>; right?: ReactNode }) {
  const { t } = useI18n()
  const [open, setOpen] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const order: [string, string][] = [
    [t('shell.file', '파일'), '파일'], [t('shell.edit', '편집'), '편집'], [t('shell.view', '조회'), '조회'],
    [t('shell.tools', '도구'), '도구'], [t('shell.window', '창'), '창'], [t('shell.help', '도움말'), '도움말'],
  ]
  return (
    <div className="menubar" ref={barRef} style={{ alignItems: 'center' }}>
      {order.map(([label, key]) => {
        const items = props.menus[key]
        if (!items) return <span key={key}>{label}</span>
        return (
          <MenuDrop key={key} label={label} items={items}
            open={open === key}
            onToggle={() => setOpen((cur) => (cur === key ? null : key))}
            onClose={() => setOpen(null)} />
        )
      })}
      {props.right}
    </div>
  )
}

export interface MdiTab {
  id: string       // pathname
  code: string
  title: string
}

export function MdiTabs(props: {
  tabs: MdiTab[]
  activeId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
}) {
  const [listOpen, setListOpen] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>('.t.on')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [props.activeId, props.tabs.length])
  return (
    <div className="mdi" style={{ display: 'flex', alignItems: 'stretch', minWidth: 0 }}>
      <div ref={stripRef} data-mdi-strip style={{
        display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', minWidth: 0, flex: 1,
      }}>
        {props.tabs.map((t) => (
          <span key={t.id} className={`t ${t.id === props.activeId ? 'on' : ''}`}
            style={{ flex: '0 0 auto', maxWidth: 190 }}
            title={`${t.code} ${t.title}`}
            onClick={() => props.onActivate(t.id)}>
            <span style={{
              display: 'inline-block', maxWidth: 150, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom',
            }}>{t.code} {t.title}</span>
            <span className="x" onClick={(e) => { e.stopPropagation(); props.onClose(t.id) }}>×</span>
          </span>
        ))}
      </div>
      {props.tabs.length > 0 ? (
        <span style={{ position: 'relative', flex: '0 0 auto', display: 'flex' }}>
          <span className="t" data-mdi-overflow title="열린 탭 목록"
            style={{ flex: '0 0 auto' }}
            onClick={() => setListOpen((v) => !v)}>▾ {props.tabs.length}</span>
          {listOpen ? (
            <div data-mdi-list style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 80, minWidth: 220,
              maxHeight: 300, overflowY: 'auto', background: '#fff',
              border: '1px solid var(--line-strong)', boxShadow: '0 4px 12px rgba(20,26,40,.22)',
              fontSize: 11,
            }}>
              {props.tabs.map((t) => (
                <div key={t.id} style={{
                  padding: '4px 10px', cursor: 'pointer', display: 'flex', gap: 6,
                  fontWeight: t.id === props.activeId ? 700 : 400,
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#EDF2FA' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
                  onClick={() => { props.onActivate(t.id); setListOpen(false) }}>
                  <span style={{ flex: 1 }}>{t.id === props.activeId ? '● ' : ''}{t.code} {t.title}</span>
                  <span style={{ color: 'var(--txt-mute)' }}
                    onClick={(e) => { e.stopPropagation(); props.onClose(t.id) }}>×</span>
                </div>
              ))}
            </div>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}

export function StatusBar(props: { cells?: ReactNode[] }) {
  const fkeys: { key: string; label: string }[] = [
    { key: 'F2', label: '신규' }, { key: 'F3', label: '삭제' }, { key: 'F8', label: '조회' },
    { key: 'F9', label: 'Run' }, { key: 'F12', label: '저장' },
  ]
  return (
    <div className="statusbar">
      {fkeys.map((f) => (
        <span key={f.key} className="cell" data-fkey={f.key}
          style={{ cursor: 'pointer' }} title={`클릭 = ${f.key}`}
          onClick={() => window.dispatchEvent(new CustomEvent('edim-fkey', { detail: f.key }))}>
          <b>{f.key}</b> {f.label}
        </span>
      ))}
      <span className="grow" />
      {(props.cells ?? []).map((c, i) => <span key={i} className="cell">{c}</span>)}
      <span className="cell">DB: EDIM-PRD</span>
    </div>
  )
}
