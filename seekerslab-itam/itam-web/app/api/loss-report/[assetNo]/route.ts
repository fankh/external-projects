import { acquisitionCostOf, bookValueOf } from '@/lib/cost'
import { today } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'

/** 분실·도난 신고서 — 분실 상태 자산의 사건 개요·최종 보유·정황·자산 가액을 한 장의 인쇄용 문서로.
 *  보험 청구·보안 사고 대응·감사 증적용(경찰 신고 첨부 포함). 분실 루프(로30)의 문서 산출물. 자산담당·Admin.
 *  분실 상태가 아닌 자산은 대상이 아니다(400) — 신고서는 실제 분실·도난 건에만 발급한다. */
export async function GET(_req: Request, { params }: { params: Promise<{ assetNo: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (!['ASSET_MGR', 'ADMIN'].includes(session.role)) return new Response('Forbidden', { status: 403 })

  const { assetNo } = await params
  const a = getStore().assets.find((x) => x.assetNo === assetNo)
  if (!a) return new Response('Not Found', { status: 404 })
  if (a.status !== '분실') return new Response('분실·도난 신고된 자산이 아닙니다.', { status: 400 })

  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
  // 분실 신고 이력에서 유형·정황·신고자·신고일을 추출한다(reportLostStolen 이 기록한 '{유형} 신고 — {정황} (최종 보유 …)').
  const lossEv = [...a.history].reverse().find((h) => h.kind === '분실')
  const detail = lossEv?.detail ?? ''
  const type = detail.startsWith('도난') ? '도난' : '분실'
  const circumstance = detail.replace(/^(분실|도난) 신고 — /, '').replace(/ \(최종 보유 [^)]*\)$/, '') || '-'
  const holder = a.owner && a.owner !== '미지정' && a.owner !== '-' ? `${a.owner} · ${a.dept}` : a.dept
  const t = today()
  const book = acquisitionCostOf(a) > 0 ? bookValueOf(a, t).toLocaleString() : '-'
  const acq = acquisitionCostOf(a) > 0 ? acquisitionCostOf(a).toLocaleString() : '-'

  const row = (k: string, v?: string) => (v && v !== '-') ? `<div class="f"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : `<div class="f"><dt>${k}</dt><dd class="dim">-</dd></div>`

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>분실·도난 신고서 — ${esc(a.assetNo)}</title>
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
  .no { font-family: ui-monospace, Consolas, monospace; font-size: 18px; font-weight: 800; color: #b42318; margin: 3px 0; }
  .nm { font-size: 16px; font-weight: 600; }
  .badge { display: inline-block; margin-top: 6px; font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 12px; background: #fdecec; color: #b42318; }
  .kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px 24px; margin: 16px 0 8px; }
  .f { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #eef1f5; font-size: 13px; }
  .f dt { color: #5b6470; margin: 0; } .f dd { margin: 0; font-weight: 600; text-align: right; } .f dd.dim { color: #8494ac; font-weight: 400; }
  h2 { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #5b6470; margin: 18px 0 8px; }
  .circ { font-size: 14px; padding: 10px 12px; background: #f6f8fb; border-radius: 6px; line-height: 1.7; }
  .note { margin-top: 12px; font-size: 11.5px; color: #5b6470; }
  .sign { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; font-size: 12px; }
  .sign div { border-top: 1px solid #c3c8d0; padding-top: 6px; color: #5b6470; }
  .foot { margin-top: 16px; font-size: 10.5px; color: #8494ac; display: flex; justify-content: space-between; }
  @media print { .toolbar { display: none; } body { background: #fff; } .sheet { border: 0; margin: 0; max-width: none; } @page { margin: 12mm; } }
</style></head>
<body>
  <div class="toolbar">
    <button class="pri" onclick="window.print()">인쇄</button>
    <button onclick="window.close()">닫기</button>
    <span class="cap">분실·도난 신고서 — ${esc(a.assetNo)}</span>
  </div>
  <div class="sheet">
    <div class="hd">
      <div class="brand">SEEKERSLAB · LOSS / THEFT INCIDENT REPORT</div>
      <div class="no">${esc(a.assetNo)}</div>
      <div class="nm">${esc(a.model)}</div>
      <div><span class="badge">${type} 신고</span></div>
    </div>
    <h2>자산 정보</h2>
    <div class="kv">
      ${row('유형', a.category)}${row('시리얼', a.serial)}
      ${row('취득가', acq === '-' ? undefined : `${acq}원`)}${row('잔존가치(장부가)', book === '-' ? undefined : `${book}원`)}
      ${row('취득일', a.purchaseDate)}${row('OS', a.os)}
    </div>
    <h2>사건 개요</h2>
    <div class="kv">
      ${row('신고 유형', `${type}`)}${row('신고일', lossEv?.date)}
      ${row('최종 보유', holder)}${row('최종 위치', a.location)}
      ${row('신고자', lossEv?.actor)}${row('발급일', t)}
    </div>
    <h2>정황</h2>
    <div class="circ">${esc(circumstance)}</div>
    ${type === '도난' ? '<div class="note"><b>보안 조치.</b> 도난은 단말 내 데이터 유출 위험이 있어 신고 즉시 보안운영팀에 데이터 유출 위험 점검을 통보했습니다(위협 대응 이력 적재). 필요 시 본 신고서를 경찰 신고·보험 청구에 첨부하십시오.</div>' : '<div class="note">실물을 되찾으면 회수(유휴 풀 복귀), 미회수 확정 시 폐기 절차로 처리합니다. 필요 시 본 신고서를 보험 청구·감사 증적에 첨부하십시오.</div>'}
    <div class="sign"><div>신고자 확인 (자산담당)</div><div>승인 (부서장/보안)</div></div>
    <div class="foot"><span>발급: SEEKERSLAB ITAM · 발급자 ${esc(session.name)}</span><span>${t}</span></div>
  </div>
</body></html>`

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
