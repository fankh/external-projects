import { Card, ScreenHeader } from '@/components/ui'
import { ChatView } from './ChatView'

export const dynamic = 'force-dynamic'

export default function AssistantPage() {
  const live = Boolean(process.env.ANTHROPIC_API_KEY)
  return (
    <>
      <ScreenHeader
        kicker="AI Intelligence · Assistant"
        title="AI 어시스턴트"
        desc="자연어 자산 질의 · 리포트 생성 — 응답은 화면 데이터와 동일한 권한 필터를 적용합니다"
        right={
          live
            ? <span className="chip ok">온프레미스 LLM 연결됨</span>
            : <span className="chip neutral">데모 모드 — API 키 미설정</span>
        }
      />
      <div className="callout">
        <b>AI 거버넌스.</b> AI 제안·질의·응답 전체는 감사 로그로 보존되며, 권한 밖 데이터는 질의 컨텍스트에서
        원천 배제됩니다. 응답에는 근거 데이터 링크가 첨부되어 답변을 검증할 수 있습니다.
      </div>
      <Card pad={false}>
        <ChatView />
      </Card>
    </>
  )
}
