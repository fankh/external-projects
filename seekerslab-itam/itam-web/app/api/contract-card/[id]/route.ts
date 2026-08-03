import { daysUntil, fmtAmount } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'

/** 계약 카드 — 계약의 전체 요약(기본 정보·부속서류·SLA·비용 이력·연계 자산)을 한 장의 인쇄용 문서로.
 *  계약 갱신 검토·감사 대응 자료(계약 dossier)용. 계약은 자산담당·Admin 업무이므로 그 외 권한그룹은 차단한다. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (!['ASSET_MGR', 'ADMIN'].includes(session.role)) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const s = getStore()
  const c = s.contracts.find((x) => x.id === id)
  if (!c) return new Response('Not Found', { status: 404 })

  const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string)
  const d = daysUntil(c.end)
  const dLabel = c.status === '해지' ? `해지 (${c.terminatedAt ?? '-'})` : d === null ? '-' : d < 0 ? `만료 경과 ${-d}일` : `D-${d}`
  const linked = s.assets.filter((a) => a.contractId === c.id)
  const row = (k: string, v: string) => `<div class="f"><dt>${k}</dt><dd>${esc(v)}</dd></div>`

  const docsHtml = (c.documents ?? []).length
    ? `<table><thead><tr><th>유형</th><th>문서명</th><th>등록</th></tr></thead><tbody>${c.documents!.map((doc) => `<tr><td class="k">${esc(doc.docType)}</td><td>${esc(doc.name)}</td><td class="d">${esc(doc.addedBy)} · ${esc(doc.addedAt)}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">등록된 부속서류가 없습니다.</div>'

  const maintHtml = c.kind === '유지보수' ? `
    <h2>SLA</h2><div class="sla">${c.sla ? esc(c.sla) : '<span class="empty">미설정</span>'}</div>
    <h2>비용 이력${(c.costs ?? []).length ? ` · 누계 ${fmtAmount((c.costs ?? []).reduce((n, x) => n + x.amount, 0))}원` : ''}</h2>
    ${(c.costs ?? []).length
      ? `<table><thead><tr><th>일자</th><th>항목</th><th class="r">금액</th></tr></thead><tbody>${[...c.costs!].sort((x, y) => y.date.localeCompare(x.date)).map((ct) => `<tr><td class="d">${esc(ct.date)}</td><td>${esc(ct.item)}</td><td class="r">${ct.amount.toLocaleString()}원</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">등록된 비용 이력이 없습니다.</div>'}` : ''

  const renewalsHtml = (c.renewals ?? []).length
    ? `<h2>갱신 이력 (${c.renewals!.length}회)</h2><table><thead><tr><th>갱신일</th><th>기간</th><th>만료일 변경</th><th>처리자</th></tr></thead><tbody>${[...c.renewals!].reverse().map((rn) => `<tr><td class="d">${esc(rn.date)}</td><td class="k">${rn.termYears}년</td><td>${esc(rn.from)} → ${esc(rn.to)}</td><td class="d">${esc(rn.by)}</td></tr>`).join('')}</tbody></table>`
    : ''

  const assetsHtml = linked.length
    ? `<table><thead><tr><th>자산번호</th><th>모델</th><th>상태</th><th>소유/부서</th></tr></thead><tbody>${linked.slice(0, 200).map((a) => `<tr><td class="k">${esc(a.assetNo)}</td><td>${esc(a.model)}</td><td>${esc(a.status)}</td><td class="d">${esc(a.owner)} · ${esc(a.dept)}</td></tr>`).join('')}</tbody></table>${linked.length > 200 ? `<div class="empty">외 ${linked.length - 200}건</div>` : ''}`
    : '<div class="empty">연계된 자산이 없습니다.</div>'

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>계약 카드 ${esc(c.id)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; background: #f4f5f7; color: #14161a; }
  .toolbar { padding: 12px 16px; display: flex; gap: 10px; align-items: center; position: sticky; top: 0; background: #f4f5f7; border-bottom: 1px solid #dfe3ea; }
  .toolbar button { font: inherit; padding: 6px 14px; border: 1px solid #c3c8d0; background: #fff; border-radius: 6px; cursor: pointer; }
  .toolbar button.pri { background: #1f6feb; color: #fff; border-color: #1f6feb; }
  .toolbar .cap { font-size: 12px; color: #5b6470; }
  .sheet { max-width: 820px; margin: 20px auto; background: #fff; border: 1px solid #dfe3ea; border-radius: 10px; padding: 24px 28px; }
  .hd { border-bottom: 2px solid #14161a; padding-bottom: 14px; margin-bottom: 16px; }
  .brand { font-size: 10px; letter-spacing: .12em; color: #5b6470; font-weight: 700; }
  .no { font-family: ui-monospace, Consolas, monospace; font-size: 20px; font-weight: 800; color: #0b3d91; margin: 3px 0; }
  .nm { font-size: 16px; font-weight: 600; }
  .badge { display: inline-block; margin-top: 5px; font-size: 11px; padding: 2px 9px; border-radius: 10px; background: #eef2f8; color: #3a4150; }
  .kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px 24px; margin: 0 0 8px; }
  .f { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #eef1f5; font-size: 13px; }
  .f dt { color: #5b6470; margin: 0; } .f dd { margin: 0; font-weight: 600; text-align: right; }
  h2 { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #5b6470; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eef1f5; vertical-align: top; }
  th { color: #5b6470; font-weight: 600; border-bottom: 1px solid #c3c8d0; }
  td.d { white-space: nowrap; color: #5b6470; } td.k { font-weight: 600; white-space: nowrap; }
  th.r, td.r { text-align: right; white-space: nowrap; }
  .sla { font-size: 13px; padding: 8px 10px; background: #f6f8fb; border-radius: 6px; }
  .empty { font-size: 12px; color: #8494ac; padding: 6px 0; }
  .foot { margin-top: 18px; font-size: 10.5px; color: #8494ac; }
  @media print { .toolbar { display: none; } body { background: #fff; } .sheet { border: 0; margin: 0; max-width: none; } @page { margin: 12mm; } }
</style></head>
<body>
  <div class="toolbar">
    <button class="pri" onclick="window.print()">인쇄</button>
    <button onclick="window.close()">닫기</button>
    <span class="cap">계약 카드 — ${esc(c.id)}</span>
  </div>
  <div class="sheet">
    <div class="hd">
      <div class="brand">SEEKERSLAB · CONTRACT DOSSIER</div>
      <div class="no">${esc(c.id)}</div>
      <div class="nm">${esc(c.name)}</div>
      <span class="badge">${esc(c.kind)} · ${esc(c.status ?? '유효')} · ${esc(dLabel)}</span>
    </div>
    <div class="kv">
      ${row('공급사', c.vendor)}${row('주관부서', c.ownerDept)}
      ${row('계약 금액', `${fmtAmount(c.amount)}원`)}${row('연계 자산', `${linked.length}건`)}
      ${row('시작일', c.start)}${row('만료일', c.end)}
    </div>
    <h2>부속서류 (${(c.documents ?? []).length}건)</h2>${docsHtml}
    ${maintHtml}
    ${renewalsHtml}
    <h2>연계 자산 (${linked.length}건)</h2>${assetsHtml}
    <div class="foot">발급: SEEKERSLAB ITAM — AI 자산관리 플랫폼 · 발급자 ${esc(session.name)}</div>
  </div>
</body></html>`

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
