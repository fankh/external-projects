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
  'cpq-xreview': { screenId: 'cpq-xreview', code: 'C-1X', title: 'X-code 검토' },
  'plm-design': { screenId: 'plm-design', code: 'S-4-1-1', title: 'Design Editor' },
  'plm-drawings': { screenId: 'plm-drawings', code: 'M-4-1', title: '도면 대장' },
  'plm-workprocess': { screenId: 'plm-workprocess', code: 'S-4-1-2', title: 'Work Process' },
  'code-subcode': { screenId: 'code-subcode', code: 'S-1-1', title: 'Sub Code 등록' },
  'code-relationship': { screenId: 'code-relationship', code: 'S-1-4', title: 'Code Relationship' },
  'code-master': { screenId: 'code-master', code: 'M-3-8', title: '제품 코드 마스터' },
  'code-datatable': { screenId: 'code-datatable', code: 'M-3-7', title: '데이터 Table' },
  'cpq-docmgmt': { screenId: 'cpq-docmgmt', code: 'M-5-4', title: '문서함' },
  'cpq-doctpl': { screenId: 'cpq-doctpl', code: 'C-3', title: 'Document Templet' },
  'cpq-print': { screenId: 'cpq-print', code: 'S-3-4', title: 'Print Set-up' },
  'cpq-reports': { screenId: 'cpq-reports', code: 'RPT', title: 'Report Center' },
  'plm-duct': { screenId: 'plm-duct', code: 'M-4-3', title: '건축설비 Duct' },
  'erp-access': { screenId: 'erp-access', code: 'M-14-6', title: '사용자·권한' },
  'erp-audit': { screenId: 'erp-audit', code: 'M-14-6A', title: '감사 조회' },
  'erp-anomaly': { screenId: 'erp-anomaly', code: 'M-14-4A', title: '이상 이벤트' },
  'tbx-macro': { screenId: 'tbx-macro', code: 'S-2-2', title: 'Macro Studio' },
  'tbx-ui': { screenId: 'tbx-ui', code: 'S-2-1', title: 'UI Designer' },
  'com-approval': { screenId: 'com-approval', code: 'M-15-2', title: '승인함' },
  'com-tasks': { screenId: 'com-tasks', code: 'M-15-3', title: '부서 업무함' },
  'com-folder': { screenId: 'com-folder', code: 'M-15-8', title: 'Project Folder' },
  'com-mobile': { screenId: 'com-mobile', code: 'M-16', title: 'Mobile 미리보기' },
  'erp-project': { screenId: 'erp-project', code: 'S-3-5', title: 'Project 등록' },
  'erp-sales-order': { screenId: 'erp-sales-order', code: 'D-1', title: '수주 관리' },
  'erp-inventory': { screenId: 'erp-inventory', code: 'D-2', title: '재고 관리' },
  'erp-po': { screenId: 'erp-po', code: 'G-3', title: '발주 (PO)' },
  'erp-work-order': { screenId: 'erp-work-order', code: 'D-3', title: '작업지시' },
  'erp-quality': { screenId: 'erp-quality', code: 'D-4', title: '검사·품질' },
  'erp-dashboard': { screenId: 'erp-dashboard', code: 'M-14-4', title: 'Dashboard' },
  'erp-price': { screenId: 'erp-price', code: 'M-12-5', title: '단가 관리' },
  'erp-cost-actual': { screenId: 'erp-cost-actual', code: 'D-6', title: '원가 실적' },
  'erp-milestone': { screenId: 'erp-milestone', code: 'D-7', title: '일정·마일스톤' },
  'erp-calendar': { screenId: 'erp-calendar', code: 'M-8-6', title: '근무일·휴일 캘린더' },
  'erp-process': { screenId: 'erp-process', code: 'M-14-7', title: 'Process Set-up' },
  'erp-purchase': { screenId: 'erp-purchase', code: 'M-8-2', title: '구매·발주' },
  'plm-arr': { screenId: 'plm-arr', code: 'M-4-2', title: 'Arrangement Set-Up' },
  'tbx-templet': { screenId: 'tbx-templet', code: 'S-2-3', title: 'Templet 관리' },
  'tbx-runs': { screenId: 'tbx-runs', code: 'E-3', title: 'Run 이력' },
  'code-variant': { screenId: 'code-variant', code: 'S-1-2', title: 'Variant·Constant' },
  'code-raw': { screenId: 'code-raw', code: 'M-3-2', title: 'Raw Material·GPI' },
  'plm-material': { screenId: 'plm-material', code: 'M-4-4', title: 'Material' },
  'plm-quality': { screenId: 'plm-quality', code: 'M-4-5', title: 'Quality' },
  'erp-company-master': { screenId: 'erp-company-master', code: 'M-14-2', title: '공급처·거래처' },
  'code-hierarchy': { screenId: 'code-hierarchy', code: 'M-3-1', title: 'Hierarchy 주소' },
  'plm-parts': { screenId: 'plm-parts', code: 'M-4-7', title: '부품 대장' },
  'plm-eco': { screenId: 'plm-eco', code: 'D-5', title: '설계 변경(ECO)' },
  'plm-bom-compare': { screenId: 'plm-bom-compare', code: 'G-3B', title: 'BOM 비교' },
  'erp-warehouse': { screenId: 'erp-warehouse', code: 'M-8-4', title: '창고·저장위치' },
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
              { id: 'cpq-xreview', label: 'X-code 검토 (C-1X)' },
            ],
          },
          { id: 'cpq-fan', label: 'Fan', children: [] },
        ],
      },
      {
        id: 'cpq-doc', label: 'Document', children: [
          { id: 'cpq-doctpl', label: 'Document Templet (C-3)' },
          { id: 'cpq-docmgmt', label: '문서함 (M-5-4)' },
          { id: 'cpq-print', label: 'Print Set-up (S-3-4)' },
          { id: 'cpq-reports', label: 'Report Center (RPT)' },
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
              { id: 'plm-drawings', label: '도면 대장 (M-4-1)' },
            ],
          },
          { id: 'plm-workprocess', label: 'Work Process (S-4-1-2)' },
          { id: 'plm-material', label: 'Material (M-4-4)' },
          { id: 'plm-quality', label: 'Quality (M-4-5)' },
          { id: 'plm-parts', label: '부품 대장 (M-4-7)' },
          { id: 'plm-eco', label: '설계 변경 ECO/ECN (D-5)' },
          { id: 'plm-bom-compare', label: 'BOM 비교 (G-3B)' },
        ],
      },
      {
        id: 'plm-design2', label: 'Design', children: [
          { id: 'plm-duct', label: '건축설비 Duct (M-4-3)' },
        ],
      },
      { id: 'plm-arr', label: 'Arrangement Set-Up (M-4-2)' },
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
          { id: 'code-raw', label: 'Raw Material·GPI (M-3-2)' },
        ],
      },
      {
        id: 'code-product', label: 'Product Code', children: [
          { id: 'code-master', label: '제품 코드 마스터 (M-3-8)' },
          { id: 'code-relationship', label: 'Code Relationship (S-1-4)' },
        ],
      },
      {
        id: 'code-data', label: 'Data', children: [
          { id: 'code-hierarchy', label: 'Hierarchy 주소 (M-3-1)' },
          { id: 'code-datatable', label: '데이터 Table 관리 (M-3-7)' },
          { id: 'code-variant', label: 'Variant·Constant (S-1-2)' },
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
          { id: 'erp-sales-order', label: '수주 관리 (D-1)' },
          { id: 'erp-milestone', label: '일정·마일스톤 (D-7)' },
          { id: 'erp-calendar', label: '근무일·휴일 캘린더 (M-8-6)' },
        ],
      },
      {
        id: 'erp-purchasing', label: 'Purchasing', children: [
          { id: 'erp-purchase', label: '발주 PR·PO (M-8-2)' },
          { id: 'erp-po', label: '발주 라이프사이클 (G-3)' },
          { id: 'erp-inventory', label: '재고 관리 (D-2)' },
          { id: 'erp-warehouse', label: '창고·저장위치 (M-8-4)' },
        ],
      },
      {
        id: 'erp-production', label: 'Production', children: [
          { id: 'erp-work-order', label: '작업지시 (D-3)' },
          { id: 'erp-quality', label: '검사·품질 (D-4)' },
        ],
      },
      {
        id: 'erp-finance', label: 'Finance', children: [
          { id: 'erp-price', label: '단가 관리 (M-12-5)' },
          { id: 'erp-cost-actual', label: '원가 실적·차이분석 (D-6)' },
        ],
      },
      {
        id: 'erp-company', label: 'Company Info.', children: [
          { id: 'erp-dashboard', label: 'Dashboard (M-14-4)' },
          { id: 'erp-anomaly', label: '이상 이벤트 (M-14-4A)' },
          { id: 'erp-company-master', label: '공급처·거래처 (M-14-2)' },
          { id: 'erp-process', label: 'Process Set-up (M-14-7)' },
          { id: 'erp-access', label: '사용자·권한 (M-14-6)' },
          { id: 'erp-audit', label: '감사 조회 (M-14-6A)' },
        ],
      },
    ],
  },
  toolbox: {
    title: 'EDIM Toolbox',
    nodes: [
      {
        id: 'tbx-uidesign', label: 'UI Design', children: [
          { id: 'tbx-ui', label: 'UI Designer (S-2-1)' },
        ],
      },
      {
        id: 'tbx-program', label: 'Program Macro', children: [
          { id: 'tbx-macro', label: 'Macro Studio (S-2-2)' },
        ],
      },
      { id: 'tbx-templet', label: 'Templet 관리 (S-2-3)' },
      { id: 'tbx-runs', label: 'Run 이력·정리 (E-3)' },
    ],
  },
  common: {
    title: '공통',
    nodes: [
      { id: 'com-approval', label: '승인함 (M-15-2)' },
      { id: 'com-tasks', label: '부서 업무함 (M-15-3)' },
      { id: 'com-folder', label: 'Project Folder·이력 (M-15-8/9)' },
      { id: 'com-mobile', label: 'Mobile App 미리보기 (M-16)' },
      { id: 'com-search', label: '통합 검색 (⌘K)' },
    ],
  },
}
