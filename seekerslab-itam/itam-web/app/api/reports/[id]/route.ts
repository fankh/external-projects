import { appendAudit, forbidden } from '@/lib/audit'
import { getSession } from '@/lib/session'
import { can } from '@/lib/perm'
import { toCsv, toMarkdown, toSheets } from '@/lib/reports'
import { getStore } from '@/lib/store'
import { buildXlsx } from '@/lib/xlsx'

/** 결재 첨부용 리포트 다운로드 — 네이티브 엑셀(xlsx, 기본)·문서(Markdown)·엑셀 호환 CSV.
 *  다른 대장·로그 반출과 동일하게 네이티브 xlsx 를 기본으로 제공한다(제품안내서 §05 "결재 첨부용 엑셀·문서"). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  // 인증 안 됨(401)과 권한 없음(403)을 가른다 — 형제 문서 API 여섯(자산 카드·검수 확인서·인수인계서·분실 신고서·
  //  퇴사 정리표·라이선스 카드)은 이미 나누는데 이 셋만 미로그인을 403 으로 뭉뚱그려, 호출자가 '로그인하라'와
  //  '너는 안 된다'를 구분할 수 없었다.
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (session.role === 'USER') return forbidden(session.name, '권한 밖 문서 발급 시도 — 리포트 열람', '/api/reports')
  // 매트릭스 'AI 어시스턴트 × 조회'도 만족해야 한다 — 리포트 화면(/ai/reports)은 매트릭스를 보는데
  //  열람 API 가 역할만 보면, 조회를 회수한 뒤에도 결재 첨부 링크로 리포트 전문이 그대로 나간다(문서 API 와 같은 규약).
  if (!can('AI 어시스턴트', '조회', session.role)) return forbidden(session.name, '권한 밖 문서 발급 시도 — 리포트 열람', '/api/reports')

  const { id } = await params
  const report = getStore().reports.find((r) => r.id === id)
  if (!report) return new Response('Not Found', { status: 404 })

  const fmt = new URL(req.url).searchParams.get('format')
  const format = fmt === 'md' ? 'md' : fmt === 'csv' ? 'csv' : 'xlsx'
  const meta = `${report.mode} 생성 · ${report.generatedBy}`
  const base = `${report.id}_${report.kind.replace(/\s+/g, '')}`

  // 리포트 내려받기도 데이터 반출이라 감사에 남긴다 — 대장·감사 로그·발송 이력 반출(/api/export·audit-export·
  //  dispatch-export)은 "누가 무엇을 몇 건 받았는지" 를 남기는데, 정작 감사 대응 자료·부서별 비용·취약점
  //  우선순위 같은 리포트 전문은 고정 URL 로 내려받아도 흔적이 없었다(결재 첨부 근거 문서로도 쓰인다).
  const reportRows = report.sections.reduce((n, sec) => n + (sec.rows?.length ?? 0), 0)
  appendAudit({
    actor: session.name,
    action: `리포트 반출 — ${report.kind} (${format} · ${reportRows}건)`,
    target: report.id,
  })

  if (format === 'xlsx') {
    const buf = buildXlsx(toSheets(report.title, report.headline, report.sections))
    return new Response(new Uint8Array(buf), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${base}.xlsx`)}`,
        'content-length': String(buf.length),
        'cache-control': 'no-store',
      },
    })
  }

  const body = format === 'md'
    ? toMarkdown(report.title, report.period, report.headline, report.sections, meta)
    : toCsv(report.title, report.sections, report.headline)
  return new Response(body, {
    headers: {
      'content-type': format === 'md' ? 'text/markdown; charset=utf-8' : 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${base}.${format}`)}`,
      'cache-control': 'no-store',
    },
  })
}
