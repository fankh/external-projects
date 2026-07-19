import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import type { CadDocument } from '@/lib/cadTypes'
import { CadViewer } from './CadViewer'

export const dynamic = 'force-dynamic'

export default async function CadViewerPage({ searchParams }: { searchParams: Promise<{ fileId?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const sp = await searchParams
  const fileId = Number(sp.fileId)
  if (!fileId) {
    return <div style={{ padding: 16, fontSize: 11, color: 'var(--txt-mute)' }}>{t('detail.cadOpenHint', '?fileId=<id> 로 도면을 여십시오 (Project Folder 드릴다운)')}</div>
  }
  let doc: CadDocument | null = null
  let err: string | null = null
  let related: { code: string; name: string; href: string }[] = []
  try {
    const [r, rel] = await Promise.all([
      apiServer<{ document: CadDocument }>(`/cad/view/${fileId}`),
      apiServer<{ codes: { code: string; name: string; href: string }[] }>(`/cad/view/${fileId}/related-codes`).catch(() => ({ codes: [] })),
    ])
    doc = r.document
    related = rel.codes
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {err ? (
        <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
      ) : doc ? (
        <CadViewer doc={doc} fileId={fileId} related={related} />
      ) : null}
    </div>
  )
}
