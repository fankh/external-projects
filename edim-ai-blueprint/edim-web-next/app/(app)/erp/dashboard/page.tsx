import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'

interface Dash { kpis: { label: string; value: string; err?: boolean }[]; deptEvents: { dept: string; waiting: number; running: number; doneWeek: number; delayed: number }[] }
interface VarCat { category: string; label: string; estimate: number; actual: number; variance: number; varianceRate: number; alert: boolean }
interface Analytics {
  runStats: { total: number; success: number; failed: number; successRate: number; avgDurationSec: number }
  costByType: Record<string, { total: number; runs: number }>
  variance?: { categories: VarCat[]; totalEstimate: number; totalActual: number; totalVariance: number; totalVarianceRate: number; alert: boolean; hasActual: boolean }
  monthlyOrders?: { month: string; revenue: number; margin: number | null; marginRate: number | null; orders: number }[]
}

const won = (n: number) => `₩ ${Math.round(n).toLocaleString()}`
const pct = (r: number) => `${r >= 0 ? '+' : ''}${(r * 100).toFixed(1)}%`

export const dynamic = 'force-dynamic'

// 순수 서버 컴포넌트 — SSR 집계(클라이언트 JS 최소).
export default async function DashboardPage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let dash: Dash | null = null
  let an: Analytics | null = null
  let err: string | null = null
  try {
    ;[dash, an] = await Promise.all([apiServer<Dash>('/erp/dashboard'), apiServer<Analytics>('/erp/analytics')])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const v = an?.variance
  const mo = an?.monthlyOrders ?? []
  const maxRev = Math.max(1, ...mo.map((m) => m.revenue))
  const cost = an?.costByType ?? {}
  const costRows = [
    { k: t('dash.costMat', '재료비'), v: cost.MATERIAL?.total ?? 0, c: '#2F6FB0' },
    { k: t('dash.costMfg', '제조비'), v: cost.MANUFACTURING?.total ?? 0, c: '#2F9463' },
    { k: t('dash.costDir', '직접경비'), v: cost.DIRECT?.total ?? 0, c: '#B4820B' },
  ]
  const maxCost = Math.max(1, ...costRows.map((r) => r.v))

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('dash.title', 'ERP Dashboard')} source="/erp/dashboard · /erp/analytics" />
      <div style={{ flex: 1, minHeight: 0, padding: 10, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : null}

        {dash ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            {dash.kpis.map((k) => (
              <div key={k.label} className="gb" style={{ textAlign: 'center', padding: '10px 6px' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: k.err ? 'var(--err)' : 'var(--title-navy)' }}>{k.value}</div>
                <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>{k.label}</div>
              </div>
            ))}
          </div>
        ) : null}

        {an ? (
          <div className="gb" style={{ padding: 10 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--title-navy)', marginBottom: 6 }}>{t('dash.runCostTitle', 'EDIM Run 분석 · 누적 원가')}</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { l: t('dash.anlyTotal', '총 Run'), v: String(an.runStats.total) },
                  { l: t('dash.anlyRate', '성공률'), v: `${an.runStats.successRate}%` },
                  { l: t('dash.anlyAvg', '평균 소요'), v: `${an.runStats.avgDurationSec}s` },
                  { l: t('dash.anlyFail', '실패'), v: String(an.runStats.failed), err: an.runStats.failed > 0 },
                ].map((s) => (
                  <div key={s.l} style={{ minWidth: 72, textAlign: 'center', padding: '4px 8px', border: '1px solid var(--line)', background: '#fff' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: s.err ? 'var(--err)' : 'var(--title-navy)' }}>{s.v}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt-dim)' }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                {costRows.map((r) => (
                  <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0', fontSize: 11 }}>
                    <span style={{ width: 52, color: 'var(--txt-dim)' }}>{r.k}</span>
                    <div style={{ flex: 1, background: '#EEF1F5', height: 12 }}>
                      <div style={{ width: `${(r.v / maxCost) * 100}%`, height: '100%', background: r.c }} />
                    </div>
                    <span style={{ width: 96, textAlign: 'right' }}>{won(r.v)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {an ? (
          <div className="gb" style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--title-navy)' }}>{t('dash.monthlyTitle', '월별 매출·기여마진 추이 — 수주(ORDERED)')}</span>
              {mo.length ? (
                <span className="chip info">{mo.reduce((s, m) => s + m.orders, 0)}건 · {won(mo.reduce((s, m) => s + m.revenue, 0))}</span>
              ) : (
                <span className="chip info">{t('dash.noOrders', '수주 데이터 없음')}</span>
              )}
            </div>
            {mo.map((m) => (
              <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0', fontSize: 11 }}>
                <span style={{ width: 56, color: 'var(--txt-dim)' }}>{m.month}</span>
                <div style={{ flex: 1, background: '#EEF1F5', height: 12, position: 'relative' }}>
                  <div style={{ width: `${(m.revenue / maxRev) * 100}%`, height: '100%', background: '#2F6FB0' }} />
                  {m.margin !== null && m.margin >= 0 ? (
                    <div style={{ position: 'absolute', left: 0, top: 0, width: `${(m.margin / maxRev) * 100}%`, height: '100%', background: '#2F9463', opacity: 0.85 }} />
                  ) : null}
                </div>
                <span style={{ width: 110, textAlign: 'right' }}>{won(m.revenue)}</span>
                <span style={{ width: 120, textAlign: 'right', color: 'var(--txt-dim)' }}>
                  {m.margin !== null ? `${t('dash.contribLabel', '기여')} ${won(m.margin)}` : `${t('dash.contribLabel', '기여')} —`}
                  {m.marginRate !== null ? ` (${(m.marginRate * 100).toFixed(1)}%)` : ''}
                </span>
                <span style={{ width: 34, textAlign: 'right', color: 'var(--txt-mute)' }}>{m.orders}건</span>
              </div>
            ))}
            {mo.length ? (
              <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: 'var(--txt-dim)' }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#2F6FB0', marginRight: 4 }} />{t('dash.legendContract', '계약액')}</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#2F9463', marginRight: 4 }} />{t('dash.legendContribMargin', '기여마진')}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {v ? (
          <div className="gb" style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--title-navy)' }}>{t('dash.varCostTitle', '견적 vs 실적 차이 — 원가')}</span>
              <span className={`chip ${!v.hasActual ? 'info' : v.alert ? 'err' : 'ok'}`}>
                {v.hasActual ? `${t('dash.totalVar', '총 차이')} ${won(v.totalVariance)} (${pct(v.totalVarianceRate)})${v.alert ? ` — ${t('dash.thresholdExceed', '임계 초과')}` : ''}` : t('dash.noActual', '실적 미적재')}
              </span>
            </div>
            {v.categories.map((c) => (
              <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0', fontSize: 11 }}>
                <span style={{ width: 52, color: 'var(--txt-dim)' }}>{c.label}</span>
                <span style={{ width: 92, textAlign: 'right', color: 'var(--txt-mute)' }}>{won(c.estimate)}</span>
                <span style={{ color: 'var(--txt-mute)' }}>→</span>
                <span style={{ width: 92, textAlign: 'right' }}>{won(c.actual)}</span>
                <span style={{ width: 66, textAlign: 'right', color: c.alert ? 'var(--err)' : 'var(--txt-dim)' }}>{pct(c.varianceRate)}{c.alert ? ' ⚠' : ''}</span>
              </div>
            ))}
          </div>
        ) : null}

        {dash?.deptEvents?.length ? (
          <div className="gb" style={{ padding: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)', padding: '6px 8px' }}>{t('dash.deptEventTitle', '부서별 Event 상황')}</div>
            <table className="g" style={{ width: '100%' }}>
              <thead><tr><th>{t('dash.dept', '부서')}</th><th>{t('enum.waiting', '대기')}</th><th>{t('enum.progress', '진행')}</th><th>{t('dash.doneWeek', '완료(주)')}</th><th>{t('enum.delayed', '지연')}</th></tr></thead>
              <tbody>
                {dash.deptEvents.map((d) => (
                  <tr key={d.dept}><td>{d.dept}</td><td className="c">{d.waiting}</td><td className="c">{d.running}</td><td className="c">{d.doneWeek}</td><td className="c" style={{ color: d.delayed > 0 ? 'var(--err)' : undefined }}>{d.delayed}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}
