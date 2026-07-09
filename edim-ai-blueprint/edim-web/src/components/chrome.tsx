/** 앱 크롬 — 타이틀바 · 메뉴바 · MDI 탭 · 상태바 (디자인시안 b03 문법). */
import type { ReactNode } from 'react'
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

export function MenuBar(props: {
  activeModule: ModuleKey
  onModule: (m: ModuleKey) => void
}) {
  const { t } = useI18n()
  const staticL = [t('shell.file', '파일'), t('shell.edit', '편집'), t('shell.view', '조회')]
  const staticR = [t('shell.tools', '도구'), t('shell.window', '창'), t('shell.help', '도움말')]
  return (
    <div className="menubar">
      {staticL.map((m) => <span key={m}>{m}</span>)}
      {MODULES.map((m) => (
        <span key={m.id} className={`mod ${props.activeModule === m.id ? 'on' : ''}`}
          onClick={() => props.onModule(m.id)}>
          {m.id === 'common' ? t('shell.common', '공통') : m.label}
        </span>
      ))}
      {staticR.map((m) => <span key={m}>{m}</span>)}
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
}) {
  return (
    <div className="statusbar">
      {props.fkeys.map((f) => (
        <span key={f.key} className="cell"><b>{f.key}</b> {f.label}</span>
      ))}
      <span className="grow" />
      {(props.cells ?? []).map((c, i) => <span key={i} className="cell">{c}</span>)}
      <span className="cell">{props.dbLabel ?? 'DB: EDIM-PRD'}</span>
    </div>
  )
}
