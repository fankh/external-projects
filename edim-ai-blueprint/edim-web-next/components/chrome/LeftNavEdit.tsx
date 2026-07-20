'use client'

/** 좌측 사용자 메뉴 편집 모달 — 표시 항목(↑↓✕ 재정렬·제거) + 항목 추가(그룹별 카탈로그) + 기본값 복원.
 *  저장 = /prefs/leftnav (모듈별 leaf node id 순서). 원본 PPT "ERP Toolbar 사용자 편집" (ERP-016). */
import { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { MENU_TREE, NODE_BY_ID, moduleLeaves, withFolderMarkers, type ModuleKey, type NavNode } from './menus'

export function LeftNavEditModal(props: {
  open: boolean
  onClose: () => void
  module: ModuleKey
  canReadAdmin: boolean
  value: string[] | undefined                  // 현재 모듈 pref (undefined = 기본 전체)
  onSave: (ids: string[] | undefined) => void  // undefined = 기본값 복원
  title?: string                               // U21 — 헤더 메뉴 편집 재사용 시 제목 교체
  /** U30 — 관리자: 현재 초안을 테넌트 기본으로 저장 (개인 pref 없는 사용자에게 적용) */
  onSaveTenant?: (ids: string[]) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<string[]>([])
  const label = (id: string) => {
    if (id.startsWith('#')) return id.slice(1).trim() || '폴더'
    const n = NODE_BY_ID[id]
    return n ? t(`menu.${n.id}`, n.label) : id
  }
  // U34 — 커스텀 폴더('#이름' 마커): 마커 아래 리프가 폴더 소속
  const [folderName, setFolderName] = useState('')
  const addFolder = () => {
    const nm = folderName.trim()
    if (!nm) return
    setDraft((cur) => [...cur, `#${nm}`])
    setFolderName('')
  }

  // 열릴 때마다 현재 값(또는 기본 전체 리프)으로 초안 초기화
  useEffect(() => {
    if (!props.open) return
    setDraft(withFolderMarkers(props.value ?? moduleLeaves(props.module, props.canReadAdmin).map((n) => n.id), props.module, props.canReadAdmin))
  }, [props.open, props.module, props.canReadAdmin, props.value])

  const move = (i: number, dir: -1 | 1) => setDraft((cur) => {
    const j = i + dir
    if (j < 0 || j >= cur.length) return cur
    const next = [...cur]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })
  const remove = (i: number) => setDraft((cur) => cur.filter((_, k) => k !== i))
  const add = (id: string) => setDraft((cur) => (cur.includes(id) ? cur : [...cur, id]))

  // 추가 카탈로그 — 최상위 그룹 라벨 하위에 미포함 리프 (SETUP 필터, 하위 그룹은 평탄화)
  const inDraft = new Set(draft)
  const vis = (n: NavNode) => props.canReadAdmin || !n.minLevel
  const leavesOf = (ns: NavNode[]): NavNode[] => ns.filter(vis).flatMap((n) =>
    [...(n.href ? [n] : []), ...(n.children ? leavesOf(n.children) : [])])
  const catalog: { group: string; leaves: NavNode[] }[] = []
  MENU_TREE[props.module].nodes.filter(vis).forEach((n) => {
    const group = n.href ? MENU_TREE[props.module].title : t(`menu.${n.id}`, n.label)
    const leaves = leavesOf(n.href ? [n] : n.children ?? []).filter((l) => !inDraft.has(l.id))
    if (!leaves.length) return
    const g = catalog.find((c) => c.group === group)
    if (g) g.leaves.push(...leaves)
    else catalog.push({ group, leaves })
  })

  return (
    <Modal open={props.open} onClose={props.onClose} title={props.title ?? t('shell.menuEditTitle', '좌측 메뉴 편집')} width={430}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--title-navy)', marginBottom: 4 }}>{t('shell.shownItems', '표시 항목')} — {draft.length}</div>
          <div style={{ border: '1px solid var(--line)', maxHeight: 240, overflow: 'auto' }}>
            {draft.map((id, i) => (
              <div key={`${id}-${i}`} data-lnav-item={id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderBottom: '1px solid var(--line)', background: id.startsWith('#') ? 'var(--panel, #F4F6FA)' : undefined }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: id.startsWith('#') ? 700 : undefined, color: id.startsWith('#') ? 'var(--title-navy)' : undefined }}>
                  {id.startsWith('#') ? '📁 ' : ''}{label(id)}</span>
                <span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>{NODE_BY_ID[id]?.code ?? ''}</span>
                <button className="b" style={{ height: 17, fontSize: 9, padding: '0 4px' }} disabled={i === 0} onClick={() => move(i, -1)} title="위로">↑</button>
                <button className="b" style={{ height: 17, fontSize: 9, padding: '0 4px' }} disabled={i === draft.length - 1} onClick={() => move(i, 1)} title="아래로">↓</button>
                <button className="b" style={{ height: 17, fontSize: 9, padding: '0 4px' }} onClick={() => remove(i)} title={t('common.delete', '삭제')}>✕</button>
              </div>
            ))}
            {draft.length === 0 ? (
              <div style={{ padding: 8, color: 'var(--txt-mute)' }}>{t('shell.leftNavEmpty', '표시할 메뉴가 없습니다 — 아래에서 추가하십시오')}</div>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input className="in" data-lnav-folder-name value={folderName} placeholder={t('shell.folderPh', '새 폴더 이름')}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addFolder() }} style={{ height: 20, fontSize: 10.5, width: 150 }} />
          <button className="b" data-lnav-add-folder disabled={!folderName.trim()} onClick={addFolder}
            title={t('shell.folderHint', '폴더 추가 — 마커 아래 항목들이 폴더 소속 (↑↓ 로 배치)')}>📁 {t('shell.addFolder', '폴더 추가')}</button>
        </div>

        {catalog.length ? (
          <div>
            <div style={{ fontWeight: 700, color: 'var(--title-navy)', marginBottom: 4 }}>{t('shell.addItem', '항목 추가')}</div>
            <div style={{ border: '1px solid var(--line)', maxHeight: 170, overflow: 'auto' }}>
              {catalog.map((c) => (
                <div key={c.group}>
                  <div style={{ padding: '3px 6px', fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)', background: 'var(--panel, #F4F6FA)' }}>{c.group}</div>
                  {c.leaves.map((n) => (
                    <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px 2px 14px' }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(`menu.${n.id}`, n.label)}</span>
                      <button className="b" style={{ height: 17, fontSize: 9, padding: '0 5px' }} onClick={() => add(n.id)}>＋</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="b" data-lnav-reset onClick={() => { props.onSave(undefined); props.onClose() }}>
            {t('shell.restoreDefault', '기본값 복원')}
          </button>
          {props.onSaveTenant ? (
            <button className="b" data-lnav-save-tenant title={t('shell.saveTenantHint', '이 목록을 테넌트 기본으로 저장 — 개인 설정이 없는 모든 사용자에게 적용 (관리자)')}
              onClick={() => { props.onSaveTenant?.(draft); props.onClose() }}>
              🏢 {t('shell.saveTenant', '테넌트 기본 저장')}
            </button>
          ) : null}
          <span style={{ flex: 1 }} />
          <button className="b run" data-lnav-save onClick={() => { props.onSave(draft); props.onClose() }}>
            {t('common.save', '저장')}
          </button>
          <button className="b" onClick={props.onClose}>{t('common.close', '닫기')}</button>
        </div>
      </div>
    </Modal>
  )
}
