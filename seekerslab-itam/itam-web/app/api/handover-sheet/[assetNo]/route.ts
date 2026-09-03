import { printToolbar } from '@/lib/doc-toolbar'
import { escHtml as esc } from '@/lib/text'
import { forbidden } from '@/lib/audit'
import { getSession } from '@/lib/session'
import { can } from '@/lib/perm'
import { getStore } from '@/lib/store'
import { today } from '@/lib/dates'

/** 자산 인수인계서 — 영구 불출(지급)된 사용중 자산의 인수자·부서·불출일·자산 정보를 한 장의 인쇄용 인계·인수 확인서로.
 *  대여는 대여 확인서, 분실은 분실·도난 신고서가 있으나 주된 물리 인계인 영구 불출에는 서명 인수인계 문서가 없었다(체인 오브
 *  커스터디의 서면 증적 공백). 디지털 수령 확인(로54)과 별개로 현장 서명본을 남긴다. 자산담당·Admin.
 *  사용중(불출 완료) 자산만 대상(400) — 유휴·검수중·폐기 자산은 인계 대상이 아니다. */
export async function GET(_req: Request, { params }: { params: Promise<{ assetNo: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (!['ASSET_MGR', 'ADMIN'].includes(session.role)) return forbidden(session.name, '권한 밖 문서 발급 시도 — 인수인계 확인서', '/api/handover-sheet')
  // 매트릭스 '조회'도 만족해야 한다 — 화면(requireView)은 매트릭스를 보는데 문서 API 가 역할만 보면,
  //  조회 권한을 회수한 뒤에도 인쇄 문서로 같은 데이터가 그대로 나간다(화면은 막혔는데 API 는 열린 상태).
  if (!can('자산 대장', '조회', session.role)) return forbidden(session.name, '권한 밖 문서 발급 시도 — 인수인계 확인서', '/api/handover-sheet')

  const { assetNo } = await params
  const a = getStore().assets.find((x) => x.assetNo === assetNo)
  if (!a) return new Response('Not Found', { status: 404 })
  if (a.status !== '사용중') return new Response('사용중(불출 완료) 자산이 아닙니다.', { status: 400 })

  const issueEv = [...a.history].reverse().find((h) => h.kind === '불출')
  const t = today()
  const accepted = !a.receiptPending
  const row = (k: string, v?: string) => (v && v !== '-') ? `<div class="f"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : ''

  const toolbar = await printToolbar(`자산 인수인계서 — ${esc(a.assetNo)}`)
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>자산 인수인계서 — ${esc(a.assetNo)}</title>
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
  .st { display: inline-block; margin-top: 6px; font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 12px; background: ${accepted ? '#eaf7ee' : '#fff6e6'}; color: ${accepted ? '#1a7f37' : '#8a5a00'}; }
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
  ${toolbar}
  <div class="sheet">
    <div class="hd">
      <div class="brand">SEEKERSLAB · ASSET HANDOVER / ACCEPTANCE (자산 인수인계서)</div>
      <div class="no">${esc(a.assetNo)}</div>
      <div class="nm">${esc(a.model)}</div>
      <div><span class="st">${accepted ? '인수 확인 완료' : '인수 확인 대기'}</span></div>
    </div>
    <h2>인계·인수 정보</h2>
    <div class="kv">
      ${row('인수자', a.owner)}${row('부서', a.dept)}
      ${row('불출일', issueEv?.date)}${row('발급일', t)}
      ${row('유형', a.category)}${row('시리얼', a.serial)}
      ${row('배치 위치', a.location)}${row('운영체제', a.os)}
    </div>
    <h2>인계·인수 확인 사항</h2>
    <ul class="terms">
      <li>인수자는 위 자산의 실물을 정상 수령했음을 확인하며, 사용 기간 중 관리 책임을 집니다.</li>
      <li>파손·분실·도난 발생 시 즉시 자산관리팀에 통지하고, 무단 반출·양도하지 않습니다.</li>
      <li>부서 이동·퇴직 시 자산을 반납 또는 지정된 승계자에게 인계하며, 미반납 자산은 회수 대상으로 관리됩니다.</li>
      <li>설치 소프트웨어·데이터는 회사 정책에 따라 관리되며, 반납 시 데이터 소거 절차를 따릅니다.</li>
    </ul>
    <div class="sign"><div>불출 승인 (자산담당)</div><div>인수자 서명 (${esc(a.owner)})</div></div>
    <div class="foot"><span>발급: SEEKERSLAB ITAM · 발급자 ${esc(session.name)}</span><span>${t}</span></div>
  </div>
</body></html>`

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
