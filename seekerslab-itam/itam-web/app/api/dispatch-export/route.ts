import { appendAudit, forbidden } from '@/lib/audit'
import { today } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { buildXlsx, type Sheet } from '@/lib/xlsx'

/** 알림 발송 이력 엑셀 내보내기 — 발송 이력은 통지 증적(제품안내서 §06). 반출은 보안담당·Admin 만.
 *  화면 필터(수신·제목·연결문서 검색·채널·종류)를 쿼리로 받아 화면에 보이는 그 집합을 그대로 반출한다.
 *  내보내기 자체도 감사 대상 — 누가 몇 건을(어떤 필터로) 반출했는지 남긴다. */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) return forbidden(session.name, '권한 밖 반출 시도 — 발송 이력', '/api/dispatch-export')

  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') ?? '').trim().toLowerCase()
  const channel = sp.get('channel') ?? '전체'
  const kind = sp.get('kind') ?? '전체'
  // 전달 상태 — 화면의 '전달 실패' 필터와 같은 값. 반출본이 화면과 다른 집합이면 증적 대사가 어긋난다.
  const delivery = sp.get('delivery') ?? '전체'
  const from = sp.get('from') ?? ''
  const to = sp.get('to') ?? ''
  const filtered = q !== '' || channel !== '전체' || kind !== '전체' || from !== '' || to !== '' || delivery !== '전체'

  const rows = getStore().dispatches.filter((m) => {
    if (delivery === '실패' && m.deliveryStatus !== '실패') return false
    if (channel !== '전체' && m.channel !== channel) return false
    if (kind !== '전체' && m.kind !== kind) return false
    const d = m.at.slice(0, 10)
    if (from && d < from) return false
    if (to && d > to) return false
    if (!q) return true
    return [m.to, m.subject, m.ref ?? ''].some((f) => f.toLowerCase().includes(q))
  })
  const sheet: Sheet = {
    name: '알림 발송 이력',
    header: ['발송 ID', '채널', '종류', '수신', '제목', '연결 문서', '발송 시각', '전달 상태', '재발송 증적'],
    rows: rows.map((m) => [m.id, m.channel, m.kind, m.to, m.subject, m.ref ?? '-', m.at, m.deliveryStatus ?? '발송',
      // 재발송 증적 — '보냈다'가 아니라 '언제·몇 번 보냈다'까지가 통지 증적의 사실이다.
      m.failedAt ? `재발송 (최초 ${m.failedAt} 실패${m.resentBy ? ` · ${m.resentBy}` : ''})` : '-']),
  }
  const buf = buildXlsx([sheet])

  const scope = filtered
    ? `필터: ${[channel !== '전체' && `채널=${channel}`, kind !== '전체' && `종류=${kind}`, delivery !== '전체' && `전달=${delivery}`, (from || to) && `기간=${from || '~'}~${to || '~'}`, q && `검색='${q}'`].filter(Boolean).join(', ')}`
    : '전체'
  appendAudit({ actor: session.name, action: `알림 발송 이력 내보내기 (${rows.length}건 · ${scope})`, target: '알림 발송 이력' })

  const filename = `알림발송이력_${today().replace(/-/g, '')}.xlsx`
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'content-length': String(buf.length),
      'cache-control': 'no-store',
    },
  })
}
