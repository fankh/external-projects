'use client'

/** U33 — 테넌트 메뉴 관리 편집기: 모듈 선택 → 대상(좌측/헤더) → 목록 편집(↑↓✕·추가) → 테넌트 저장.
 *  해석 순서(개인 > 테넌트 > 전체)는 셸과 동일 — 여기서 저장하면 개인 설정 없는 전 사용자에게 적용. */
import { useMemo, useState, useTransition } from 'react'
import { GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { MENU_TREE, NODE_BY_ID, moduleLeaves, type ModuleKey, type NavNode } from '@/components/chrome/menus'
import { saveHeadNav, saveLeftNav, saveTenantHeadNav, saveTenantNav, type LeftNavPref } from '@/components/chrome/shellActions'

const MODULES: ModuleKey[] = ['erp', 'cpq', 'plm', 'code', 'toolbox', 'common'] as ModuleKey[]

export function TenantMenuAdmin({ initialLeft, initialHead, myLeft, myHead }: { initialLeft: LeftNavPref; initialHead: LeftNavPref; myLeft: LeftNavPref; myHead: LeftNavPref }) {
  const { t } = useI18n()
  const [left, setLeft] = useState<LeftNavPref>(initialLeft)
  const [head, setHead] = useState<LeftNavPref>(initialHead)
  // v31.5 — 개인 설정 가림 경고: 현재 계정의 개인 설정이 테넌트 기본을 덮는 경우 안내·해제
  const [mine, setMine] = useState<{ left: LeftNavPref; head: LeftNavPref }>({ left: myLeft, head: myHead })
  const [module, setModule] = useState<ModuleKey>('erp')
  const [target, setTarget] = useState<'left' | 'head'>('left')
  const [draft, setDraft] = useState<string[] | null>(null)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [pending, start] = useTransition()

  const store = target === 'left' ? left : head
  const current = draft ?? store[module] ?? moduleLeaves(module, true).map((n) => n.id)
  const label = (id: string) => {
    if (id.startsWith('#')) return id.slice(1).trim() || '폴더'
    const n = NODE_BY_ID[id]
    return n ? t(`menu.${n.id}`, n.label) : id
  }
  // U34 — 커스텀 폴더 마커
  const [folderName, setFolderName] = useState('')
  const addFolder = () => {
    const nm = folderName.trim()
    if (!nm) return
    setDraft([...current, `#${nm}`])
    setFolderName('')
  }
  const pick = (m: ModuleKey, tg: 'left' | 'head') => { setModule(m); setTarget(tg); setDraft(null); setMsg(null) }
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= current.length) return
    const next = [...current]
    ;[next[i], next[j]] = [next[j], next[i]]
    setDraft(next)
  }
  const remove = (i: number) => setDraft(current.filter((_, k) => k !== i))
  const add = (id: string) => { if (!current.includes(id)) setDraft([...current, id]) }

  const inDraft = new Set(current)
  const catalog = useMemo(() => {
    const leavesOf = (ns: NavNode[]): NavNode[] => ns.flatMap((n) =>
      [...(n.href ? [n] : []), ...(n.children ? leavesOf(n.children) : [])])
    return leavesOf(MENU_TREE[module].nodes).filter((l) => !inDraft.has(l.id))
  }, [module, current])  // eslint-disable-line react-hooks/exhaustive-deps

  const clearMine = () => start(async () => {
    const cur = target === 'left' ? mine.left : mine.head
    const next = { ...cur }
    delete next[module]
    if (target === 'left') await saveLeftNav(next)
    else await saveHeadNav(next)
    setMine((m) => target === 'left' ? { ...m, left: next } : { ...m, head: next })
    setMsg({ text: t('tmenu.mineCleared', '이 계정의 개인 설정 해제 ✓ — 테넌트 기본이 적용됩니다 (새로고침 후 반영)') })
  })

  const save = (ids: string[] | undefined) => start(async () => {
    const next = { ...(target === 'left' ? left : head) }
    if (ids) next[module] = ids
    else delete next[module]
    const r = target === 'left' ? await saveTenantNav(next) : await saveTenantHeadNav(next)
    if (r.error) { setMsg({ text: r.error, err: true }); return }
    if (target === 'left') setLeft(next); else setHead(next)
    setDraft(null)
    setMsg({ text: ids
      ? t('tmenu.saved', '테넌트 기본 저장 ✓ — {n}항목 (개인 설정 없는 전 사용자 적용)').replace('{n}', String(ids.length))
      : t('tmenu.cleared', '테넌트 기본 해제 ✓ — 전체 권한 메뉴 복귀') })
  })

  return (
    <div style={{ display: 'flex', gap: 6, height: '100%', minHeight: 0 }}>
      <GroupBox title={t('tmenu.scope', '대상 선택')} noPad style={{ width: 200, flexShrink: 0 }}>
        <table className="g" data-tmenu-scope>
          <thead><tr><th>{t('tmenu.module', '모듈')}</th><th>{t('tmenu.left', '좌측')}</th><th>{t('tmenu.head', '헤더')}</th></tr></thead>
          <tbody>
            {MODULES.map((m) => (
              <tr key={m}>
                <td className="code" style={{ textTransform: 'uppercase' }}>{m}</td>
                {(['left', 'head'] as const).map((tg) => {
                  const active = module === m && target === tg
                  const has = ((tg === 'left' ? left : head)[m]?.length ?? 0) > 0
                  return (
                    <td key={tg} className="c" style={{ textAlign: 'center', cursor: 'pointer', background: active ? 'var(--sel-yellow, #FFF3C2)' : undefined }}
                      data-tmenu-cell={`${m}:${tg}`} onClick={() => pick(m, tg)}>
                      {has ? '●' : '○'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: 6, fontSize: 9.5, color: 'var(--txt-mute)', lineHeight: 1.6 }}>
          {t('tmenu.legend', '● = 테넌트 기본 지정됨 · ○ = 전체 메뉴. 적용: 개인 설정 > 테넌트 기본 > 전체.')}
        </div>
      </GroupBox>

      <GroupBox title={`${t('tmenu.editTitle', '구성 편집')} — ${module.toUpperCase()} · ${target === 'left' ? t('tmenu.leftPanel', '좌측 패널') : t('tmenu.headMenu', '헤더 드롭다운')} (${current.length})`} noPad
        style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div data-tmenu-list style={{ flex: 1, minHeight: 0, overflow: 'auto', borderBottom: '1px solid var(--line)' }}>
          {current.map((id, i) => (
            <div key={`${id}-${i}`} data-tmenu-item={id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderBottom: '1px solid var(--line)', fontSize: 11, background: id.startsWith('#') ? 'var(--panel, #F4F6FA)' : undefined }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: id.startsWith('#') ? 700 : undefined, color: id.startsWith('#') ? 'var(--title-navy)' : undefined }}>
                {id.startsWith('#') ? '📁 ' : ''}{label(id)}</span>
              <span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>{NODE_BY_ID[id]?.code ?? ''}</span>
              <button className="b" style={{ height: 17, fontSize: 9, padding: '0 4px' }} disabled={i === 0} onClick={() => move(i, -1)} title="위로">↑</button>
              <button className="b" style={{ height: 17, fontSize: 9, padding: '0 4px' }} disabled={i === current.length - 1} onClick={() => move(i, 1)} title="아래로">↓</button>
              <button className="b" style={{ height: 17, fontSize: 9, padding: '0 4px' }} onClick={() => remove(i)} title={t('common.delete', '삭제')}>✕</button>
            </div>
          ))}
          {!current.length ? <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('tmenu.empty', '항목 없음 — 우측에서 추가')}</div> : null}
        </div>
        {(target === 'left' ? mine.left : mine.head)[module]?.length ? (
          <div data-tmenu-mine-warn style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 8px', fontSize: 10.5, background: '#FBF3E2', borderBottom: '1px solid var(--line)' }}>
            <span style={{ color: '#8A6D1F' }}>⚠ {t('tmenu.mineWarn', '이 계정에는 이 모듈의 개인 설정이 있어 테넌트 기본이 본인 화면에 보이지 않습니다 (개인 > 테넌트 우선)')}</span>
            <button className="b" data-tmenu-mine-clear disabled={pending} onClick={clearMine} style={{ height: 18, fontSize: 10 }}>{t('tmenu.clearMine', '개인 설정 해제')}</button>
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 6, padding: 6, alignItems: 'center' }}>
          <input className="in" data-tmenu-folder-name value={folderName} placeholder={t('tmenu.folderPh', '새 폴더 이름')}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addFolder() }} style={{ height: 20, fontSize: 10.5, width: 120 }} />
          <button className="b" data-tmenu-add-folder disabled={pending || !folderName.trim()} onClick={addFolder}
            title={t('tmenu.folderHint', '폴더 추가 — 마커 아래 항목들이 폴더 소속 (↑↓ 배치)')}>📁</button>
          <span className="sep" />
          <button className="b run" data-tmenu-save disabled={pending || !draft} onClick={() => save(current)}>{t('tmenu.saveTenant', '🏢 테넌트 기본 저장')}</button>
          <button className="b" data-tmenu-clear disabled={pending} onClick={() => save(undefined)}>{t('tmenu.clear', '지정 해제(전체 복귀)')}</button>
          {msg ? <span style={{ fontSize: 10.5, color: msg.err ? 'var(--err)' : 'var(--run)' }}>{msg.text}</span> : null}
        </div>
      </GroupBox>

      <GroupBox title={t('tmenu.addTitle', '항목 추가')} noPad style={{ width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div data-tmenu-catalog style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {catalog.map((n) => (
            <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 11, borderBottom: '1px solid var(--line)' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(`menu.${n.id}`, n.label)}</span>
              <button className="b" style={{ height: 17, fontSize: 9, padding: '0 5px' }} onClick={() => add(n.id)}>＋</button>
            </div>
          ))}
          {!catalog.length ? <div style={{ padding: 10, fontSize: 10.5, color: 'var(--txt-mute)' }}>{t('tmenu.allAdded', '모든 항목 포함됨')}</div> : null}
        </div>
      </GroupBox>
    </div>
  )
}
