import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { FolderGrid, type FolderFile } from './FolderGrid'

export const dynamic = 'force-dynamic'

interface OutputPackage {
  packageId: number; at: string; outputCount: number; bomRows: number
  finishedGoodsCode: string; configSnapshotId: number; handoffStatus: string | null
}

export default async function FolderPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const sp = await searchParams
  const project = (sp.project ?? 'PS-61313-5').trim() || 'PS-61313-5'
  const bundle = bundleFor(await getLocale())
  const tt = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: FolderFile[] = []
  let packages: OutputPackage[] = []
  let err: string | null = null
  try {
    ;[rows, packages] = await Promise.all([
      apiServer<FolderFile[]>(`/files?project=${encodeURIComponent(project)}`),
      apiServer<OutputPackage[]>(`/projects/${encodeURIComponent(project)}/output-packages`).catch(() => []),
    ])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`Project Folder — ${project}`} count={err ? undefined : rows.length} source="/files · output-packages" />
      {/* 트리아지 #42 — Project Output Package: Run 단위 산출물 묶음 (FG 표시 + Snapshot ID 추적) */}
      {packages.length ? (
        <div data-output-packages style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 8px', fontSize: 10.5, flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
          <b style={{ color: 'var(--title-navy)' }}>{tt('folder.pkgTitle', 'Output Package')}</b>
          {packages.slice(0, 5).map((p) => (
            <span key={p.packageId} className="st" title={`Config Snapshot #${p.configSnapshotId} · BOM ${p.bomRows}행 · ${p.at}`}>
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
