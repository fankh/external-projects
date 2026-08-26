import { appendAudit, forbidden } from '@/lib/audit'
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
  // 반출 거부도 감사에 남긴다 — '누가 어떤 대장을 권한 밖에서 내려받으려 했는가'는 감사 질문 그 자체다
  if (!canExport(k, session.role)) return forbidden(session.name, `권한 밖 반출 시도 — ${EXPORT_META[k].label}`, `/api/export/${k}`)

  // 자산 대장은 화면 필터(검색·유형)를 쿼리로 받아 반영한다 (다른 종류는 무시)
  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') ?? '').trim()
  const cat = sp.get('cat') ?? '전체'
  // nos=자산번호 CSV — 대장 다중 선택 반출(선택 내보내기). 있으면 검색·유형 필터에 우선한다.
  const nos = (sp.get('nos') ?? '').split(',').map((v) => v.trim()).filter(Boolean)
  const status = sp.get('status') ?? '전체'
  const stale = sp.get('stale') === '1'
  const warranty = sp.get('warranty') === '1'
  const channel = sp.get('channel') ?? '전체'
  const state = sp.get('state') ?? '전체'
  const risk = sp.get('risk') ?? '전체'
  const akind = sp.get('akind') ?? '전체'
  const mine = sp.get('mine') === '1'
  const selExport = k === 'assets' && nos.length > 0
  const discFiltered = k === 'discovered' && (q !== '' || channel !== '전체' || state !== '전체' || risk !== '전체')
  const aprFiltered = k === 'approvals' && (q !== '' || status !== '전체' || akind !== '전체' || mine)
  const filtered = (k === 'assets' && !selExport && (q !== '' || cat !== '전체' || status !== '전체' || stale || warranty)) || discFiltered || aprFiltered
  const sheets = buildSheets(k, session.role, session.name, { q, cat, nos, status, stale, warranty, channel, state, risk, akind, mine })
  const buf = buildXlsx(sheets)
  const rows = sheets.reduce((n, s) => n + s.rows.length, 0)

  // 내보내기는 데이터 반출이므로 감사 대상이다 — 누가 무엇을 몇 건 받았는지 남긴다
  const scope = selExport ? ` · 선택 ${nos.length}건`
    : discFiltered ? ` · 필터: ${[channel !== '전체' && `채널=${channel}`, state !== '전체' && `대사=${state}`, risk !== '전체' && `위험도=${risk}`, q && `검색='${q}'`].filter(Boolean).join(', ')}`
    : aprFiltered ? ` · 필터: ${[status !== '전체' && `상태=${status}`, akind !== '전체' && `구분=${akind}`, mine && '내상신만', q && `검색='${q}'`].filter(Boolean).join(', ')}`
    : filtered ? ` · 필터: ${[cat !== '전체' && `유형=${cat}`, status !== '전체' && `상태=${status}`, stale && '장기미실측', warranty && '보증임박', q && `검색='${q}'`].filter(Boolean).join(', ')}` : ''
  appendAudit({
    actor: session.name,
    action: `엑셀 내보내기 — ${EXPORT_META[k].label} (${rows}건)${scope}`,
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
