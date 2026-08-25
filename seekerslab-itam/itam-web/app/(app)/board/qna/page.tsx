import { ScreenHeader, Stat } from '@/components/ui'
import { QNA_SLA_DAYS, isQnaOverdue, qnaAgeDays } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { qnaRemindTargets } from '@/lib/reminders'
import { QnaBoard } from './QnaBoard'

export const dynamic = 'force-dynamic'

export default async function QnaPage({ searchParams }: { searchParams: Promise<{ sel?: string; status?: string; overdue?: string }> }) {
  const session = (await getSession())!
  // status=대기 · overdue=1 — 대시보드 QnA 큐(답변 대기 · SLA 경과)의 드릴다운. 큐가 센 집합으로 목록을 연다.
  const { sel, status, overdue } = await searchParams
  const s = getStore()
  const qna = s.posts.filter((p) => p.kind === 'QnA').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const waiting = qna.filter((p) => !p.answer)
  // 미답변 SLA 경과 — 등록 후 QNA_SLA_DAYS(기본 3일)를 넘긴 미답변 문의. 지연 표기·답변 독촉 대상. 대시보드 담당 큐와 같은 판정.
  const overdueDays: Record<string, number> = {}
  for (const p of qna) if (isQnaOverdue(p)) overdueDays[p.id] = qnaAgeDays(p.createdAt)
  // 독촉 버튼 건수 — SLA 경과 건수(배지·지표)와 달리 '오늘 아직 안 보낸' 발송 대상 수다(lib/reminders · 액션과 같은 소스).
  const remindCount = session.role !== 'USER' ? qnaRemindTargets().length : 0

  return (
    <>
      <ScreenHeader
        kicker="Main · QnA"
        title="QnA"
        desc="자산 신청·반납 · 장애·수리 · 라이선스 · 보안 문의 — 담당자 답변"
      />

      <div className="stat-row">
        <Stat value={qna.length} label="전체 문의" />
        <Stat value={waiting.length} label="답변 대기" tone={waiting.length ? 'warn' : 'ok'} delta={Object.keys(overdueDays).length ? { text: `SLA ${QNA_SLA_DAYS}일 경과 ${Object.keys(overdueDays).length}건`, dir: 'up' } : undefined} />
        <Stat value={qna.length - waiting.length} label="답변 완료" tone="ok" />
        <Stat value={qna.filter((p) => p.author === session.name).length} label="내 문의" tone="accent" />
      </div>

      <QnaBoard posts={qna} canAnswer={session.role !== 'USER'} canModerate={session.role === 'ADMIN'} me={session.name} initialSel={sel} overdueDays={overdueDays} remindCount={remindCount} initialStatus={status === '대기' || status === '완료' ? status : undefined} initialOverdue={overdue === '1'} />
    </>
  )
}
