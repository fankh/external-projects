import { Card, ScreenHeader } from '@/components/ui'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { NoticeBoard } from './NoticeBoard'

export const dynamic = 'force-dynamic'

export default async function NoticesPage() {
  const session = await getSession()
  const s = getStore()
  const notices = s.posts
    .filter((p) => p.kind === '공지')
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt.localeCompare(a.createdAt))

  return (
    <>
      <ScreenHeader
        kicker="Main · Notice"
        title="공지사항"
        desc="재물조사 · 정책 시행 · 자산 신청 안내 등 전사 공지"
      />
      {notices.length === 0
        ? <Card><div className="empty">등록된 공지가 없습니다</div></Card>
        : <NoticeBoard posts={notices} canWrite={session?.role === 'ADMIN'} me={session?.name ?? ''} totalUsers={s.users.length} />}
    </>
  )
}
