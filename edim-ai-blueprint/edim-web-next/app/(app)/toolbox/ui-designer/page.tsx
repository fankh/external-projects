import { apiServer } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { UiDesigner } from './UiDesigner'
import type { Widget } from './actions'

export const dynamic = 'force-dynamic'

const FORM_NAME = 'CPQ-Selection'
const INITIAL_WIDGETS: Widget[] = [
  { id: 'w1', kind: 'PushButton', label: 'Button', x: 30, y: 26, w: 90, h: 26 },
  { id: 'w2', kind: 'ComboBox', label: 'Combo (S-2)', x: 30, y: 80, w: 110, h: 24 },
  { id: 'w3', kind: 'TableView', label: 'Table (Item·A~I)', x: 30, y: 130, w: 250, h: 110 },
  { id: 'w4', kind: 'Canvas', label: 'Canvas (그래프·도면)', x: 320, y: 130, w: 200, h: 150 },
]

export default async function UiDesignerPage() {
  // 저장된 layout_def 복원 (tbx_ui_form) — 없으면 초기 위젯
  const saved = await apiServer<{ version: number; layout: Widget[] }>(`/toolbox/forms/${encodeURIComponent(FORM_NAME)}`).catch(() => null)
  const widgets = saved && Array.isArray(saved.layout) && saved.layout.length ? saved.layout : INITIAL_WIDGETS
  const version = saved?.version ?? 1

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="UI Designer (S-2-1) — CPQ / Selection" source="/toolbox/forms/{name}" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <UiDesigner initialWidgets={widgets} initialVersion={version} />
      </div>
    </div>
  )
}
