import { apiServer } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { MobilePreview, type ApprovalReq, type EventRow } from './MobilePreview'

export const dynamic = 'force-dynamic'

export default async function MobilePreviewPage() {
  const [inbox, events] = await Promise.all([
    apiServer<ApprovalReq[]>('/approvals/inbox').catch(() => []),
    apiServer<EventRow[]>('/erp/events').catch(() => []),
  ])
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="모바일 미리보기 (APP)" source="/approvals/inbox · /erp/events" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <MobilePreview inbox={inbox} events={events} />
      </div>
    </div>
  )
}
