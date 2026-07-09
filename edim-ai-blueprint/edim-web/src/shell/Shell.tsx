/** 앱 프레임 — 타이틀바 · 메뉴바 · 툴바 · MDI · 좌측 메뉴트리 · 상태바. */
import { useMemo, type ComponentType } from 'react'
import type { User } from '../api/types'
import { MdiTabs, MenuBar, StatusBar, TitleBar } from '../components/chrome'
import { LnavTree } from '../components/LnavTree'
import { useShell, type OpenTab } from './ShellContext'
import { MENU_TREE, SCREEN_BY_NODE } from './menus'
import { SelectionScreen } from '../screens/cpq/SelectionScreen'
import { TechDataScreen } from '../screens/cpq/TechDataScreen'
import { RunScreen } from '../screens/cpq/RunScreen'
import { DesignEditorScreen } from '../screens/plm/DesignEditorScreen'
import { WorkProcessScreen } from '../screens/plm/WorkProcessScreen'
import { SubCodeScreen } from '../screens/code/SubCodeScreen'
import { CodeRelationshipScreen } from '../screens/code/CodeRelationshipScreen'
import { DataTableScreen } from '../screens/code/DataTableScreen'
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
  // 상세 (드릴다운 — 더블클릭으로 진입, params 필수)
  'code-detail': CodeDetailScreen,
  'doc-detail': OutputDocScreen,
  'part-detail': PartDetailScreen,
  'event-detail': EventDetailScreen,
}

export function Shell(props: { user: User }) {
  const shell = useShell()
  const menu = MENU_TREE[shell.module]

  const userLabel = useMemo(
    () => `Micron #7 (Pre-Sales) · ${props.user.department} · ${props.user.name} [${props.user.userLevel}]`,
    [props.user],
  )

  return (
    <div className="app">
      <TitleBar user={userLabel} />
      <MenuBar activeModule={shell.module} onModule={shell.setModule} />
      <div className="toolbar">
        <span className="b ic" title="신규">▤</span>
        <span className="b ic" title="저장">💾</span>
        <span className="b ic" title="인쇄">🖨</span>
        <span className="sep" />
        <span className="b ic" title="실행 취소">↶</span>
        <span className="b ic" title="다시 실행">↷</span>
        <span className="sep" />
        <span className="b">Variants</span>
        <span className="b">Referencers</span>
        <span className="b">Supersedure</span>
        <span style={{ flex: 1 }} />
        <input className="in" style={{ width: 200 }} placeholder="화면코드·코드·도면 검색 (⌘K)" />
      </div>
      <MdiTabs tabs={shell.tabs} activeId={shell.activeTabId}
        onActivate={shell.activateTab} onClose={shell.closeTab} />
      <div className="workarea">
        <LnavTree title={menu.title} nodes={menu.nodes}
          selectedId={shell.activeTabId}
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
              <div className="hd">To-Do</div>
              <div style={{ padding: '6px 8px', fontSize: 11, lineHeight: 1.9 }}>
                승인 확인 <span className="st warn" style={{ float: 'right' }}>1</span><br />
                PL 지연 <span className="st err" style={{ float: 'right' }}>1</span>
              </div>
            </div>
          } />
        <div className="fill-col">
          {shell.tabs.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--txt-mute)', lineHeight: 2 }}>
              좌측 메뉴에서 화면을 여십시오<br />
              <span style={{ fontSize: 10.5 }}>더블클릭 = 새 탭 (MDI) · F-key 는 하단 상태바 참조</span>
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
        fkeys={[
          { key: 'F2', label: '신규' }, { key: 'F3', label: '삭제' },
          { key: 'F8', label: '조회/적용' }, { key: 'F9', label: 'Run' },
          { key: 'F12', label: '저장' },
        ]}
        cells={[
          ...(shell.statusMsg ? [shell.statusMsg] : []),
          '승인 대기 4',
        ]} />
    </div>
  )
}
