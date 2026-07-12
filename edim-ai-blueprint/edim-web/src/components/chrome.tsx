/** 앱 크롬 — 타이틀바 · 메뉴바(드롭다운) · MDI 탭 · 상태바 (디자인시안 b03 문법). */
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18nContext'

export function TitleBar(props: {
  context?: ReactNode
  user: string
  bell?: ReactNode
  /** 사용자 라벨 클릭 드롭다운 — 비밀번호 변경·로그아웃 (B8) */
  userMenu?: MenuItem[]
  /** 모듈 링크 — 헤더에 배치 (메뉴라인은 드롭다운 전용) */
  activeModule?: ModuleKey
  onModule?: (m: ModuleKey) => void
  /** D10 — 표시 허용 모듈 필터 (미지정 = 전체) */
  modules?: ModuleKey[]
}) {
  const { t } = useI18n()
  const [userOpen, setUserOpen] = useState(false)
  const userRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!userOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!userRef.current?.contains(e.target as Node)) setUserOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setUserOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [userOpen])
  return (
    <div className="titlebar">
      <span className="lg">E</span>
      <b>EDIM</b>
      <span style={{ color: '#8FA5CC' }}>— NOVA Solution</span>
      {props.onModule ? (
        <span style={{ display: 'inline-flex', gap: 2, marginLeft: 14 }}>
          {MODULES.filter((m) => !props.modules || props.modules.includes(m.id)).map((m) => {
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
      {props.context ? <span style={{ color: '#B9C7E2' }}>{props.context}</span> : null}
      <span className="sp" />
      {props.bell}
      {props.userMenu?.length ? (
        <span ref={userRef} className="u" data-user-menu
          style={{ position: 'relative', cursor: 'pointer' }}
          title="사용자 메뉴 — 비밀번호 변경·로그아웃"
          onClick={() => setUserOpen((v) => !v)}>
          {props.user} <span aria-hidden style={{ fontSize: 8, opacity: .6 }}>▾</span>
          {userOpen ? (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 60, minWidth: 150,
              background: '#fff', border: '1px solid var(--line-strong)',
              boxShadow: '0 4px 12px rgba(20,26,40,.22)', padding: '3px 0',
              color: 'var(--txt)', fontWeight: 400, whiteSpace: 'nowrap', textAlign: 'left',
            }}>
              {props.userMenu.map((it, i) => it.sep ? (
                <div key={i} style={{ borderTop: '1px solid var(--line)', margin: '3px 0' }} />
              ) : (
                <div key={i} style={{ padding: '4px 12px', fontSize: 11.5, cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#EDF2FA' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
                  onClick={(e) => { e.stopPropagation(); setUserOpen(false); it.onClick?.() }}>
                  {it.label}
                </div>
              ))}
            </div>
          ) : null}
        </span>
      ) : <span className="u">{props.user}</span>}
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
  // F10 — 탭 과다 시 폭 압축으로 제목 판독 불가 → 최소폭 + 가로 스크롤 + ▾ 오버플로 목록
  const [listOpen, setListOpen] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // 활성 탭을 항상 가시 영역으로
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
