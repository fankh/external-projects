import { apiServer } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { QrBadge } from '@/components/QrBadge'
import { MobilePreview, type ApprovalReq, type EventRow } from './MobilePreview'

export const dynamic = 'force-dynamic'

export default async function MobilePreviewPage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const [inbox, events] = await Promise.all([
    apiServer<ApprovalReq[]>('/approvals/inbox').catch(() => []),
    apiServer<EventRow[]>('/erp/events').catch(() => []),
  ])
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('mobile.title', '모바일 미리보기')} (APP)`} source="/approvals/inbox · /erp/events" right={<QrBadge path="/common/mobile" label="Mobile App (M-16)" />} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <MobilePreview inbox={inbox} events={events} />
      </div>
    </div>
  )
}
