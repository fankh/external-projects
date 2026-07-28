import { apiServer, apiServerWith, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { FolderGrid, type FolderFile } from './FolderGrid'

export const dynamic = 'force-dynamic'

interface OutputPackage {
  packageId: number; at: string; outputCount: number; bomRows: number
  finishedGoodsCode: string; selectionId: number; configSnapshotId: number | null
  handoffStatus: string | null
}

export default async function FolderPage({ searchParams }: { searchParams: Promise<{ project?: string; allRuns?: string }> }) {
  const sp = await searchParams
  const project = (sp.project ?? 'PS-61313-5').trim() || 'PS-61313-5'
  const allRuns = sp.allRuns === '1'
  const bundle = bundleFor(await getLocale())
  const tt = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: FolderFile[] = []
  let packages: OutputPackage[] = []
  let hidden = 0        // 18.84 — 기본 보기에서 뺀 '지난 Run 산출물' 수(백엔드 헤더)
  let truncated = false
  let err: string | null = null
  try {
    const [files, pkgs] = await Promise.all([
      apiServerWith<FolderFile[]>(
        `/files?project=${encodeURIComponent(project)}${allRuns ? '&allRuns=true' : ''}`),
      apiServer<OutputPackage[]>(`/projects/${encodeURIComponent(project)}/output-packages`).catch(() => []),
    ])
    rows = files.data
    packages = pkgs
    hidden = Number(files.headers.get('x-superseded-hidden') ?? 0)
    truncated = files.headers.get('x-truncated') === 'true'
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`Project Folder — ${project}`} count={err ? undefined : rows.length}
        source="/files · output-packages"
        right={err ? undefined : (
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
            {/* 18.84 — 뺀 사실을 화면에 적는다. 헤더로만 알리면 사용자에게 닿지 않는다. */}
            {truncated ? <span className="chip warn">{tt('folder.truncated', '표시 상한 도달')}</span> : null}
            {hidden > 0 ? (
              <>
                <span className="chip info">{tt('folder.supersededHidden', '지난 Run 산출물 숨김')} {hidden.toLocaleString()}</span>
                <a className="b" href={`/common/folder?project=${encodeURIComponent(project)}&allRuns=1`}>
                  {tt('folder.showAllRuns', '전체 Run 보기')}</a>
              </>
            ) : null}
            {allRuns ? (
              <a className="b" href={`/common/folder?project=${encodeURIComponent(project)}`}>
                {tt('folder.showCurrentRun', '현재 Run 만')}</a>
            ) : null}
          </span>
        )} />
      {/* 트리아지 #42 — Project Output Package: Run 단위 산출물 묶음 (FG 표시 + Snapshot ID 추적) */}
      {packages.length ? (
        <div data-output-packages style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 8px', fontSize: 10.5, flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
          <b style={{ color: 'var(--title-navy)' }}>{tt('folder.pkgTitle', 'Output Package')}</b>
          {packages.slice(0, 5).map((p) => (
            <span key={p.packageId} className="st" title={`${p.configSnapshotId ? `Config Snapshot #${p.configSnapshotId}` : 'Snapshot 미고정'} · 선택안 #${p.selectionId} · BOM ${p.bomRows}행 · ${p.at}`}>
              #{p.packageId} {p.finishedGoodsCode || '—'} · {tt('folder.pkgOutputs', '산출물')} {p.outputCount}
              {p.handoffStatus ? <b style={{ marginLeft: 3, color: p.handoffStatus === 'accepted' ? 'var(--run)' : 'var(--warn, #B4820B)' }}>{p.handoffStatus}</b> : null}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <FolderGrid rows={rows} project={project} />}
      </div>
    </div>
  )
}
