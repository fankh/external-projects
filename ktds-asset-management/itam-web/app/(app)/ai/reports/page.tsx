import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { REPORT_KINDS } from '@/lib/reports'
import { getStore } from '@/lib/store'
import { ReportsView } from './ReportsView'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  await requireRole('ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const s = getStore()
  const live = Boolean(process.env.ANTHROPIC_API_KEY)

  return (
    <>
      <ScreenHeader
        kicker="AI Intelligence · Reports"
        title="리포트 자동 생성"
        desc="주간 Shadow IT 브리핑 · 월간 자산·라이선스 리포트 · 재물조사 요약 · 감사 대응 자료 — 결재 첨부용 문서 산출"
        right={live
          ? <Chip tone="ok">AI 서술 생성</Chip>
          : <Chip tone="neutral">규칙 기반 생성 — API 키 미설정</Chip>}
      />

      <div className="stat-row">
        <Stat value={REPORT_KINDS.length} label="리포트 유형" />
        <Stat value={s.reports.length} label="생성된 리포트" tone="accent" />
        <Stat value={s.reports.filter((r) => r.mode === 'AI').length} label="AI 서술 생성" tone={live ? 'ok' : 'warn'} />
        <Stat value={s.aiPolicy.auditRetentionDays} label="리포트·AI 로그 보존 (일)" />
      </div>

      <div className="callout">
        <b>수치는 데이터, 서술은 AI.</b> 표 항목은 자산 대장·발견 저장소·계약에서 결정적으로 산출하므로 화면
        데이터와 항상 일치합니다. AI는 그 표를 근거로 요약 서술만 작성하며, 키가 없으면 규칙 기반 서술로
        대체되어 리포트 생성 자체는 동일하게 동작합니다. 산출물은 결재 첨부용 엑셀(CSV)·문서로 내려받을 수 있습니다.
      </div>

      <ReportsView kinds={REPORT_KINDS} reports={s.reports} />
    </>
  )
}
