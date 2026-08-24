import { appendAudit } from '@/lib/audit'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { today } from '@/lib/dates'

/** 오프보딩 명세서 — 퇴직·부서이동 대상자의 회수·재배정 대상(보유 자산·대여·라이선스 좌석·미처리 상신)을
 *  한 장의 인쇄용 체크리스트로. 사용자 화면(설정) 오프보딩 요약(v1.323)의 인쇄 산출물. 자산 운영이므로 자산담당·Admin.
 *  자산 회수 시 배정 라이선스 좌석은 자동 회수된다(로56) — 명세서는 회수 실행 전 점검·인수인계 기록용. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (!['ASSET_MGR', 'ADMIN'].includes(session.role)) return new Response('Forbidden', { status: 403 })

  const { name: raw } = await params
  const name = decodeURIComponent(raw)
  const s = getStore()
  const account = s.users.find((u) => u.name === name)
  const dept = account?.dept ?? s.assets.find((a) => a.owner === name)?.dept ?? '-'

  // 특정 개인의 보유 자산·대여·라이선스 좌석·미처리 상신을 한 장으로 모은 개인 단위 반출이라 감사에 남긴다
  //  (다른 데이터 반출과 같은 규약 — 단건 카드·라벨 인쇄는 화면 조회에 가까워 제외).
  appendAudit({ actor: session.name, action: `오프보딩 명세서 반출 — ${name} (${dept})`, target: name })

  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
  const inUse = s.assets.filter((a) => a.owner === name && a.status === '사용중')
  const loaned = s.assets.filter((a) => a.owner === name && a.status === '대여중')
  const seats = s.licenses
    .filter((l) => l.status !== '해지')
    .flatMap((l) => (l.seats ?? []).filter((st) => st.user === name).map((st) => ({ lic: l.name, assetNo: st.assetNo })))
  const pending = s.approvals.filter((a) => a.status === '대기' && a.requester === name)

  const total = inUse.length + loaned.length + seats.length + pending.length
  const rowsOf = (arr: { c1: string; c2: string; c3: string }[], head: [string, string, string]) =>
    `<table><thead><tr><th style="width:26px"></th><th>${head[0]}</th><th>${head[1]}</th><th>${head[2]}</th></tr></thead><tbody>${
      arr.length
        ? arr.map((r) => `<tr><td class="ck">□</td><td class="mono">${esc(r.c1)}</td><td>${esc(r.c2)}</td><td class="dim">${esc(r.c3)}</td></tr>`).join('')
        : '<tr><td></td><td colspan="3" class="dim">해당 없음</td></tr>'
    }</tbody></table>`

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>오프보딩 명세서 — ${esc(name)}</title>
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
  .nm { font-size: 14px; color: #5b6470; }
  .sum { display: inline-block; margin-top: 8px; font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 12px; background: ${total > 0 ? '#fef6e7' : '#e9f6ec'}; color: ${total > 0 ? '#92610a' : '#1a7f37'}; }
  h2 { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #5b6470; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #c3c8d0; color: #5b6470; font-weight: 600; }
  td { padding: 6px 8px; border-bottom: 1px solid #eef1f5; }
  td.ck { font-size: 15px; color: #5b6470; text-align: center; }
  td.mono { font-family: ui-monospace, Consolas, monospace; font-weight: 600; }
  td.dim, .dim { color: #8494ac; }
  .note { margin-top: 14px; font-size: 11.5px; color: #5b6470; background: #f6f8fb; border-radius: 6px; padding: 9px 12px; }
  .foot { margin-top: 16px; font-size: 10.5px; color: #8494ac; display: flex; justify-content: space-between; }
  .sign { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; font-size: 12px; }
  .sign div { border-top: 1px solid #c3c8d0; padding-top: 6px; color: #5b6470; }
  @media print { .toolbar { display: none; } body { background: #fff; } .sheet { border: 0; margin: 0; max-width: none; } @page { margin: 12mm; } }
</style></head>
<body>
  <div class="toolbar">
    <button class="pri" onclick="window.print()">인쇄</button>
    <button onclick="window.close()">닫기</button>
    <span class="cap">오프보딩 명세서 — ${esc(name)}</span>
  </div>
  <div class="sheet">
    <div class="hd">
      <div class="brand">SEEKERSLAB · ASSET OFFBOARDING CHECKLIST</div>
      <div class="no">${esc(name)}</div>
      <div class="nm">${esc(dept)}${account ? ` · ${esc(account.login)}` : ''}</div>
      <div><span class="sum">${total > 0 ? `회수·재배정 대상 ${total}건` : '회수·재배정 대상 없음'}</span></div>
    </div>
    <h2>사용 중 보유 자산 (회수 대상)</h2>
    ${rowsOf(inUse.map((a) => ({ c1: a.assetNo, c2: a.model, c3: a.category })), ['자산번호', '모델', '유형'])}
    <h2>대여 자산 (반환 대상)</h2>
    ${rowsOf(loaned.map((a) => ({ c1: a.assetNo, c2: a.model, c3: a.loanDueDate ? `반환 ${a.loanDueDate}` : '-' })), ['자산번호', '모델', '반환 기한'])}
    <h2>배정 라이선스 좌석 (회수 · 재배정)</h2>
    ${rowsOf(seats.map((st) => ({ c1: st.assetNo, c2: st.lic, c3: '' })), ['자산번호', '라이선스', ''])}
    <h2>미처리 상신 결재 (정리 대상)</h2>
    ${rowsOf(pending.map((a) => ({ c1: a.id, c2: a.title, c3: a.currentStep ?? '' })), ['결재번호', '제목', '현재 단계'])}
    <div class="note"><b>안내.</b> 자산 회수(대장 상세 ‘자산 회수’ 또는 일괄 회수) 시 배정 라이선스 좌석은 자동 회수되어 여유석으로 복귀합니다. 좌석만 남는 경우 계약·라이선스 화면에서 직접 회수하세요.</div>
    <div class="sign"><div>인수인계 확인 (자산담당)</div><div>대상자 서명</div></div>
    <div class="foot"><span>발급: SEEKERSLAB ITAM · 발급자 ${esc(session.name)}</span><span>${today()}</span></div>
  </div>
</body></html>`

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
