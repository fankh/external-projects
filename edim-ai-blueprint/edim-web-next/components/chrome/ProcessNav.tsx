'use client'

/** 2.0 — 좌측 패널 = 업무 프로세스 (요구 #15/#17 Panel Binding).
 *
 * 고정 메뉴 트리 대신 고객사가 정의한 업무 흐름을 좌측에 표시한다.
 * 각 단계는 화면(href)에 바인딩되며 이름·순서·계층·아이콘을 자유롭게 편집한다.
 * 프로세스가 아직 없으면 표준 흐름 시드 버튼을 노출하고, 메뉴 모드로 되돌릴 수도 있다.
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import {
  addProcessNode, deleteProcessNode, moveProcessNode, patchProcessNode, seedProcess,
  type ProcessNode,
} from './shellActions'

export function ProcessNav({
  nodes, width, activeHref, canEdit, onSwitchToMenu, onRefresh, footer,
}: {
  nodes: ProcessNode[]
  width: number
  activeHref: string
  canEdit: boolean
  onSwitchToMenu: () => void
  onRefresh: () => void
  footer?: React.ReactNode
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [edit, setEdit] = useState(false)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [busy, start] = useTransition()
  const [addTo, setAddTo] = useState<number | null | undefined>(undefined)
  const [newName, setNewName] = useState('')
  const [newHref, setNewHref] = useState('')

  const roots = useMemo(() => nodes.filter((n) => !n.parentId).sort((a, b) => a.stepNo - b.stepNo), [nodes])
  const childrenOf = (id: number) => nodes.filter((n) => n.parentId === id).sort((a, b) => a.stepNo - b.stepNo)

  const run = (fn: () => Promise<{ error?: string; ok?: string }>) => start(async () => {
    const r = await fn()
    setMsg(r.error ? { text: r.error, err: true } : { text: r.ok ?? '완료' })
    if (!r.error) onRefresh()
  })

  const submitAdd = () => {
    if (!newName.trim()) return
    run(async () => {
      const r = await addProcessNode(newName.trim(), addTo ?? null, newHref.trim(), '')
      setNewName(''); setNewHref(''); setAddTo(undefined)
      return r
    })
  }

  const renderNode = (n: ProcessNode, depth: number) => {
    const active = !!n.screenHref && activeHref.startsWith(n.screenHref)
    return (
      <div key={n.nodeId}>
        <div className={`tn ${active ? 'sel' : ''}`} data-process-node={n.nodeId}
          style={{ paddingLeft: 6 + depth * 12, display: 'flex', alignItems: 'center', gap: 3 }}
          onClick={() => { if (n.screenHref) router.push(n.screenHref) }}
          title={n.note || n.screenHref || undefined}>
          {n.icon ? <span style={{ flexShrink: 0 }}>{n.icon}</span> : <span className="ico">{depth ? '·' : '▣'}</span>}
          {/* 2.5 — 표준 단계는 번역, 테넌트가 개명한 단계는 저장된 이름 그대로(폴백) */}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(`process.node.${n.name}`, n.name)}</span>
          {!n.screenHref && !childrenOf(n.nodeId).length
            ? <span style={{ color: 'var(--txt-mute)', fontSize: 9 }}>({t('process.unbound', '미연결')})</span> : null}
          {edit ? (
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 1, flexShrink: 0 }}
              onClick={(e) => e.stopPropagation()}>
              <span className="b ic" data-process-up title={t('process.up', '위로')} style={{ cursor: 'pointer' }}
                onClick={() => run(() => moveProcessNode(n.nodeId, 'up'))}>▲</span>
              <span className="b ic" data-process-down title={t('process.down', '아래로')} style={{ cursor: 'pointer' }}
                onClick={() => run(() => moveProcessNode(n.nodeId, 'down'))}>▼</span>
              <span className="b ic" data-process-rename title={t('process.rename', '이름·화면 변경')} style={{ cursor: 'pointer' }}
                onClick={() => {
                  const name = prompt(t('process.renamePrompt', '단계 이름'), n.name)
                  if (name === null) return
                  const href = prompt(t('process.hrefPrompt', '연결 화면 경로 (예: /erp/projects, 비우면 그룹)'), n.screenHref)
                  if (href === null) return
                  run(() => patchProcessNode(n.nodeId, { name, screenHref: href }))
                }}>✎</span>
              <span className="b ic" data-process-add-child title={t('process.addChild', '하위 단계 추가')} style={{ cursor: 'pointer' }}
                onClick={() => { setAddTo(n.nodeId); setNewName(''); setNewHref('') }}>＋</span>
              <span className="b ic" data-process-del title={t('process.del', '삭제')} style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (confirm(`${n.name} 단계를 삭제하시겠습니까? (하위 포함)`)) run(() => deleteProcessNode(n.nodeId))
                }}>✕</span>
            </span>
          ) : null}
        </div>
        {childrenOf(n.nodeId).map((c) => renderNode(c, depth + 1))}
        {edit && addTo === n.nodeId ? (
          <div style={{ padding: '3px 6px 3px ' + (18 + depth * 12) + 'px', display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <input className="in" autoFocus placeholder={t('process.namePh', '단계 이름')} style={{ width: 92, fontSize: 10.5 }}
              value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitAdd() }} />
            <input className="in" placeholder="/erp/..." style={{ width: 92, fontSize: 10.5 }}
              value={newHref} onChange={(e) => setNewHref(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitAdd() }} />
            <button className="b run" data-process-add-save disabled={busy || !newName.trim()} onClick={submitAdd}>✓</button>
            <button className="b" onClick={() => setAddTo(undefined)}>✕</button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="lnav" data-process-nav
      style={{ width, flexShrink: 0, borderRight: '1px solid var(--line)', display: 'flex',
        flexDirection: 'column', minHeight: 0, background: 'var(--panel, #F4F6FA)' }}>
      <div className="hd" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span>{t('process.title', '업무 프로세스')}</span>
        <span style={{ flex: 1 }} />
        {canEdit ? (
          <span className="b ic" data-process-edit title={t('process.editHint', '프로세스 편집 (추가·순서·연결 화면)')}
            style={{ cursor: 'pointer', fontSize: 11, color: edit ? 'var(--run)' : undefined }}
            onClick={() => { setEdit(!edit); setAddTo(undefined) }}>✎</span>
        ) : null}
        <span className="b ic" data-process-to-menu title={t('process.toMenu', '메뉴 모드로 보기')}
          style={{ cursor: 'pointer', fontSize: 11 }} onClick={onSwitchToMenu}>☰</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {roots.length ? roots.map((n) => renderNode(n, 0)) : (
          <div style={{ padding: 10, fontSize: 10.5, color: 'var(--txt-mute)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>{t('process.empty', '정의된 업무 프로세스가 없습니다')}</span>
            {canEdit ? (
              <button className="b run" data-process-seed disabled={busy}
                onClick={() => run(seedProcess)}>{t('process.seed', '표준 프로세스 생성')}</button>
            ) : null}
            <span>{t('process.emptyHint', '생성 후 ✎ 로 단계·순서·연결 화면을 자유롭게 바꿀 수 있습니다')}</span>
          </div>
        )}
        {edit && roots.length ? (
          addTo === null ? (
            <div style={{ padding: '4px 6px', display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <input className="in" autoFocus placeholder={t('process.namePh', '단계 이름')} style={{ width: 92, fontSize: 10.5 }}
                value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitAdd() }} />
              <input className="in" placeholder="/erp/..." style={{ width: 92, fontSize: 10.5 }}
                value={newHref} onChange={(e) => setNewHref(e.target.value)} />
              <button className="b run" data-process-add-save disabled={busy || !newName.trim()} onClick={submitAdd}>✓</button>
              <button className="b" onClick={() => setAddTo(undefined)}>✕</button>
            </div>
          ) : (
            <div style={{ padding: '4px 6px' }}>
              <button className="b" data-process-add-root onClick={() => { setAddTo(null); setNewName(''); setNewHref('') }}>
                ＋ {t('process.addRoot', '최상위 단계')}
              </button>
            </div>
          )
        ) : null}
        {msg ? (
          <div style={{ padding: '3px 8px', fontSize: 10, color: msg.err ? 'var(--err)' : 'var(--run)' }}>{msg.text}</div>
        ) : null}
      </div>
      {footer}
    </div>
  )
}
