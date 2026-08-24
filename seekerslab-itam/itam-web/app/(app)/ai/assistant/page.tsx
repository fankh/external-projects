import { Card, Chip, ScreenHeader } from '@/components/ui'
import { aiStatus } from '@/lib/ai-status'
import { requireView } from '@/lib/authz'
import { ChatView } from './ChatView'

export const dynamic = 'force-dynamic'

export default async function AssistantPage() {
  // 키 존재가 아니라 마지막 호출 결과를 표시한다 — 크레딧 소진 등으로 매번 규칙 응답으로
  // 떨어지는 동안에도 '연결됨' 이라 주장하면 운영자가 폴백 사실을 알 수 없다
  const ai = aiStatus()
  const session = await requireView('/ai/assistant', 'USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const canReport = Boolean(session) && session!.role !== 'USER'
  return (
    <>
      <ScreenHeader
        kicker="AI Intelligence · Assistant"
        title="AI 어시스턴트"
        desc="자연어 자산 질의 · 리포트 생성 — 응답은 화면 데이터와 동일한 권한 필터를 적용합니다"
        right={<Chip tone={ai.tone}>{ai.state === '가동' ? `온프레미스 LLM 연결됨 — 최근 성공` : ai.label}</Chip>}
      />
      <div className="callout">
        <b>AI 거버넌스.</b> AI 제안·질의·응답 전체는 감사 로그로 보존되며, 권한 밖 데이터는 질의 컨텍스트에서
        원천 배제됩니다. 응답에는 근거 데이터 링크가 첨부되어 답변을 검증할 수 있습니다.
      </div>
      <Card pad={false}>
        <ChatView canReport={canReport} />
      </Card>
    </>
  )
}
