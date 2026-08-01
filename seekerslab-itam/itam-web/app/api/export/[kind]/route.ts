import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { EXPORT_KINDS, EXPORT_META, buildSheets, canExport, type ExportKind } from '@/lib/exports'
import { getSession } from '@/lib/session'
import { buildXlsx } from '@/lib/xlsx'

/** 엑셀 내보내기 — 권한 매트릭스의 '엑셀' 기능 단위 통제를 서버에서 강제한다.
 *  버튼을 숨기는 것만으로는 URL 직접 호출을 막지 못한다 (제품안내서 §02 최소권한). */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { kind } = await params
  if (!EXPORT_KINDS.includes(kind as ExportKind)) return new Response('Not Found', { status: 404 })
  const k = kind as ExportKind
  if (!canExport(k, session.role)) return new Response('Forbidden', { status: 403 })

  const sheets = buildSheets(k, session.role, session.name)
  const buf = buildXlsx(sheets)
  const rows = sheets.reduce((n, s) => n + s.rows.length, 0)

  // 내보내기는 데이터 반출이므로 감사 대상이다 — 누가 무엇을 몇 건 받았는지 남긴다
  appendAudit({
    actor: session.name,
    action: `엑셀 내보내기 — ${EXPORT_META[k].label} (${rows}건)`,
    target: EXPORT_META[k].label,
  })

  const filename = `${EXPORT_META[k].file}_${today().replace(/-/g, '')}.xlsx`
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'content-length': String(buf.length),
      'cache-control': 'no-store',
    },
  })
}
