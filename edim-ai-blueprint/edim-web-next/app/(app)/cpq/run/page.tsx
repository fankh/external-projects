import { apiServer } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { RunPanel } from './RunPanel'

export const dynamic = 'force-dynamic'

// CPQ Run — 비동기 파이프라인. 서버 액션 startRun(202)→pollRun 폴링(클라 아일랜드).
export default async function RunPage({ searchParams }: { searchParams: Promise<{ selectionId?: string }> }) {
  const sp = await searchParams
  const selectionId = sp.selectionId ? Number(sp.selectionId) : undefined
  // 19.16 — 화면을 **열기만 해도** 파이프라인이 돌던 것을 멈춘다. Run 은 결과물(원가·산출물)을
  // 만들고, 프로젝트의 '최신 SUCCESS Run' 은 고객 전달 패키지의 내용을 정한다(18.77·18.80).
  // 메뉴로 들어온 것과 'Run ▶' 을 누른 것은 다른 의도다 — 후자만 자동 시작한다.
  const autoStart = Number.isFinite(selectionId)
  const latest = autoStart ? null
    : await apiServer<{ runId: number; status: string; startedAt: string; isTest: boolean }[]>(
      '/cpq/runs?limit=1').then((r) => r?.[0] ?? null).catch(() => null)
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('run.pipelineTitle', 'Run 파이프라인 (C-1)')} source="POST /cpq/runs → /cpq/runs/{id}" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <RunPanel selectionId={Number.isFinite(selectionId) ? selectionId : undefined}
          autoStart={autoStart} latest={latest} />
      </div>
    </div>
  )
}
