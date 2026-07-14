import { ScreenHeader } from '@/components/ScreenHeader'
import { DocTemplate } from './DocTemplate'

export const dynamic = 'force-dynamic'

export default function DocTemplatePage() {
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="Document Templet (C-3) — 밀도 계산서" source="/render/pdf (client)" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <DocTemplate />
      </div>
    </div>
  )
}
