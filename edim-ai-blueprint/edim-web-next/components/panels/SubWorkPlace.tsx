/** U13 우측 공용 패널 스택 (Sub Work Place Templet, E-4) — 서버 컴포넌트.
 *  Table·Macro 목록을 SSR 로 시드하고 클라이언트 패널 3종을 세로 배치.
 *  사용: 페이지 콘텐츠를 flex row 로 감싸고 <SubWorkPlace /> 를 우측에 둔다. */
import { apiServer } from '@/lib/api'
import { CodingPanel, DataUploadPanel, TablePanel, type MacroInfo } from './PanelsClient'
import { SwpCollapse } from './SwpCollapse'
import type { TableInfo } from './actions'

export async function SubWorkPlace() {
  const [tables, macros] = await Promise.all([
    apiServer<TableInfo[]>('/tables').catch(() => [] as TableInfo[]),
    apiServer<{ name: string; expr: string; status: string }[]>('/macros').catch(() => []),
  ])
  const slim: MacroInfo[] = (macros ?? []).map((m) => ({ name: m.name, expr: m.expr, status: m.status }))
  return (
    <SwpCollapse>
      <DataUploadPanel />
      <TablePanel tables={tables ?? []} />
      <CodingPanel macros={slim} />
    </SwpCollapse>
  )
}
