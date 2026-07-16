import { apiServer } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { OutputDocView } from './OutputDocView'

export const dynamic = 'force-dynamic'

const STATUS_IDX: Record<string, number> = { SET_UP: 0, CHECK: 1, APPROVE: 2, ACCEPTED: 3 }

export default async function OutputDocPage({ searchParams }: { searchParams: Promise<{ file?: string; folder?: string; fileType?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const sp = await searchParams
  const file = (sp.file ?? '문서').trim()
  const folder = (sp.folder ?? 'DWG').trim()
  const fileType = (sp.fileType ?? 'PDF').trim()
  // G3-a — Run 산출물을 doc_control 정본으로 find-or-create
  let docNo: string | null = null
  let stage = 0
  const reg = await apiServer<{ docNo: string; status: string }>('/documents/register-output', {
    method: 'POST', body: JSON.stringify({ fileName: file, folder, fileType }),
  }).catch(() => null)
  if (reg) { docNo = reg.docNo; stage = STATUS_IDX[reg.status] ?? 0 }
  else {
    const alloc = await apiServer<{ docNo: string }>('/documents/allocate-code', { method: 'POST', body: JSON.stringify({ docType: folder || 'DOC' }) }).catch(() => null)
    docNo = alloc?.docNo ?? null
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('detail.outputTitle', '산출물 문서 상세')} — ${file}`} source="/documents/register-output · /status" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <OutputDocView file={file} folder={folder} fileType={fileType} docNo={docNo} initialStage={stage} />
      </div>
    </div>
  )
}
