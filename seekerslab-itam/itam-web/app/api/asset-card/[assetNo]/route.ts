import { assetDependencies } from '@/lib/cmdb'
import { acquisitionCostOf, assetTco, bookValueOf, depreciationPct, repairTotalOf } from '@/lib/cost'
import { today, warrantyState } from '@/lib/dates'
import { qrSvg } from '@/lib/label'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'

/** 자산 카드 — 선택 자산의 전체 프로필(사양·소유·보증·계약)과 변경 이력 타임라인을 한 장의 인쇄용 문서로.
 *  자산 인수인계·감사 대응 자료(자산 dossier)용. 라벨(작은 스티커)과 달리 전체 정보를 담는다.
 *  사용자(USER)는 본인 보유 자산만 — 대장 데이터 스코핑과 동일. */
export async function GET(_req: Request, { params }: { params: Promise<{ assetNo: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { assetNo } = await params
  const a = getStore().assets.find((x) => x.assetNo === assetNo)
  if (!a) return new Response('Not Found', { status: 404 })
  if (session.role === 'USER' && a.owner !== session.name) return new Response('Forbidden', { status: 403 })

  const qr = await qrSvg(a.assetNo, 120)
  // CMDB 의존 관계 — 상위 의존·영향 범위(blast radius)·저하 상위. 이 자산 장애 시 무엇이 영향받는지 dossier 에 남긴다.
  const deps = assetDependencies(a.assetNo)
  const asById = new Map(getStore().assets.map((x) => [x.assetNo, x]))
  const nameOf = (no: string) => { const x = asById.get(no); return x ? `${no}(${x.model})` : no }
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
  const row = (k: string, v?: string) => (v && v !== '-') ? `<div class="f"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : ''
  const fields = [
    row('유형', a.category), row('시리얼', a.serial), row('상태', a.status),
    row('업무 중요도', a.criticality ?? '일반'),
    row('소유자', a.owner), row('부서', a.dept), row('위치', a.location),
    row('OS', a.os), row('CPU', a.cpu), row('메모리', a.memory),
    row('IP', a.ip), row('MAC', a.mac),
    row('도입일', a.purchaseDate),
    row('보증 만료', a.warrantyEnd === '-' ? undefined : `${a.warrantyEnd}${({ covered: ' · 보증 내', soon: ' · 만료 임박', expired: ' · 보증 만료', none: '' })[warrantyState(a.warrantyEnd, today())]}`),
    row('연계 계약', a.contractId), row('최초 발견 채널', a.discoveredVia),
    row('최근 실측', a.lastVerifiedAt), row('반환 기한', a.loanDueDate),
    row('정기 점검 예정', a.maintenanceDue && !['폐기완료', '폐기예정'].includes(a.status) ? a.maintenanceDue : undefined),
    row('수리 의뢰', a.repair ? `${a.repair.vendor}${a.repair.eta ? ` · 예상반환 ${a.repair.eta}` : ''}${a.repair.estCost ? ` · 견적 ${a.repair.estCost.toLocaleString()}원` : ''}` : undefined),
    row('누적 수리비', repairTotalOf(a) > 0 ? `${repairTotalOf(a).toLocaleString()}원 (${a.repairCosts!.filter((c) => !c.warrantyClaimed).length}건 · 자사 부담)` : undefined),
    row('취득가', acquisitionCostOf(a) > 0 ? `${acquisitionCostOf(a).toLocaleString()}원${a.acquisitionCost === undefined ? ' (표준 단가)' : ''}` : undefined),
    row('TCO(취득+수리)', acquisitionCostOf(a) > 0 ? `${assetTco(a).toLocaleString()}원` : undefined),
    row('잔존가치(장부가)', acquisitionCostOf(a) > 0 ? `${bookValueOf(a, today()).toLocaleString()}원 · 정액법 상각 ${depreciationPct(a, today())}%` : undefined),
    row('상위 의존 (CMDB)', deps.upstream.length ? deps.upstream.map(nameOf).join(', ') : undefined),
    row('영향 범위 (blast radius)', deps.blastRadius.length ? `${deps.blastRadius.length}대 — ${deps.blastRadius.map(nameOf).join(', ')}` : undefined),
    row('⚠ 저하된 상위', deps.degradedUpstream.length ? `${deps.degradedUpstream.map(nameOf).join(', ')} — 상위 장애·이탈로 이 자산 위험` : undefined),
  ].filter(Boolean).join('')
  const timeline = [...a.history].reverse().map((h) =>
    `<tr><td class="d">${esc(h.date)}</td><td class="k">${esc(h.kind)}</td><td>${esc(h.detail)}</td><td class="ac">${esc(h.actor)}</td></tr>`,
  ).join('')
  // 배정 라이선스 좌석 — 이 자산에 배정된 SW 라이선스(로56·57). 인수인계·감사 dossier 에 어떤 SW 를 물고 있는지 남긴다(회수·재배정 대상).
  const seats = getStore().licenses
    .filter((l) => l.status !== '해지')
    .flatMap((l) => (l.seats ?? []).filter((st) => st.assetNo === a.assetNo).map((st) => ({ lic: l.name, vendor: l.vendor, at: st.at })))
  const seatsRows = seats.map((st) => `<tr><td>${esc(st.lic)}</td><td>${esc(st.vendor)}</td><td class="d">${esc(st.at)}</td></tr>`).join('')

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>자산 카드 ${esc(a.assetNo)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; background: #f4f5f7; color: #14161a; }
  .toolbar { padding: 12px 16px; display: flex; gap: 10px; align-items: center; position: sticky; top: 0; background: #f4f5f7; border-bottom: 1px solid #dfe3ea; }
  .toolbar button { font: inherit; padding: 6px 14px; border: 1px solid #c3c8d0; background: #fff; border-radius: 6px; cursor: pointer; }
  .toolbar button.pri { background: #1f6feb; color: #fff; border-color: #1f6feb; }
  .toolbar .cap { font-size: 12px; color: #5b6470; }
  .sheet { max-width: 820px; margin: 20px auto; background: #fff; border: 1px solid #dfe3ea; border-radius: 10px; padding: 24px 28px; }
  .hd { display: flex; gap: 18px; align-items: center; border-bottom: 2px solid #14161a; padding-bottom: 16px; margin-bottom: 18px; }
  .hd .qr { width: 96px; height: 96px; flex: none; }
  .hd .qr svg { width: 100%; height: 100%; }
  .brand { font-size: 10px; letter-spacing: .12em; color: #5b6470; font-weight: 700; }
  .no { font-family: ui-monospace, Consolas, monospace; font-size: 22px; font-weight: 800; color: #0b3d91; margin: 3px 0; }
  .model { font-size: 15px; font-weight: 600; }
  .badge { display: inline-block; margin-top: 4px; font-size: 11px; padding: 2px 9px; border-radius: 10px; background: #eef2f8; color: #3a4150; }
  .kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px 24px; margin: 0 0 18px; }
  .f { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #eef1f5; font-size: 13px; }
  .f dt { color: #5b6470; margin: 0; }
  .f dd { margin: 0; font-weight: 600; text-align: right; }
  h2 { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #5b6470; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eef1f5; vertical-align: top; }
  th { color: #5b6470; font-weight: 600; border-bottom: 1px solid #c3c8d0; }
  td.d, td.ac { white-space: nowrap; color: #5b6470; }
  td.k { font-weight: 600; white-space: nowrap; }
  .foot { margin-top: 18px; font-size: 10.5px; color: #8494ac; }
  @media print { .toolbar { display: none; } body { background: #fff; } .sheet { border: 0; margin: 0; max-width: none; } @page { margin: 12mm; } }
</style></head>
<body>
  <div class="toolbar">
    <button class="pri" onclick="window.print()">인쇄</button>
    <button onclick="window.close()">닫기</button>
    <span class="cap">자산 카드 — ${esc(a.assetNo)}</span>
  </div>
  <div class="sheet">
    <div class="hd">
      <div class="qr">${qr}</div>
      <div>
        <div class="brand">SEEKERSLAB · IT ASSET DOSSIER</div>
        <div class="no">${esc(a.assetNo)}</div>
        <div class="model">${esc(a.model)}</div>
        <span class="badge">${esc(a.category)} · ${esc(a.status)}</span>
      </div>
    </div>
    <div class="kv">${fields}</div>
    ${seats.length ? `<h2>배정 라이선스 좌석 (${seats.length}석)</h2>
    <table>
      <thead><tr><th>라이선스</th><th>공급사</th><th>배정일</th></tr></thead>
      <tbody>${seatsRows}</tbody>
    </table>` : ''}
    <h2>변경 이력 (${a.history.length}건)</h2>
    <table>
      <thead><tr><th>일시</th><th>구분</th><th>내용</th><th>수행자</th></tr></thead>
      <tbody>${timeline || '<tr><td colspan="4">이력이 없습니다.</td></tr>'}</tbody>
    </table>
    <div class="foot">발급: SEEKERSLAB ITAM — AI 자산관리 플랫폼 · 발급자 ${esc(session.name)}</div>
  </div>
</body></html>`

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
