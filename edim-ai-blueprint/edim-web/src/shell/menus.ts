/** 모듈별 메뉴 트리 — 메뉴정의서(M-x-x)·화면설계서(W-xx) 대응. 1차 구현 화면만 화면 연결. */
import type { TreeNode } from '../components/LnavTree'
import type { ModuleId } from './ShellContext'

export interface ScreenDef {
  screenId: string
  code: string     // 화면 코드 (MDI 탭 표기)
  title: string
}

/** treeNode.id → 화면 정의 (열 수 있는 메뉴만) */
export const SCREEN_BY_NODE: Record<string, ScreenDef> = {
  'cpq-selection': { screenId: 'cpq-selection', code: 'C-1', title: '제품 선정 — AHU 5' },
  'cpq-techdata': { screenId: 'cpq-techdata', code: 'C-2', title: '기술 데이터' },
  'plm-design': { screenId: 'plm-design', code: 'S-4-1-1', title: 'Design Editor' },
  'plm-workprocess': { screenId: 'plm-workprocess', code: 'S-4-1-2', title: 'Work Process' },
}

export const MENU_TREE: Record<ModuleId, { title: string; nodes: TreeNode[] }> = {
  cpq: {
    title: 'CPQ',
    nodes: [
      {
        id: 'cpq-root', label: 'Product', children: [
          {
            id: 'cpq-ahu', label: 'AHU', children: [
              { id: 'cpq-selection', label: '제품 선정 (C-1)' },
              { id: 'cpq-techdata', label: '기술 데이터 (C-2)' },
            ],
          },
          { id: 'cpq-fan', label: 'Fan', children: [] },
        ],
      },
      {
        id: 'cpq-doc', label: 'Document', children: [
          { id: 'cpq-doc-tpl', label: 'Templet (C-3) — 예정' },
          { id: 'cpq-doc-mgmt', label: '문서함 (M-5-4) — 예정' },
        ],
      },
    ],
  },
  plm: {
    title: 'PLM Set-up',
    nodes: [
      {
        id: 'plm-root', label: 'Work Process', children: [
          {
            id: 'plm-designmgmt', label: 'Design management', children: [
              { id: 'plm-design', label: 'Design Editor (S-4-1-1)' },
            ],
          },
          { id: 'plm-workprocess', label: 'Work Process (S-4-1-2)' },
          { id: 'plm-material', label: 'Material — 예정' },
          { id: 'plm-quality', label: 'Quality — 예정' },
        ],
      },
      { id: 'plm-arr', label: 'Arrangement Set-Up — 예정' },
    ],
  },
}
