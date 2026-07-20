import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { MilestoneGrid, type Milestone } from './MilestoneGrid'

export const dynamic = 'force-dynamic'

interface MsSummary {
  projects: { projectNo: string; total: number; done: number; overdue: number; dueSoon: number; progress: number }[]
  totalOverdue: number; totalDueSoon: number; projectCount: number
}

export default async function MilestonesPage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: Milestone[] = []
  let summary: MsSummary | null = null
  let err: string | null = null
  try {
    ;[rows, summary] = await Promise.all([
      apiServer<Milestone[]>('/erp/milestones'),
      apiServer<MsSummary>('/erp/milestones/summary').catch(() => null),
    ])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('ms.header', '일정·마일스톤')} (D-7)`} count={err ? undefined : rows.length} source="/erp/milestones · summary" />
      {/* 요약 롤업 (GET /erp/milestones/summary) — 프로젝트별 진척·지연·임박 */}
      {summary ? (
        <div data-ms-summary style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 8px', fontSize: 10.5, flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
          <span className={`st ${summary.totalOverdue > 0 ? 'err' : ''}`}>{t('ms.sumOverdue', '지연')} {summary.totalOverdue}</span>
          <span className={`st ${summary.totalDueSoon > 0 ? 'warn' : ''}`}>{t('ms.sumDueSoon', '임박')} {summary.totalDueSoon}</span>
          <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)' }} />
          {summary.projects.map((p) => (
            <span key={p.projectNo} className="st" title={`${p.done}/${p.total} · ${t('ms.sumOverdue', '지연')} ${p.overdue} · ${t('ms.sumDueSoon', '임박')} ${p.dueSoon}`}>
              {p.projectNo} <b style={{ color: p.overdue ? 'var(--err)' : 'var(--run)' }}>{p.progress}%</b>
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <MilestoneGrid rows={rows} />}
      </div>
    </div>
  )
}
