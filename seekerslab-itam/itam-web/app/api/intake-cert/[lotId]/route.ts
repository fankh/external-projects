import { forbidden } from '@/lib/audit'
import { getSession } from '@/lib/session'
import { can } from '@/lib/perm'
import { getStore } from '@/lib/store'
import { today } from '@/lib/dates'

/** 검수 확인서 — 입고 검수를 마친 로트의 공급사·계약·수량·체크리스트 결과·판정·채번 자산을 한 장의 인쇄용 문서로.
 *  물품 인수·검수 증적(대금 지급·감사 대응). 도입·검수 로트(로3·27·43)의 문서 산출물. 자산담당·Admin.
 *  검수에 들어가지 않은 로트(도입 예정·입고 대기)는 대상이 아니다(400) — 확인서는 검수 이력이 있는 로트에만 발급. */
export async function GET(_req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (!['ASSET_MGR', 'ADMIN'].includes(session.role)) return forbidden(session.name, '권한 밖 문서 발급 시도 — 입고 검수 확인서', '/api/intake-cert')
  // 매트릭스 '조회'도 만족해야 한다 — 화면(requireView)은 매트릭스를 보는데 문서 API 가 역할만 보면,
  //  조회 권한을 회수한 뒤에도 인쇄 문서로 같은 데이터가 그대로 나간다(화면은 막혔는데 API 는 열린 상태).
  if (!can('수명주기', '조회', session.role)) return forbidden(session.name, '권한 밖 문서 발급 시도 — 입고 검수 확인서', '/api/intake-cert')

  const { lotId } = await params
  const s = getStore()
  const lot = s.intakeLots.find((l) => l.id === lotId)
  if (!lot) return new Response('Not Found', { status: 404 })
  if (!lot.inspector && lot.issued.length === 0) return new Response('검수 이력이 없는 로트입니다 (도입 예정·입고 대기).', { status: 400 })

  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
  const contract = s.contracts.find((c) => c.id === lot.contractId)
  const verdict = lot.status === '검수 반려' ? '검수 반려 (반품·재검수 대상)' : lot.status === '반품 완료' ? '반품 완료' : lot.issued.length > 0 ? '검수 완료 · 채번' : '검수 진행'
  const vClass = lot.status === '검수 반려' ? 'err' : lot.issued.length > 0 ? 'ok' : 'neutral'
  const passN = lot.checklist.filter((c) => c.checked).length
  const total = lot.unitCost ? (lot.unitCost * lot.qty).toLocaleString() : '-'
  const row = (k: string, v?: string) => (v && v !== '-') ? `<div class="f"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : ''
  const checkRows = lot.checklist.map((c) => `<tr><td class="ck">${c.checked ? '☑' : '☐'}</td><td>${esc(c.item)}</td><td class="dim">${esc(c.note ?? '')}</td></tr>`).join('')
  const issuedRows = lot.issued.length
    ? lot.issued.map((no) => `<span class="tag">${esc(no)}</span>`).join(' ')
    : '<span class="dim">채번 자산 없음</span>'

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>검수 확인서 — ${esc(lot.id)}</title>
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
  .verdict.err { background: #fdecec; color: #b42318; } .verdict.ok { background: #e9f6ec; color: #1a7f37; } .verdict.neutral { background: #eef1f5; color: #5b6470; }
  .kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px 24px; margin: 16px 0 8px; }
  .f { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #eef1f5; font-size: 13px; }
  .f dt { color: #5b6470; margin: 0; } .f dd { margin: 0; font-weight: 600; text-align: right; }
  h2 { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #5b6470; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #c3c8d0; color: #5b6470; font-weight: 600; }
  td { padding: 6px 8px; border-bottom: 1px solid #eef1f5; }
  td.ck { font-size: 15px; text-align: center; width: 26px; }
  .dim { color: #8494ac; }
  .tag { display: inline-block; font-family: ui-monospace, Consolas, monospace; font-size: 12px; font-weight: 600; background: #eef1f5; border-radius: 5px; padding: 2px 7px; margin: 1px 0; }
  .sign { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; font-size: 12px; }
  .sign div { border-top: 1px solid #c3c8d0; padding-top: 6px; color: #5b6470; }
  .foot { margin-top: 16px; font-size: 10.5px; color: #8494ac; display: flex; justify-content: space-between; }
  @media print { .toolbar { display: none; } body { background: #fff; } .sheet { border: 0; margin: 0; max-width: none; } @page { margin: 12mm; } }
</style></head>
<body>
  <div class="toolbar">
    <button class="pri" onclick="window.print()">인쇄</button>
    <button onclick="window.close()">닫기</button>
    <span class="cap">검수 확인서 — ${esc(lot.id)}</span>
  </div>
  <div class="sheet">
    <div class="hd">
      <div class="brand">SEEKERSLAB · GOODS ACCEPTANCE (검수 확인서)</div>
      <div class="no">${esc(lot.id)}</div>
      <div class="nm">${esc(lot.model)}</div>
      <div><span class="verdict ${vClass}">${esc(verdict)}</span></div>
    </div>
    <h2>입고 · 계약</h2>
    <div class="kv">
      ${row('공급사', lot.vendor)}${row('근거 계약', contract ? `${lot.contractId} · ${contract.name}` : lot.contractId)}
      ${row('유형', lot.category)}${row('수량', `${lot.qty}대`)}
      ${row('입고일', lot.arrivedAt)}${row('검수자', lot.inspector)}
      ${row('SR·발주', lot.srNo)}${row('단가', lot.unitCost ? `${lot.unitCost.toLocaleString()}원` : undefined)}
      ${row('금액(단가×수량)', total === '-' ? undefined : `${total}원`)}${row('발급일', today())}
    </div>
    <h2>검수 체크리스트 (통과 ${passN}/${lot.checklist.length})</h2>
    <table><thead><tr><th></th><th>항목</th><th>비고</th></tr></thead><tbody>${checkRows || '<tr><td></td><td colspan="2" class="dim">체크리스트 없음</td></tr>'}</tbody></table>
    <h2>채번 자산 (${lot.issued.length}대)</h2>
    <div style="font-size:12px;line-height:2">${issuedRows}</div>
    <div class="sign"><div>검수 확인 (자산담당)</div><div>공급사 인수 확인</div></div>
    <div class="foot"><span>발급: SEEKERSLAB ITAM · 발급자 ${esc(session.name)}</span><span>${today()}</span></div>
  </div>
</body></html>`

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
