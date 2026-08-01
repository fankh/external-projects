import { getSession } from '@/lib/session'
import { toCsv, toMarkdown } from '@/lib/reports'
import { getStore } from '@/lib/store'

/** 결재 첨부용 리포트 다운로드 — 엑셀 호환 CSV 또는 문서(Markdown) */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session || session.role === 'USER') return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const report = getStore().reports.find((r) => r.id === id)
  if (!report) return new Response('Not Found', { status: 404 })

  const format = new URL(req.url).searchParams.get('format') === 'md' ? 'md' : 'csv'
  const meta = `${report.mode} 생성 · ${report.generatedBy}`
  const body = format === 'md'
    ? toMarkdown(report.title, report.period, report.headline, report.sections, meta)
    : toCsv(report.title, report.sections, report.headline)

  const filename = `${report.id}_${report.kind.replace(/\s+/g, '')}.${format === 'md' ? 'md' : 'csv'}`
  return new Response(body, {
    headers: {
      'content-type': format === 'md' ? 'text/markdown; charset=utf-8' : 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'cache-control': 'no-store',
    },
  })
}
