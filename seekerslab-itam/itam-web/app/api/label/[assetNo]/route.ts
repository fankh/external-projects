import { barcodeSvg, qrSvg } from '@/lib/label'
import { getSession } from '@/lib/session'
import { can } from '@/lib/perm'
import { getStore } from '@/lib/store'

/** 자산 라벨 인쇄 — 대장에서 선택한 자산의 QR·바코드 라벨을 인쇄용 HTML로 반환한다.
 *  라벨은 재물조사 스캔 실사에 쓰이므로 손상·분실 시 재발행이 필요하다(입고 시점 외 재출력 공백 해소).
 *  라벨 발행은 자산 운영 업무이므로 사용자(USER)는 제외한다 — 대장 편집 권한(canEdit)과 동일 게이트. */
export async function GET(_req: Request, { params }: { params: Promise<{ assetNo: string }> }) {
  const session = await getSession()
  // 인증 안 됨(401)과 권한 없음(403)을 가른다 — 형제 문서 API 여섯(자산 카드·검수 확인서·인수인계서·분실 신고서·
  //  퇴사 정리표·라이선스 카드)은 이미 나누는데 이 셋만 미로그인을 403 으로 뭉뚱그려, 호출자가 '로그인하라'와
  //  '너는 안 된다'를 구분할 수 없었다.
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (session.role === 'USER') return new Response('Forbidden', { status: 403 })
  // 매트릭스 '조회'도 만족해야 한다 — 화면(requireView)은 매트릭스를 보는데 문서 API 가 역할만 보면,
  //  조회 권한을 회수한 뒤에도 인쇄 문서로 같은 데이터가 그대로 나간다(화면은 막혔는데 API 는 열린 상태).
  if (!can('자산 대장', '조회', session.role)) return new Response('Forbidden', { status: 403 })

  const { assetNo } = await params
  const a = getStore().assets.find((x) => x.assetNo === assetNo)
  if (!a) return new Response('Not Found', { status: 404 })

  const qr = await qrSvg(a.assetNo, 132)
  const barcode = barcodeSvg(a.assetNo, 300, 52)
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>자산 라벨 ${esc(a.assetNo)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; background: #f4f5f7; color: #14161a; }
  .toolbar { padding: 12px 16px; display: flex; gap: 10px; align-items: center; }
  .toolbar button { font: inherit; padding: 6px 14px; border: 1px solid #c3c8d0; background: #fff; border-radius: 6px; cursor: pointer; }
  .toolbar button.pri { background: #1f6feb; color: #fff; border-color: #1f6feb; }
  .toolbar .cap { font-size: 12px; color: #5b6470; }
  .sheet { display: flex; justify-content: center; padding: 24px; }
  .label { width: 340px; border: 1px solid #14161a; border-radius: 8px; padding: 14px; background: #fff; display: flex; gap: 14px; align-items: center; }
  .label .qr { width: 100px; height: 100px; flex: none; }
  .label .qr svg { width: 100%; height: 100%; }
  .brand { font-size: 10px; letter-spacing: .08em; color: #5b6470; font-weight: 700; }
  .no { font-family: ui-monospace, "SFMono-Regular", Consolas, monospace; font-size: 18px; font-weight: 800; color: #0b3d91; margin: 2px 0; }
  .model, .meta { font-size: 11.5px; color: #3a4150; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bc { margin-top: 6px; }
  .bc svg { width: 100%; height: 40px; }
  @media print {
    .toolbar { display: none; }
    body { background: #fff; }
    .sheet { padding: 0; }
    .label { border-color: #000; page-break-inside: avoid; }
    @page { margin: 8mm; }
  }
</style></head>
<body>
  <div class="toolbar">
    <button class="pri" onclick="window.print()">인쇄</button>
    <button onclick="window.close()">닫기</button>
    <span class="cap">자산 라벨 재발행 — ${esc(a.assetNo)}</span>
  </div>
  <div class="sheet">
    <div class="label">
      <div class="qr">${qr}</div>
      <div style="flex:1;min-width:0">
        <div class="brand">SEEKERSLAB · IT ASSET</div>
        <div class="no">${esc(a.assetNo)}</div>
        <div class="model">${esc(a.model)}</div>
        <div class="meta">${esc(a.category)} · ${esc(a.dept)}</div>
        <div class="bc">${barcode}</div>
      </div>
    </div>
  </div>
</body></html>`

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
