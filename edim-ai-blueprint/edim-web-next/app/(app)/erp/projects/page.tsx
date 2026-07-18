import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { getMe } from '@/lib/auth'
import { CommentThread } from './CommentThread'
import type { CommentRow } from './commentActions'
import { ProjectGrid, type ProjectRow } from './ProjectGrid'
import { ProjectRegForm, ProjectStagePanel } from './ProjectsPanel'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ no?: string }> }) {
  const locale = await getLocale()
  const t = (k: string, ko: string) => translate(bundleFor(locale), k, ko)
  let rows: ProjectRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<ProjectRow[]>('/projects')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const sp = await searchParams
  const sel = sp.no ? rows.find((r) => r.projectNo === sp.no) ?? null : null
  let updatedAt = ''
  let comments: CommentRow[] = []
  let myLogin = ''
  if (sel) {
    const [d, cs, me] = await Promise.all([
      apiServer<{ stage: string; updatedAt?: string }>(`/projects/${encodeURIComponent(sel.projectNo)}`).catch(() => null),
      apiServer<CommentRow[]>(`/projects/${encodeURIComponent(sel.projectNo)}/comments`).catch(() => []),
      getMe(),
    ])
    updatedAt = d?.updatedAt ?? ''
    comments = cs
    myLogin = me?.login ?? ''
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('prj.ledgerTitle', '프로젝트 대장')} (F-1)`} count={err ? undefined : rows.length} source="/projects" />
      <div style={{ padding: '4px 6px 0' }}><ProjectRegForm /></div>
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}><ProjectGrid rows={rows} selectedNo={sel?.projectNo} /></div>
            <div style={{ width: 320, overflow: 'auto' }}>
              {sel
                ? <><ProjectStagePanel no={sel.projectNo} stage={sel.stage} updatedAt={updatedAt} /><CommentThread projectNo={sel.projectNo} initial={comments} myLogin={myLogin} /></>
                : <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>{t('prj.rowHint', '행을 클릭하면 영업 단계 전이·삭제를 관리합니다')}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
