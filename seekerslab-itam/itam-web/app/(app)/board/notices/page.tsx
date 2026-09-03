import { Card, ScreenHeader } from '@/components/ui'
import { today, SORT_LOCALE } from '@/lib/dates'
import { inNoticeAudience } from '@/lib/notice'
import { noticeRemindTargets } from '@/lib/reminders'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { NoticeBoard } from './NoticeBoard'

export const dynamic = 'force-dynamic'

export default async function NoticesPage({ searchParams }: { searchParams: Promise<{ sel?: string; gap?: string }> }) {
  const session = await getSession()
  // gap=1 — 대시보드 '필독 공지 확인 미달' 큐의 드릴다운(확인 미달만 보기로 연다).
  const { sel, gap } = await searchParams
  const s = getStore()
  const t = today()
  const isAdmin = session?.role === 'ADMIN'
  const notices = s.posts
    // 예약 발행 — 발행일이 미래인 공지는 관리자에게만 보이고, 발행일이 도래하면 대상에 공개된다.
    // 대상 부서 공지 — 비관리자는 자기 부서(또는 전사) 공지만 본다. 관리자는 전 공지를 관리 목적으로 본다.
    .filter((p) => p.kind === '공지' && (isAdmin || !p.publishAt || p.publishAt <= t))
    .filter((p) => isAdmin || inNoticeAudience(p, session?.dept))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt.localeCompare(a.createdAt, SORT_LOCALE))
  const depts = [...new Set(s.users.map((u) => u.dept))].sort()
  // 공지별 '오늘 보낼 미확인자 수' — 버튼 건수와 액션이 같은 집합을 보게 한다(lib/reminders 단일 소스).
  const remindPending: Record<string, number> = {}
  for (const p of notices) remindPending[p.id] = noticeRemindTargets(p.id).length


  return (
    <>
      <ScreenHeader
        kicker="Main · Notice"
        title="공지사항"
        desc="재물조사 · 정책 시행 · 자산 신청 안내 등 전사 공지"
      />
      {notices.length === 0
        ? <Card><div className="empty">등록된 공지가 없습니다</div></Card>
        : <NoticeBoard posts={notices} remindPending={remindPending} canWrite={isAdmin} me={session?.name ?? ''} allUsers={s.users.map((u) => ({ name: u.name, dept: u.dept }))} depts={depts} today={t} initialSel={sel} initialGap={gap === '1'} />}
    </>
  )
}
