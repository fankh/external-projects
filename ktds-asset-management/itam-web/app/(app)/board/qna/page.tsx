import { ScreenHeader, Stat } from '@/components/ui'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { QnaBoard } from './QnaBoard'

export const dynamic = 'force-dynamic'

export default async function QnaPage() {
  const session = (await getSession())!
  const s = getStore()
  const qna = s.posts.filter((p) => p.kind === 'QnA').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const waiting = qna.filter((p) => !p.answer)

  return (
    <>
      <ScreenHeader
        kicker="Main · QnA"
        title="QnA"
        desc="자산 신청·반납 · 장애·수리 · 라이선스 · 보안 문의 — 담당자 답변"
      />

      <div className="stat-row">
        <Stat value={qna.length} label="전체 문의" />
        <Stat value={waiting.length} label="답변 대기" tone={waiting.length ? 'warn' : 'ok'} />
        <Stat value={qna.length - waiting.length} label="답변 완료" tone="ok" />
        <Stat value={qna.filter((p) => p.author === session.name).length} label="내 문의" tone="accent" />
      </div>

      <QnaBoard posts={qna} canAnswer={session.role !== 'USER'} me={session.name} />
    </>
  )
}
