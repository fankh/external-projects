/** 앱 크롬 — 타이틀바 · 메뉴바(드롭다운) · MDI 탭 · 상태바 (디자인시안 b03 문법). */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n/I18nContext'

export function TitleBar(props: { context?: ReactNode; user: string; bell?: ReactNode }) {
  return (
    <div className="titlebar">
      <span className="lg">E</span>
      <b>EDIM</b>
      <span style={{ color: '#8FA5CC' }}>— NOVA Solution</span>
      {props.context ? <span style={{ color: '#B9C7E2' }}>{props.context}</span> : null}
      <span className="sp" />
      {props.bell}
      <span className="u">{props.user}</span>
    </div>
  )
}

export type ModuleKey = 'cpq' | 'plm' | 'code' | 'erp' | 'toolbox' | 'common'

const MODULES: { id: ModuleKey; label: string }[] = [
  { id: 'toolbox', label: 'Toolbox' },
  { id: 'cpq', label: 'CPQ' },
  { id: 'plm', label: 'PLM' },
  { id: 'code', label: 'Code Set-up' },
  { id: 'erp', label: 'ERP' },
  { id: 'common', label: '공통' },
]

export interface MenuItem {
  label: string
  hint?: string           // 우측 단축키 표기
  onClick?: () => void
  disabled?: boolean
  sep?: boolean           // true = 구분선 (label 무시)
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
      <span aria-hidden style={{
        fontSize: 8, marginLeft: 3, opacity: .55, verticalAlign: 1,
      }}>▾</span>
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

export function MenuBar(props: {
  activeModule: ModuleKey
  onModule: (m: ModuleKey) => void
  menus?: Record<string, MenuItem[]>   // 파일·편집·조회·도구·창·도움말 드롭다운
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  // 바깥 클릭·Esc 로 닫기
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

  const staticL = [t('shell.file', '파일'), t('shell.edit', '편집'), t('shell.view', '조회')]
  const staticR = [t('shell.tools', '도구'), t('shell.window', '창'), t('shell.help', '도움말')]
  const drop = (label: string, koKey: string) => {
    const items = props.menus?.[koKey]
    if (!items) return <span key={label}>{label}</span>
    return (
      <MenuDrop key={label} label={label} items={items}
        open={open === koKey}
        onToggle={() => setOpen((cur) => (cur === koKey ? null : koKey))}
        onClose={() => setOpen(null)} />
    )
  }
  return (
    <div className="menubar" ref={barRef}>
      {drop(staticL[0], '파일')}
      {drop(staticL[1], '편집')}
      {drop(staticL[2], '조회')}
      {MODULES.map((m) => (
        <span key={m.id} className={`mod ${props.activeModule === m.id ? 'on' : ''}`}
          onClick={() => { setOpen(null); props.onModule(m.id) }}>
          {m.id === 'common' ? t('shell.common', '공통') : m.label}
        </span>
      ))}
      {drop(staticR[0], '도구')}
      {drop(staticR[1], '창')}
      {drop(staticR[2], '도움말')}
    </div>
  )
}

export interface MdiTab {
  id: string
  code: string     // C-1, S-4-1-1 …
  title: string
}

export function MdiTabs(props: {
  tabs: MdiTab[]
  activeId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
}) {
  return (
    <div className="mdi">
      {props.tabs.map((t) => (
        <span key={t.id} className={`t ${t.id === props.activeId ? 'on' : ''}`}
          onClick={() => props.onActivate(t.id)}>
          {t.code} {t.title}
          <span className="x" onClick={(e) => { e.stopPropagation(); props.onClose(t.id) }}>×</span>
        </span>
      ))}
    </div>
  )
}

export interface FKeyDef { key: string; label: string }

export function StatusBar(props: {
  fkeys: FKeyDef[]
  cells?: ReactNode[]
  dbLabel?: ReactNode
  onFKey?: (key: string) => void   // 클릭 = 해당 F-key 실행
}) {
  return (
    <div className="statusbar">
      {props.fkeys.map((f) => (
        <span key={f.key} className="cell" data-fkey={f.key}
          style={props.onFKey ? { cursor: 'pointer' } : undefined}
          title={props.onFKey ? `클릭 = ${f.key}` : undefined}
          onClick={() => props.onFKey?.(f.key)}>
          <b>{f.key}</b> {f.label}
        </span>
      ))}
      <span className="grow" />
      {(props.cells ?? []).map((c, i) => <span key={i} className="cell">{c}</span>)}
      <span className="cell">{props.dbLabel ?? 'DB: EDIM-PRD'}</span>
    </div>
  )
}
