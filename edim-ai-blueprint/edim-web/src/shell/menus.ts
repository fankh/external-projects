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
  'code-subcode': { screenId: 'code-subcode', code: 'S-1-1', title: 'Sub Code 등록' },
  'code-relationship': { screenId: 'code-relationship', code: 'S-1-4', title: 'Code Relationship' },
  'code-datatable': { screenId: 'code-datatable', code: 'M-3-7', title: '데이터 Table' },
  'erp-project': { screenId: 'erp-project', code: 'S-3-5', title: 'Project 등록' },
  'erp-dashboard': { screenId: 'erp-dashboard', code: 'M-14-4', title: 'Dashboard' },
  'erp-price': { screenId: 'erp-price', code: 'M-12-5', title: '단가 관리' },
  'erp-process': { screenId: 'erp-process', code: 'M-14-7', title: 'Process Set-up' },
  'erp-purchase': { screenId: 'erp-purchase', code: 'M-8-2', title: '구매·발주' },
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
  code: {
    title: 'Code Management',
    nodes: [
      {
        id: 'code-root', label: 'Sub Code', children: [
          {
            id: 'code-spec', label: 'Specification', children: [
              { id: 'code-subcode', label: 'Sub Code 등록 (S-1-1)' },
            ],
          },
          { id: 'code-raw', label: 'Raw Material·GPI — 예정' },
        ],
      },
      {
        id: 'code-product', label: 'Product Code', children: [
          { id: 'code-relationship', label: 'Code Relationship (S-1-4)' },
        ],
      },
      {
        id: 'code-data', label: 'Data', children: [
          { id: 'code-datatable', label: '데이터 Table 관리 (M-3-7)' },
          { id: 'code-variant', label: 'Variant·Constant — 예정' },
        ],
      },
    ],
  },
  erp: {
    title: 'ERP',
    nodes: [
      {
        id: 'erp-sales', label: 'Sales', children: [
          { id: 'erp-project', label: 'Project 등록 (S-3-5)' },
        ],
      },
      {
        id: 'erp-purchasing', label: 'Purchasing', children: [
          { id: 'erp-purchase', label: '발주 PR·PO (M-8-2)' },
        ],
      },
      {
        id: 'erp-finance', label: 'Finance', children: [
          { id: 'erp-price', label: '단가 관리 (M-12-5)' },
        ],
      },
      {
        id: 'erp-company', label: 'Company Info.', children: [
          { id: 'erp-dashboard', label: 'Dashboard (M-14-4)' },
          { id: 'erp-process', label: 'Process Set-up (M-14-7)' },
        ],
      },
    ],
  },
}
