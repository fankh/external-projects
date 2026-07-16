import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Chip } from '@/components/controls'
import { CodeBlockPreview } from './CodeBlockPreview'

export const dynamic = 'force-dynamic'

interface PriceRow { code: string; name: string; supplier: string; price: number; source: string; from: string; to: string | null; active: boolean }
interface ReferencerRow { code: string; name: string; qty: number; status: string }
interface SlotItemRow { pcItemId: number; slot: string; itemName: string; required: boolean; sortOrder: number }
interface ApprovalHistRow { date: string; action: string; by: string; note: string }

export default async function CodeDetailPage({ searchParams }: { searchParams: Promise<{ code?: string; name?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const sp = await searchParams
  const code = (sp.code ?? 'KDCR 3-13').trim()
  const name = (sp.name ?? '').trim()
  const base = code.split('-').slice(0, 2).join('-')

  let err: string | null = null
  let allPrices: PriceRow[] = []
  let referencers: ReferencerRow[] = []
  let slots: SlotItemRow[] = []
  let hist: ApprovalHistRow[] = []
  try {
    const [pr, rf, sl, hs] = await Promise.all([
      apiServer<PriceRow[]>('/prices').catch(() => []),
      apiServer<ReferencerRow[]>(`/codes/${encodeURIComponent(base)}/referencers`).catch(() => []),
      apiServer<SlotItemRow[]>(`/codes/${encodeURIComponent(base)}/slot-items`).catch(() => []),
      apiServer<ApprovalHistRow[]>(`/codes/${encodeURIComponent(base)}/approval-history`).catch(() => []),
    ])
    allPrices = pr; referencers = rf; slots = sl; hist = hs
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const prices = allPrices.filter((p) => code.startsWith(p.code) || base.startsWith(p.code))

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('detail.codeTitle', '코드 상세')} — ${code}${name ? ` (${name})` : ''}`} source="/prices · /codes/{c}/referencers · slot-items · approval-history" />
      {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
        <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
          <div className="fill-col" style={{ gap: 6, flex: 1.2, overflow: 'auto' }}>
            <div className="gb">
              <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>{t('detail.repDrawing', '대표 도면')} (Block)</div>
              <CodeBlockPreview code={code} name={name} />
            </div>
            <div className="gb">
              <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>{t('detail.priceHist', '단가 이력')} — {prices.length}{t('detail.cases', '건')} (cst_price)</div>
              {prices.length ? (
                <table className="g"><thead><tr><th>Supplier</th><th>Price</th><th>{t('detail.source', '소스')}</th><th>{t('detail.fromDate', '적용 시작')}</th><th>{t('detail.toDate', '종료')}</th><th>{t('detail.statusCol', '상태')}</th></tr></thead>
                  <tbody>{prices.map((p, i) => (
                    <tr key={i}><td className="c">{p.supplier}</td><td className="num">{p.price.toLocaleString()}</td>
                      <td className="c"><Chip tone="info">{p.source}</Chip></td><td className="c">{p.from}</td><td className="c">{p.to ?? '-'}</td>
                      <td className="c">{p.active ? <Chip tone="ok">{t('detail.active', '적용중')}</Chip> : <Chip tone="warn">{t('detail.expired', '만료')}</Chip>}</td></tr>
                  ))}</tbody></table>
              ) : <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('detail.noPrice', '등록 단가 없음 — Pricing Run 시 warn 대상')}</div>}
            </div>
            <div className="gb">
              <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>Referencers (Where-Used) — {referencers.length}{t('detail.cases', '건')}</div>
              {referencers.length ? (
                <table className="g"><thead><tr><th>Mother</th><th>Desc.</th><th>Q'ty</th><th>{t('detail.category', '구분')}</th></tr></thead>
                  <tbody>{referencers.map((r) => (
                    <tr key={r.code}><td className="code">{r.code}</td><td>{r.name}</td><td className="num">{r.qty}</td><td className="c">{r.status}</td></tr>
                  ))}</tbody></table>
              ) : <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('detail.noRefs', '상위 참조 없음 — 최상위 또는 미연결 코드')}</div>}
            </div>
          </div>
          <div className="side-scroll" style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
            <div className="gb" style={{ padding: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{t('detail.codeInfo', '코드 정보')}</div>
              <div style={{ fontSize: 11, lineHeight: 1.9 }}>
                <div>{t('detail.typeLabel', '유형')} <b>{code.startsWith('KDCR') ? 'PRODUCT' : 'SUB'}</b></div>
                <div style={{ fontFamily: 'Consolas, monospace' }}>Hierarchy /C/ENG/FAN/{base}</div>
              </div>
            </div>
            {slots.length ? (
              <div className="gb">
                <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>{t('detail.reqSlots', '필수 슬롯 정의')} ({slots.length})</div>
                <table className="g"><thead><tr><th>Slot</th><th>{t('detail.itemCol', '항목')}</th><th>{t('detail.required', '필수')}</th></tr></thead>
                  <tbody>{slots.map((s) => (
                    <tr key={s.pcItemId}><td className="c"><b>{s.slot}</b></td><td>{s.itemName}</td>
                      <td className="c">{s.required ? <Chip tone="err">{t('detail.required', '필수')}</Chip> : <Chip tone="info">{t('detail.optional', '선택')}</Chip>}</td></tr>
                  ))}</tbody></table>
              </div>
            ) : null}
            <div className="gb">
              <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px', display: 'flex' }}>{t('detail.approvalHist', '승인 이력')}<span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--txt-mute)' }}>{hist.length}{t('detail.cases', '건')}</span></div>
              {hist.length ? (
                <table className="g"><thead><tr><th>{t('detail.dateCol', '일자')}</th><th>{t('detail.actionCol', '행위')}</th><th>{t('detail.actorCol', '처리자')}</th></tr></thead>
                  <tbody>{hist.map((h, i) => <tr key={i} title={h.note}><td className="c">{h.date}</td><td>{h.action}</td><td className="c">{h.by}</td></tr>)}</tbody></table>
              ) : <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('detail.noApprovalHist', '승인 이력 없음')}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
