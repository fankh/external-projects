import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { buildXlsx, type Sheet } from '@/lib/xlsx'

/** 감사 로그 엑셀 내보내기 — 컴플라이언스/보안 감사 대응(제품안내서 §07 감사·추적성).
 *  감사 로그 반출은 보안 감사 업무이므로 보안담당·Admin 만 허용한다.
 *  내보내기 자체도 감사 대상 — 누가 몇 건을 반출했는지 로그에 남긴다. */
export async function GET() {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return new Response('Forbidden', { status: 403 })

  const logs = getStore().auditLogs
  const sheet: Sheet = {
    name: '감사 로그',
    header: ['일시', '수행자', '동작', '대상', '결과', '접근 IP'],
    rows: logs.map((l) => [l.at, l.actor, l.action, l.target, l.result, l.ip]),
  }
  const buf = buildXlsx([sheet])

  appendAudit({ actor: session.name, action: `감사 로그 내보내기 (${logs.length}건)`, target: '감사 로그' })

  const filename = `감사로그_${today().replace(/-/g, '')}.xlsx`
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'content-length': String(buf.length),
      'cache-control': 'no-store',
    },
  })
}
