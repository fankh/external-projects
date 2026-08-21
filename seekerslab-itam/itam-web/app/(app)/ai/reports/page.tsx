import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { aiStatus } from '@/lib/ai-status'
import { requireRole } from '@/lib/authz'
import { isScheduleOverdue, nextRunOf, REPORT_KINDS } from '@/lib/reports'
import { ScheduleCard } from './ScheduleCard'
import { getStore } from '@/lib/store'
import { ReportsView } from './ReportsView'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  await requireRole('ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const s = getStore()
  const ai = aiStatus()
  const DAY = ['', '월', '화', '수', '목', '금', '토', '일']
  const schedules = s.reportSchedules.map((sc) => {
    const nextRun = nextRunOf(sc)
    return {
      kind: sc.kind, period: sc.period, enabled: sc.enabled, hour: sc.hour,
      dayOfWeek: sc.dayOfWeek, dayOfMonth: sc.dayOfMonth,
      dayLabel: sc.period === '주간' ? `매주 ${DAY[sc.dayOfWeek ?? 1]}요일` : `매월 ${sc.dayOfMonth ?? 1}일`,
      recipients: sc.recipients, lastRunAt: sc.lastRunAt, nextRun,
      overdue: isScheduleOverdue(sc),
    }
  })
  // 스케줄이 없는 리포트도 함께 보여준다 — 주기(period)를 함께 넘겨, 정기(월간·주간)인데 스케줄 미등록인 리포트는
  // '스케줄 등록'을, 수시 리포트는 수동 생성 안내를 구분해 노출한다.
  const scheduled = new Set(s.reportSchedules.map((x) => x.kind))
  const adhoc = REPORT_KINDS.filter((k) => !scheduled.has(k.kind)).map((k) => ({ kind: k.kind, desc: k.desc, period: k.period }))
  const onceOffN = adhoc.filter((a) => a.period === '수시').length
  const schedulableN = adhoc.length - onceOffN

  return (
    <>
      <ScreenHeader
        kicker="AI Intelligence · Reports"
        title="리포트 자동 생성"
        desc="주간 Shadow IT 브리핑 · 월간 자산·라이선스 리포트 · 재물조사 요약 · 감사 대응 자료 — 결재 첨부용 문서 산출"
        right={<Chip tone={ai.tone}>{ai.label}</Chip>}
      />

      <div className="stat-row">
        <Stat value={REPORT_KINDS.length} label="리포트 유형" delta={{ text: `자동 ${s.reportSchedules.length}(가동 ${s.reportSchedules.filter((x) => x.enabled).length}) · 수시 ${onceOffN}${schedulableN ? ` · 스케줄 미등록 정기 ${schedulableN}` : ''}`, dir: 'flat' }} />
        <Stat value={s.reports.length} label="생성된 리포트" tone="accent" />
        <Stat value={s.reports.filter((r) => r.mode === 'AI').length} label="AI 서술 생성" tone={ai.state === '가동' ? 'ok' : 'warn'} />
        <Stat value={s.aiPolicy.auditRetentionDays} label="리포트·AI 로그 보존 (일)" />
      </div>

      <ScheduleCard rows={schedules} adhoc={adhoc} />

      <div className="callout">
        <b>수치는 데이터, 서술은 AI.</b> 표 항목은 자산 대장·발견 저장소·계약에서 결정적으로 산출하므로 화면
        데이터와 항상 일치합니다. AI는 그 표를 근거로 요약 서술만 작성하며, 키가 없으면 규칙 기반 서술로
        대체되어 리포트 생성 자체는 동일하게 동작합니다. 산출물은 결재 첨부용 엑셀(xlsx)·문서로 내려받을 수 있습니다 — 섹션별 시트로 구성됩니다.
      </div>

      <ReportsView kinds={REPORT_KINDS} reports={s.reports}
        approvals={s.approvals.map((a) => ({ id: a.id, kind: a.kind, title: a.title, status: a.status, reportRefs: a.reportRefs ?? [] }))} />
    </>
  )
}
