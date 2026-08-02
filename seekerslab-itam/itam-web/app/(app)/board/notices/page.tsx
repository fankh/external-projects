import { Card, ScreenHeader } from '@/components/ui'
import { today } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { NoticeBoard } from './NoticeBoard'

export const dynamic = 'force-dynamic'

export default async function NoticesPage() {
  const session = await getSession()
  const s = getStore()
  const t = today()
  const isAdmin = session?.role === 'ADMIN'
  const notices = s.posts
    // 예약 발행 — 발행일이 미래인 공지는 관리자에게만 보이고, 발행일이 도래하면 전사에 공개된다
    .filter((p) => p.kind === '공지' && (isAdmin || !p.publishAt || p.publishAt <= t))
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
        : <NoticeBoard posts={notices} canWrite={isAdmin} me={session?.name ?? ''} totalUsers={s.users.length} today={t} />}
    </>
  )
}
