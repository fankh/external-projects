import { printToolbar } from '@/lib/doc-toolbar'
import { escHtml as esc } from '@/lib/text'
import { appendAudit, forbidden } from '@/lib/audit'
import { barcodeSvg, qrSvg } from '@/lib/label'
import { getSession } from '@/lib/session'
import { can } from '@/lib/perm'
import { getStore } from '@/lib/store'

/** 자산 라벨 일괄 인쇄 — 대장에서 다중 선택한 자산들의 QR·바코드 라벨을 한 장의 인쇄용 시트로 반환한다.
 *  라벨 재출력은 자산 운영 업무이므로 사용자(USER)는 제외(대장 편집 권한과 동일 게이트).
 *  단건은 /api/label/[assetNo], 선택 여러 건 재발행은 이 경로(선택 라벨 일괄 인쇄). */
export async function GET(req: Request) {
  const session = await getSession()
  // 미로그인(401)과 권한 밖(403)을 나눈다 — 신원이 없으면 감사에 남길 수행자가 없고, 호출자도 '로그인하면 되는지'를 구분해야 한다
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (session.role === 'USER') return forbidden(session.name, '권한 밖 문서 발급 시도 — 자산 라벨 일괄', '/api/labels')
  // 매트릭스 '조회'도 만족해야 한다 — 화면(requireView)은 매트릭스를 보는데 문서 API 가 역할만 보면,
  //  조회 권한을 회수한 뒤에도 인쇄 문서로 같은 데이터가 그대로 나간다(화면은 막혔는데 API 는 열린 상태).
  if (!can('자산 대장', '조회', session.role)) return forbidden(session.name, '권한 밖 문서 발급 시도 — 자산 라벨 일괄', '/api/labels')

  const nos = (new URL(req.url).searchParams.get('nos') ?? '').split(',').map((v) => v.trim()).filter(Boolean)
  if (nos.length === 0) return new Response('자산번호(nos)를 지정하세요.', { status: 400 })

  const s = getStore()
  const found = nos.map((no) => s.assets.find((a) => a.assetNo === no)).filter((a): a is NonNullable<typeof a> => Boolean(a))
  if (found.length === 0) return new Response('Not Found', { status: 404 })

  const cards = await Promise.all(found.map(async (a) => {
    const qr = await qrSvg(a.assetNo, 100)
    const barcode = barcodeSvg(a.assetNo, 260, 44)
    return `<div class="label">
      <div class="qr">${qr}</div>
      <div style="flex:1;min-width:0">
        <div class="brand">SEEKERSLAB · IT ASSET</div>
        <div class="no">${esc(a.assetNo)}</div>
        <div class="model">${esc(a.model)}</div>
        <div class="meta">${esc(a.category)} · ${esc(a.dept)}</div>
        <div class="bc">${barcode}</div>
      </div>
    </div>`
  }))

  appendAudit({ actor: session.name, action: `자산 라벨 일괄 인쇄 (${found.length}건)`, target: '자산 대장' })

  const toolbar = await printToolbar(`자산 라벨 일괄 인쇄 — ${found.length}건${found.length < nos.length ? ` (요청 ${nos.length}건 중 ${found.length}건 확인)` : ''}`)
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>자산 라벨 일괄 인쇄 (${found.length}건)</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; background: #f4f5f7; color: #14161a; }
  .toolbar { padding: 12px 16px; display: flex; gap: 10px; align-items: center; position: sticky; top: 0; background: #f4f5f7; border-bottom: 1px solid #dfe3ea; }
  .toolbar button { font: inherit; padding: 6px 14px; border: 1px solid #c3c8d0; background: #fff; border-radius: 6px; cursor: pointer; }
  .toolbar button.pri { background: #1f6feb; color: #fff; border-color: #1f6feb; }
  .toolbar .cap { font-size: 12px; color: #5b6470; }
  .sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; padding: 20px; }
  .label { border: 1px solid #14161a; border-radius: 8px; padding: 12px; background: #fff; display: flex; gap: 12px; align-items: center; }
  .label .qr { width: 84px; height: 84px; flex: none; }
  .label .qr svg { width: 100%; height: 100%; }
  .brand { font-size: 9px; letter-spacing: .08em; color: #5b6470; font-weight: 700; }
  .no { font-family: ui-monospace, "SFMono-Regular", Consolas, monospace; font-size: 16px; font-weight: 800; color: #0b3d91; margin: 2px 0; }
  .model, .meta { font-size: 11px; color: #3a4150; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bc { margin-top: 5px; }
  .bc svg { width: 100%; height: 36px; }
  @media print {
    .toolbar { display: none; }
    body { background: #fff; }
    .sheet { padding: 0; gap: 8px; }
    .label { border-color: #000; page-break-inside: avoid; }
    @page { margin: 8mm; }
  }
</style></head>
<body>
  ${toolbar}
  <div class="sheet">${cards.join('')}</div>
</body></html>`

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
