import { ScreenHeader } from '@/components/ScreenHeader'
import { PrintSetup } from './PrintSetup'

export const dynamic = 'force-dynamic'

export default function PrintSetupPage() {
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="Print Set-up (S-3-4)" source="/render/pdf · /approvals (client)" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <PrintSetup />
      </div>
    </div>
  )
}
