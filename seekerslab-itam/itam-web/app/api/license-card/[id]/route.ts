import { daysUntil, fmtAmount } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'

/** 라이선스 컴플라이언스 카드 — SW 라이선스의 보유·사용 대사, 판정, 비용 노출을 한 장의 인쇄용 문서로.
 *  SAM(소프트웨어 자산관리) 감사 대응용. 라이선스는 계약 화면(자산담당·Admin) 소관이므로 그 외 권한그룹은 차단한다. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (!['ASSET_MGR', 'ADMIN'].includes(session.role)) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const l = getStore().licenses.find((x) => x.id === id)
  if (!l) return new Response('Not Found', { status: 404 })

  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
  const gap = l.used - l.purchased
  const over = gap > 0
  const low = l.used / l.purchased < 0.6
  const verdict = over ? '초과 사용 (감사 리스크)' : low ? '미사용 보유 (비용 낭비)' : '적정'
  const verdictClass = over ? 'err' : low ? 'warn' : 'ok'
  const exposure = over
    ? `추가 구매 필요 ${gap}석 · 노출액 ${fmtAmount(gap * l.unitCost)}원`
    : low
      ? `회수 가능 ${l.purchased - l.used}석 · 절감액 ${fmtAmount((l.purchased - l.used) * l.unitCost)}원`
      : '조치 불필요'
  const d = daysUntil(l.expiry)
  const dLabel = l.expiry === '-' ? '-' : d === null ? '-' : d < 0 ? `만료 경과 ${-d}일` : `D-${d}`
  const row = (k: string, v: string) => `<div class="f"><dt>${k}</dt><dd>${esc(v)}</dd></div>`

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>라이선스 카드 ${esc(l.id)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; background: #f4f5f7; color: #14161a; }
  .toolbar { padding: 12px 16px; display: flex; gap: 10px; align-items: center; position: sticky; top: 0; background: #f4f5f7; border-bottom: 1px solid #dfe3ea; }
  .toolbar button { font: inherit; padding: 6px 14px; border: 1px solid #c3c8d0; background: #fff; border-radius: 6px; cursor: pointer; }
  .toolbar button.pri { background: #1f6feb; color: #fff; border-color: #1f6feb; }
  .toolbar .cap { font-size: 12px; color: #5b6470; }
  .sheet { max-width: 720px; margin: 20px auto; background: #fff; border: 1px solid #dfe3ea; border-radius: 10px; padding: 24px 28px; }
  .hd { border-bottom: 2px solid #14161a; padding-bottom: 14px; margin-bottom: 16px; }
  .brand { font-size: 10px; letter-spacing: .12em; color: #5b6470; font-weight: 700; }
  .no { font-family: ui-monospace, Consolas, monospace; font-size: 18px; font-weight: 800; color: #0b3d91; margin: 3px 0; }
  .nm { font-size: 16px; font-weight: 600; }
  .verdict { display: inline-block; margin-top: 6px; font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 12px; }
  .verdict.err { background: #fdecec; color: #b42318; } .verdict.warn { background: #fef6e7; color: #92610a; } .verdict.ok { background: #e9f6ec; color: #1a7f37; }
  .kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px 24px; margin: 16px 0 8px; }
  .f { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #eef1f5; font-size: 13px; }
  .f dt { color: #5b6470; margin: 0; } .f dd { margin: 0; font-weight: 600; text-align: right; }
  h2 { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #5b6470; margin: 18px 0 8px; }
  .exp { font-size: 14px; padding: 10px 12px; background: #f6f8fb; border-radius: 6px; font-weight: 600; }
  .foot { margin-top: 18px; font-size: 10.5px; color: #8494ac; }
  @media print { .toolbar { display: none; } body { background: #fff; } .sheet { border: 0; margin: 0; max-width: none; } @page { margin: 12mm; } }
</style></head>
<body>
  <div class="toolbar">
    <button class="pri" onclick="window.print()">인쇄</button>
    <button onclick="window.close()">닫기</button>
    <span class="cap">라이선스 컴플라이언스 카드 — ${esc(l.id)}</span>
  </div>
  <div class="sheet">
    <div class="hd">
      <div class="brand">SEEKERSLAB · SW LICENSE COMPLIANCE</div>
      <div class="no">${esc(l.id)}</div>
      <div class="nm">${esc(l.name)}</div>
      <div><span class="verdict ${verdictClass}">${esc(verdict)}</span></div>
    </div>
    <div class="kv">
      ${row('공급사', l.vendor)}${row('만료일', `${l.expiry} (${dLabel})`)}
      ${row('보유(구매)', `${l.purchased}석`)}${row('사용', `${l.used}석`)}
      ${row('차이(사용−보유)', `${gap > 0 ? '+' : ''}${gap}석`)}${row('단가', `${fmtAmount(l.unitCost)}원`)}
    </div>
    <h2>비용 노출 · 조치</h2>
    <div class="exp">${esc(exposure)}</div>
    <div class="foot">발급: SEEKERSLAB ITAM — AI 자산관리 플랫폼 · 발급자 ${esc(session.name)} · 컴플라이언스 STEP 3(보유–사용 대사)</div>
  </div>
</body></html>`

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
