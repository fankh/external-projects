/** 앱 프레임 — 타이틀바 · 메뉴바 · 툴바 · MDI · 좌측 메뉴트리 · 상태바. */
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import type { User } from '../api/types'
import { pingBackend, subscribeDataSource, type DataSource } from '../api/services'
import { MdiTabs, MenuBar, StatusBar, TitleBar, type MenuItem } from '../components/chrome'
import { LnavTree } from '../components/LnavTree'
import { LocaleSwitcher, useI18n } from '../i18n/I18nContext'
import { NotificationBell } from './NotificationBell'
import { useShell, type OpenTab } from './ShellContext'
import { MENU_TREE, SCREEN_BY_NODE } from './menus'
import type { TreeNode } from '../components/LnavTree'
import { SelectionScreen } from '../screens/cpq/SelectionScreen'
import { TechDataScreen } from '../screens/cpq/TechDataScreen'
import { RunScreen } from '../screens/cpq/RunScreen'
import { DesignEditorScreen } from '../screens/plm/DesignEditorScreen'
import { WorkProcessScreen } from '../screens/plm/WorkProcessScreen'
import { SubCodeScreen } from '../screens/code/SubCodeScreen'
import { CodeRelationshipScreen } from '../screens/code/CodeRelationshipScreen'
import { DataTableScreen } from '../screens/code/DataTableScreen'
import { DocumentMgmtScreen } from '../screens/cpq/DocumentMgmtScreen'
import { DocTemplateScreen } from '../screens/cpq/DocTemplateScreen'
import { PrintSetupScreen } from '../screens/cpq/PrintSetupScreen'
import { DuctDesignScreen } from '../screens/plm/DuctDesignScreen'
import { AccessControlScreen } from '../screens/erp/AccessControlScreen'
import { MacroStudioScreen } from '../screens/toolbox/MacroStudioScreen'
import { UiDesignerScreen } from '../screens/toolbox/UiDesignerScreen'
import { ApprovalInboxScreen } from '../screens/common/ApprovalInboxScreen'
import { TaskBoxScreen } from '../screens/common/TaskBoxScreen'
import { ProjectFolderScreen } from '../screens/common/ProjectFolderScreen'
import { MobilePreviewScreen } from '../screens/common/MobilePreviewScreen'
import { CadViewerScreen } from '../screens/detail/CadViewerScreen'
import { CodeDetailScreen } from '../screens/detail/CodeDetailScreen'
import { OutputDocScreen } from '../screens/detail/OutputDocScreen'
import { PartDetailScreen } from '../screens/detail/PartDetailScreen'
import { EventDetailScreen } from '../screens/detail/EventDetailScreen'
import { ProjectScreen } from '../screens/erp/ProjectScreen'
import { DashboardScreen } from '../screens/erp/DashboardScreen'
import { PriceScreen } from '../screens/erp/PriceScreen'
import { ProcessSetupScreen } from '../screens/erp/ProcessSetupScreen'
import { PurchaseScreen } from '../screens/erp/PurchaseScreen'

export interface ScreenProps {
  active: boolean
  tab: OpenTab
}

const SCREENS: Record<string, ComponentType<ScreenProps>> = {
  'cpq-selection': SelectionScreen,
  'cpq-techdata': TechDataScreen,
  'cpq-run': RunScreen,
  'plm-design': DesignEditorScreen,
  'plm-workprocess': WorkProcessScreen,
  'code-subcode': SubCodeScreen,
  'code-relationship': CodeRelationshipScreen,
  'code-datatable': DataTableScreen,
  'erp-project': ProjectScreen,
  'erp-dashboard': DashboardScreen,
  'erp-price': PriceScreen,
  'erp-process': ProcessSetupScreen,
  'erp-purchase': PurchaseScreen,
  'cpq-docmgmt': DocumentMgmtScreen,
  'cpq-doctpl': DocTemplateScreen,
  'cpq-print': PrintSetupScreen,
  'plm-duct': DuctDesignScreen,
  'erp-access': AccessControlScreen,
  'tbx-macro': MacroStudioScreen,
  'tbx-ui': UiDesignerScreen,
  'com-approval': ApprovalInboxScreen,
  'com-tasks': TaskBoxScreen,
  'com-folder': ProjectFolderScreen,
  'com-mobile': MobilePreviewScreen,
  // 상세 (드릴다운 — 더블클릭으로 진입, params 필수)
  'code-detail': CodeDetailScreen,
  'cad-viewer': CadViewerScreen,
  'doc-detail': OutputDocScreen,
  'part-detail': PartDetailScreen,
  'event-detail': EventDetailScreen,
}

