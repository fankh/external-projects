import { getSession } from '@/lib/session'
import { can } from '@/lib/perm'
import { getStore } from '@/lib/store'
import { daysUntil, today } from '@/lib/dates'

/** 대여 확인서 — 대여 중 자산의 대여자·반환 기한·자산 정보를 한 장의 인쇄용 확인서로. 실물 반출 책임·반환 의무를
 *  서면으로 남긴다(반환 지연·미반환 시 증적). 대여(로35·41)의 문서 산출물. 자산담당·Admin.
 *  대여 중이 아닌 자산은 대상이 아니다(400) — 확인서는 실제 대여 건에만 발급한다. */
export async function GET(_req: Request, { params }: { params: Promise<{ assetNo: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (!['ASSET_MGR', 'ADMIN'].includes(session.role)) return new Response('Forbidden', { status: 403 })
  // 매트릭스 '조회'도 만족해야 한다 — 화면(requireView)은 매트릭스를 보는데 문서 API 가 역할만 보면,
  //  조회 권한을 회수한 뒤에도 인쇄 문서로 같은 데이터가 그대로 나간다(화면은 막혔는데 API 는 열린 상태).
  if (!can('자산 대장', '조회', session.role)) return new Response('Forbidden', { status: 403 })

  const { assetNo } = await params
  const a = getStore().assets.find((x) => x.assetNo === assetNo)
  if (!a) return new Response('Not Found', { status: 404 })
  if (a.status !== '대여중') return new Response('대여 중인 자산이 아닙니다.', { status: 400 })

  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
  // 대여 시작 이벤트 — 연장 승인·반려·취소도 kind '대여'를 재사용하므로, 연장 이벤트를 건너뛰고(현 대여 회차의) 최초 대여 이벤트를 찾는다.
  // reverse().find('대여')만 쓰면 대여일이 최신 연장 조치일로 흘러 확인서에 잘못된 대여일이 찍힌다.
  const loanEv = [...a.history].reverse().find((h) => h.kind === '대여' && !h.detail.includes('연장'))
  const t = today()
  const due = a.loanDueDate ?? '-'
  const dday = a.loanDueDate ? daysUntil(a.loanDueDate) : null
  const ddayLabel = dday === null ? '' : dday < 0 ? ` (연체 ${-dday}일)` : dday === 0 ? ' (오늘 만기)' : ` (D-${dday})`
  const row = (k: string, v?: string) => (v && v !== '-') ? `<div class="f"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : ''

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>대여 확인서 — ${esc(a.assetNo)}</title>
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
  .due { display: inline-block; margin-top: 6px; font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 12px; background: ${dday !== null && dday < 0 ? '#fdecec' : '#eef6ff'}; color: ${dday !== null && dday < 0 ? '#b42318' : '#0b3d91'}; }
  .kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px 24px; margin: 16px 0 8px; }
  .f { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #eef1f5; font-size: 13px; }
  .f dt { color: #5b6470; margin: 0; } .f dd { margin: 0; font-weight: 600; text-align: right; }
  h2 { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #5b6470; margin: 18px 0 8px; }
  .terms { font-size: 12.5px; line-height: 1.9; color: #3a4150; padding: 10px 14px; background: #f6f8fb; border-radius: 6px; }
  .terms li { margin: 0; }
  .sign { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; font-size: 12px; }
  .sign div { border-top: 1px solid #c3c8d0; padding-top: 6px; color: #5b6470; }
  .foot { margin-top: 16px; font-size: 10.5px; color: #8494ac; display: flex; justify-content: space-between; }
  @media print { .toolbar { display: none; } body { background: #fff; } .sheet { border: 0; margin: 0; max-width: none; } @page { margin: 12mm; } }
</style></head>
<body>
  <div class="toolbar">
    <button class="pri" onclick="window.print()">인쇄</button>
    <button onclick="window.close()">닫기</button>
    <span class="cap">대여 확인서 — ${esc(a.assetNo)}</span>
  </div>
  <div class="sheet">
    <div class="hd">
      <div class="brand">SEEKERSLAB · ASSET LOAN AGREEMENT (대여 확인서)</div>
      <div class="no">${esc(a.assetNo)}</div>
      <div class="nm">${esc(a.model)}</div>
      <div><span class="due">반환 기한 ${esc(due)}${ddayLabel}</span></div>
    </div>
    <h2>대여 정보</h2>
    <div class="kv">
      ${row('대여자', a.owner)}${row('부서', a.dept)}
      ${row('대여일', loanEv?.date)}${row('반환 기한', due)}
      ${row('유형', a.category)}${row('시리얼', a.serial)}
      ${row('대여 위치', a.location)}${row('발급일', t)}
    </div>
    <h2>대여 조건</h2>
    <ul class="terms">
      <li>본 자산은 <b>${esc(due)}</b>까지 반환합니다. 반환 기한 경과 시 연체로 관리되며 반환 독촉이 발송됩니다.</li>
      <li>대여자는 대여 기간 중 자산의 관리 책임을 지며, 파손·분실 시 즉시 자산관리팀에 통지합니다.</li>
      <li>반환 시 실물 상태 점검(정상·수리 필요·폐기 권고)을 거쳐 유휴 풀에 편성됩니다.</li>
    </ul>
    <div class="sign"><div>대여 승인 (자산담당)</div><div>대여자 서명 (${esc(a.owner)})</div></div>
    <div class="foot"><span>발급: SEEKERSLAB ITAM · 발급자 ${esc(session.name)}</span><span>${t}</span></div>
  </div>
</body></html>`

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
