import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { buildXlsx, type Sheet } from '@/lib/xlsx'

/** 감사 로그 엑셀 내보내기 — 컴플라이언스/보안 감사 대응(제품안내서 §07 감사·추적성).
 *  감사 로그 반출은 보안 감사 업무이므로 보안담당·Admin 만 허용한다.
 *  화면 필터(수행자·결과·검색어)를 쿼리로 받아 화면에 보이는 그 집합을 그대로 반출한다 —
 *  감사관이 특정 사건으로 좁힌 뒤 엑셀에서 다시 거르지 않도록. 내보내기 자체도 감사 대상이다. */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return new Response('Forbidden', { status: 403 })

  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') ?? '').trim().toLowerCase()
  const actor = sp.get('actor') ?? '전체'
  const result = sp.get('result') ?? '전체'
  const from = sp.get('from') ?? ''
  const to = sp.get('to') ?? ''
  const filtered = q !== '' || actor !== '전체' || result !== '전체' || from !== '' || to !== ''

  const logs = getStore().auditLogs.filter((l) => {
    if (result !== '전체' && l.result !== result) return false
    if (actor !== '전체' && l.actor !== actor) return false
    const d = l.at.slice(0, 10)
    if (from && d < from) return false
    if (to && d > to) return false
    if (!q) return true
    return [l.actor, l.action, l.target].some((f) => f.toLowerCase().includes(q))
  })
  const sheet: Sheet = {
    name: '감사 로그',
    header: ['일시', '수행자', '동작', '대상', '결과', '접근 IP'],
    rows: logs.map((l) => [l.at, l.actor, l.action, l.target, l.result, l.ip]),
  }
  const buf = buildXlsx([sheet])

  const scope = filtered
    ? `필터: ${[actor !== '전체' && `수행자=${actor}`, result !== '전체' && `결과=${result}`, (from || to) && `기간=${from || '~'}~${to || '~'}`, q && `검색='${q}'`].filter(Boolean).join(', ')}`
    : '전체'
  appendAudit({ actor: session.name, action: `감사 로그 내보내기 (${logs.length}건 · ${scope})`, target: '감사 로그' })

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
