/** U13 우측 공용 패널 스택 (Sub Work Place Templet, E-4) — 서버 컴포넌트.
 *  Table·Macro 목록을 SSR 로 시드하고, 4.1(요구 #16)부터 **Accordion Template Host** 로 넘긴다.
 *  각 Template 은 개별 접기/펼치기 단위이며, 표시 대상·순서는 활성 Head 의 RIGHT 바인딩(#17)을 따른다.
 *  사용: 페이지 콘텐츠를 flex row 로 감싸고 <SubWorkPlace /> 를 우측에 둔다. */
import { apiServer } from '@/lib/api'
import { ChildPanel, CodingPanel, DataUploadPanel, TablePanel, type MacroInfo } from './PanelsClient'
import { AccordionHost } from './AccordionHost'
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
      <AccordionHost sections={[
        { id: 'upload', title: 'Data Up-Load', node: <DataUploadPanel /> },
        { id: 'table', title: 'Table', node: <TablePanel tables={tables ?? []} /> },
        { id: 'child', title: 'Child Component', node: <ChildPanel /> },
        { id: 'coding', title: 'Coding (Macro)', node: <CodingPanel macros={slim} /> },
      ]} />
    </SwpCollapse>
  )
}
