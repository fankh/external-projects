import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { AssistantPanel } from './AssistantPanel'

export const dynamic = 'force-dynamic'

// U28 — 내부 Q&A (s27 노트 "AI 질의 응답 — 내부 자료 검색·응답용"): 검색은 항시, AI 합성은 live 시.
export default async function AssistantPage() {
  const bundle = bundleFor(await getLocale())
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('assist.title', '내부 Q&A')} (AI-08)`} source="/ai/chat — 내부 자산 검색 + Claude 합성(live)" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        <AssistantPanel />
      </div>
    </div>
  )
}