export function Shell(props: { user: User }) {
  const shell = useShell()
  const { t } = useI18n()
  const menu = MENU_TREE[shell.module]
  const [source, setSource] = useState<DataSource>('unknown')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = subscribeDataSource(setSource)
    void pingBackend()
    return unsub
  }, [])

  // ── 전역 단축키 ──
  //  Ctrl/⌘+K = 검색 · Alt+W = 탭 닫기 · Alt+←/→ = 탭 이동 · Alt+1~9 = n번째 탭
  //  (Ctrl+W·Ctrl+Tab 은 브라우저 예약이라 Alt 조합 사용)
  const { tabs, activeTabId, closeTab, activateTab } = shell
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key.toLowerCase() === 'w') {
        e.preventDefault()
        if (activeTabId) closeTab(activeTabId)
        return
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && tabs.length > 0) {
        e.preventDefault()
        const idx = Math.max(0, tabs.findIndex((t2) => t2.id === activeTabId))
        const n = tabs.length
        const next = e.key === 'ArrowRight' ? (idx + 1) % n : (idx - 1 + n) % n
        activateTab(tabs[next].id)
        return
      }
      const num = Number(e.key)
      if (num >= 1 && num <= 9 && tabs[num - 1]) {
        e.preventDefault()
        activateTab(tabs[num - 1].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabs, activeTabId, closeTab, activateTab])

  // 툴바 아이콘 → 활성 화면의 F-key 디스패치 (useFKeys 가 window keydown 수신)
  const fkey = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }))

  // ── F-key 표준 폴백 — 브라우저 기본동작(F3 찾기 등) 차단 + 미구현 화면 안내 ──
  // Shell 리스너가 먼저 등록되므로 화면 핸들러의 preventDefault 여부는 디스패치 완료 후 확인
  const { setStatusMsg } = shell
  useEffect(() => {
    const LABELS: Record<string, string> = {
      F2: '신규', F3: '삭제', F8: '조회', F9: 'Run', F12: '저장',
    }
    const onKey = (e: KeyboardEvent) => {
      if (!(e.key in LABELS)) return
      e.preventDefault()   // F3 브라우저 찾기 등 차단 — 화면 핸들러는 계속 실행됨
      setTimeout(() => {
        // 화면 useFKeys 핸들러가 처리했다면 자체 상태 메시지를 이미 출력함 — 미처리 시 안내
        if (!(e as KeyboardEvent & { __handled?: boolean }).__handled) {
          setStatusMsg(`${e.key} ${LABELS[e.key]} — 이 화면에는 해당 동작이 없습니다`)
        }
      }, 0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setStatusMsg])

  // ── 메뉴바 드롭다운 ──
  const [showHelp, setShowHelp] = useState(false)
  useEffect(() => {
    if (!showHelp) return
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowHelp(false) }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [showHelp])
  const stepTab = (dir: 1 | -1) => {
    if (tabs.length === 0) return
    const idx = Math.max(0, tabs.findIndex((t2) => t2.id === activeTabId))
    activateTab(tabs[(idx + dir + tabs.length) % tabs.length].id)
  }
  const menus: Record<string, MenuItem[]> = {
    '파일': [
      { label: t('common.new', '신규'), hint: 'F2', onClick: () => fkey('F2') },
      { label: t('common.save', '저장'), hint: 'F12', onClick: () => fkey('F12') },
      { label: t('common.print', '인쇄'), onClick: () => window.print() },
      { sep: true, label: '' },
      { label: '로그아웃', onClick: () => {
        sessionStorage.removeItem('edim-session')
        sessionStorage.removeItem('edim-token')
        window.location.reload()
      } },
    ],
    '편집': [
      { label: '실행 취소', onClick: () => shell.setStatusMsg('실행 취소 — 활성 화면 편집 이력 기준') },
      { label: '다시 실행', onClick: () => shell.setStatusMsg('다시 실행 — 활성 화면 편집 이력 기준') },
      { sep: true, label: '' },
      { label: t('common.delete', '삭제'), hint: 'F3', onClick: () => fkey('F3') },
    ],
    '조회': [
      { label: t('common.query', '조회'), hint: 'F8', onClick: () => fkey('F8') },
      { label: 'Run', hint: 'F9', onClick: () => fkey('F9') },
      { sep: true, label: '' },
      { label: '데이터 소스 재확인', onClick: () => {
        void pingBackend()
        shell.setStatusMsg('데이터 소스 재확인 — 상태바 DB 표시 참조')
      } },
    ],
    '도구': [
      { label: 'Macro Studio (S-2-2)', onClick: () => shell.openTab(SCREEN_BY_NODE['tbx-macro']) },
      { label: 'UI Designer (S-2-1)', onClick: () => shell.openTab(SCREEN_BY_NODE['tbx-ui']) },
      { label: '데이터 Table (M-3-7)', onClick: () => shell.openTab(SCREEN_BY_NODE['code-datatable']) },
      { sep: true, label: '' },
      { label: '문서 포털 (docs)', onClick: () => window.open('/docs/', '_blank') },
    ],
    '창': [
      { label: '다음 탭', hint: 'Alt+→', onClick: () => stepTab(1), disabled: tabs.length === 0 },
      { label: '이전 탭', hint: 'Alt+←', onClick: () => stepTab(-1), disabled: tabs.length === 0 },
      { label: '탭 닫기', hint: 'Alt+W', disabled: !activeTabId,
        onClick: () => { if (activeTabId) closeTab(activeTabId) } },
      { label: '모든 탭 닫기', disabled: tabs.length === 0,
        onClick: () => [...tabs].forEach((t2) => closeTab(t2.id)) },
      { sep: true, label: '' },
      ...tabs.slice(0, 12).map((t2) => ({
        label: `${t2.id === activeTabId ? '● ' : ''}${t2.code} ${t(`screen.${t2.screenId}`, t2.title)}`,
        onClick: () => activateTab(t2.id),
      })),
    ],
    '도움말': [
      { label: '단축키 안내', onClick: () => setShowHelp(true) },
      { label: '시연 시나리오 (PDF)', onClick: () => window.open('/docs/files/pdf/EDIM_시연시나리오.pdf', '_blank') },
      { sep: true, label: '' },
      { label: 'EDIM Tool System — NOVA Solution', disabled: true },
    ],
  }

  const SHORTCUTS: [string, string][] = [
    ['F2 / F3 / F8 / F9 / F12', '신규 · 삭제 · 조회 · Run · 저장 (활성 화면)'],
    ['Ctrl(⌘)+K', '검색창 포커스'],
    ['Alt+W', '활성 탭 닫기'],
    ['Alt+← / Alt+→', '이전 / 다음 탭'],
    ['Alt+1 ~ 9', 'n번째 탭 활성화'],
    ['브라우저 뒤로/앞으로', '탭·모듈 이동 이력 따라가기 (URL 동기)'],
    ['CAD: 휠 / 드래그', '커서 기준 줌 / 팬'],
    ['CAD: ＋ − 0', '줌 인 · 줌 아웃 · 맞춤 (더블클릭 동일)'],
    ['CAD: M / Esc', '측정 토글 / 측정·선택 해제'],
    ['그리드 더블클릭', '상세 탭 (코드·문서·부품·이벤트)'],
  ]

  const userLabel = useMemo(
    () => `Micron #7 (Pre-Sales) · ${props.user.department} · ${props.user.name} [${props.user.userLevel}]`,
    [props.user],
  )

  // 좌측 트리 라벨 번역 — menu.<nodeId> 키, 미존재 시 KO 라벨 폴백
  const trNodes = useMemo(() => {
    const walk = (ns: TreeNode[]): TreeNode[] => ns.map((n) => ({
      ...n,
      label: t(`menu.${n.id}`, n.label),
      children: n.children ? walk(n.children) : n.children,
    }))
    return walk(menu.nodes)
  }, [menu, t])

  // MDI 탭 제목 번역 — screen.<screenId> 키 (상세 탭 등 동적 제목은 키 미정의 → 원제 유지)
  const trTabs = useMemo(
    () => shell.tabs.map((tab) => ({ ...tab, title: t(`screen.${tab.screenId}`, tab.title) })),
    [shell.tabs, t])

  // 페이지 이동 시 좌측 트리 마킹 — 인스턴스 탭(run:1 등)도 screenId 로 메뉴 노드 매칭
  const treeSelId = useMemo(() => {
    const activeTab = shell.tabs.find((t2) => t2.id === shell.activeTabId)
    if (!activeTab) return shell.activeTabId
    return SCREEN_BY_NODE[activeTab.screenId] ? activeTab.screenId : activeTab.id
  }, [shell.tabs, shell.activeTabId])

  return (
    <div className="app">
      <TitleBar user={userLabel} bell={<><LocaleSwitcher /><NotificationBell /></>}
        activeModule={shell.module} onModule={shell.setModule} />
      <MenuBar activeModule={shell.module} onModule={shell.setModule} menus={menus} />
      <div className="toolbar">
        <span className="b ic" title="신규 (F2)" onClick={() => fkey('F2')}>▤</span>
        <span className="b ic" title="저장 (F12)" onClick={() => fkey('F12')}>💾</span>
        <span className="b ic" title="인쇄" onClick={() => window.print()}>🖨</span>
        <span className="sep" />
        <span className="b ic" title="실행 취소"
          onClick={() => shell.setStatusMsg('실행 취소 — 활성 화면 편집 이력 기준 (전역 이력은 sys_history 참조)')}>↶</span>
        <span className="b ic" title="다시 실행"
          onClick={() => shell.setStatusMsg('다시 실행 — 활성 화면 편집 이력 기준')}>↷</span>
        <span className="sep" />
        <span className="b" title="VARIANT 바인딩 치수 — Design Editor"
          onClick={() => {
            shell.openTab(SCREEN_BY_NODE['plm-design'])
            shell.setStatusMsg('Variants — VARIANT 바인딩 치수: C=45 · E=320 (Design Rule 그리드)')
          }}>Variants</span>
        <span className="b" title="현재 코드를 참조하는 상위 — 코드 상세"
          onClick={() => shell.openTab({
            id: 'code-detail:KDCR 3-13', screenId: 'code-detail',
            code: '상세', title: 'KDCR 3-13',
            params: { code: 'KDCR 3-13', name: 'Fan 원심 Casing' },
          })}>Referencers</span>
        <span className="b" title="개정 대체 이력 — Project Folder·이력"
          onClick={() => {
            shell.openTab(SCREEN_BY_NODE['com-folder'])
            shell.setStatusMsg('Supersedure — Rev 대체 이력은 이력(M-15-9) 그리드에서 diff 확인')
          }}>Supersedure</span>
        <span style={{ flex: 1 }} />
        <input ref={searchRef} className="in" style={{ width: 200 }}
          placeholder={t('shell.searchPh', '화면코드·코드·도면 검색 (⌘K)')} />
      </div>
      <MdiTabs tabs={trTabs} activeId={shell.activeTabId}
        onActivate={shell.activateTab} onClose={shell.closeTab} />
      <div className="workarea">
        <LnavTree title={shell.module === 'common' ? t('menu.moduleCommon', menu.title) : menu.title}
          nodes={trNodes}
          selectedId={treeSelId}
          onOpen={(n) => {
            const s = SCREEN_BY_NODE[n.id]
            if (s) shell.openTab(s)
          }}
          onSelect={(n) => {
            // 리프 단일클릭도 열기 (더블클릭은 레거시 문법이지만 웹 관례 병행)
            const s = SCREEN_BY_NODE[n.id]
            if (s && !n.children?.length) shell.openTab(s)
          }}
          footer={
            <div style={{ borderTop: '1px solid var(--line)' }}>
              <div className="hd">{t('shell.todo', 'To-Do')}</div>
              <div style={{ padding: '6px 8px', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {t('shell.todoApproval', '승인 확인')}<span style={{ flex: 1 }} /><span className="st warn">1</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {t('shell.todoPl', 'PL 지연')}<span style={{ flex: 1 }} /><span className="st err">1</span>
                </div>
              </div>
            </div>
          } />
        <div className="fill-col">
          {shell.tabs.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--txt-mute)', lineHeight: 2 }}>
              {t('shell.openHint', '좌측 메뉴에서 화면을 여십시오')}<br />
              <span style={{ fontSize: 10.5 }}>{t('shell.openHint2', '더블클릭 = 새 탭 (MDI)')}</span>
            </div>
          ) : (
            shell.tabs.map((tab) => {
              const Screen = SCREENS[tab.screenId]
              const active = tab.id === shell.activeTabId
              return (
                <div key={tab.id} className="fill-col"
                  style={active ? undefined : { display: 'none' }}>
                  {Screen ? <Screen active={active} tab={tab} /> : null}
                </div>
              )
            })
          )}
        </div>
      </div>
      <StatusBar
        onFKey={fkey}
        fkeys={[
          { key: 'F2', label: t('common.new', '신규') }, { key: 'F3', label: t('common.delete', '삭제') },
          { key: 'F8', label: t('common.query', '조회') }, { key: 'F9', label: 'Run' },
          { key: 'F12', label: t('common.save', '저장') },
        ]}
        cells={[
          ...(shell.statusMsg ? [shell.statusMsg] : []),
          `${t('shell.pending', '승인 대기')} 4`,
        ]}
        dbLabel={source === 'live'
          ? <span>DB: <b style={{ color: 'var(--ok)' }}>EDIM-PRD (PG16)</b></span>
          : source === 'mock'
            ? <span>DB: <b style={{ color: 'var(--warn)' }}>MOCK</b></span>
            : 'DB: …'} />
      {showHelp ? (
        <div data-help-dialog style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowHelp(false)}>
          <div style={{
            background: '#fff', border: '1px solid var(--line-strong)', width: 480,
            boxShadow: '0 8px 30px rgba(20,26,40,.35)',
          }} onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>단축키 안내</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowHelp(false)}>✕</span>
            </div>
            <table className="g" style={{ width: '100%' }}>
              <tbody>
                {SHORTCUTS.map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ width: 180, fontFamily: 'Consolas, monospace', fontSize: 10.5, padding: '4px 10px', borderBottom: '1px solid var(--line-soft)' }}>{k}</td>
                    <td style={{ fontSize: 11, padding: '4px 10px', borderBottom: '1px solid var(--line-soft)' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--txt-mute)' }}>
              Ctrl+W·Ctrl+Tab 은 브라우저 예약키라 Alt 조합을 사용합니다. Esc 또는 바깥 클릭으로 닫기.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
