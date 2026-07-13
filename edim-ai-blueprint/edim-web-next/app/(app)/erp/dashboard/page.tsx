import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'

interface Dash { kpis: { label: string; value: string; err?: boolean }[]; deptEvents: { dept: string; waiting: number; running: number; doneWeek: number; delayed: number }[] }
interface VarCat { category: string; label: string; estimate: number; actual: number; variance: number; varianceRate: number; alert: boolean }
interface Analytics {
  runStats: { total: number; success: number; failed: number; successRate: number; avgDurationSec: number }
  costByType: Record<string, { total: number; runs: number }>
  variance?: { categories: VarCat[]; totalEstimate: number; totalActual: number; totalVariance: number; totalVarianceRate: number; alert: boolean; hasActual: boolean }
}

const won = (n: number) => `₩ ${Math.round(n).toLocaleString()}`
const pct = (r: number) => `${r >= 0 ? '+' : ''}${(r * 100).toFixed(1)}%`

export const dynamic = 'force-dynamic'

// 순수 서버 컴포넌트 — SSR 집계(클라이언트 JS 최소).
export default async function DashboardPage() {
  let dash: Dash | null = null
  let an: Analytics | null = null
  let err: string | null = null
  try {
    ;[dash, an] = await Promise.all([apiServer<Dash>('/erp/dashboard'), apiServer<Analytics>('/erp/analytics')])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const v = an?.variance
  const cost = an?.costByType ?? {}
  const costRows = [
    { k: '재료비', v: cost.MATERIAL?.total ?? 0, c: '#2F6FB0' },
    { k: '제조비', v: cost.MANUFACTURING?.total ?? 0, c: '#2F9463' },
    { k: '직접경비', v: cost.DIRECT?.total ?? 0, c: '#B4820B' },
  ]
  const maxCost = Math.max(1, ...costRows.map((r) => r.v))

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="ERP Dashboard" source="/erp/dashboard · /erp/analytics" />
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
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--title-navy)', marginBottom: 6 }}>EDIM Run 분석 · 누적 원가</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { l: '총 Run', v: String(an.runStats.total) },
                  { l: '성공률', v: `${an.runStats.successRate}%` },
                  { l: '평균 소요', v: `${an.runStats.avgDurationSec}s` },
                  { l: '실패', v: String(an.runStats.failed), err: an.runStats.failed > 0 },
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

        {v ? (
          <div className="gb" style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--title-navy)' }}>견적 vs 실적 차이 — 원가</span>
              <span className={`chip ${!v.hasActual ? 'info' : v.alert ? 'err' : 'ok'}`}>
                {v.hasActual ? `총 차이 ${won(v.totalVariance)} (${pct(v.totalVarianceRate)})${v.alert ? ' — 임계 초과' : ''}` : '실적 미적재'}
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
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)', padding: '6px 8px' }}>부서별 Event 상황</div>
            <table className="g" style={{ width: '100%' }}>
              <thead><tr><th>부서</th><th>대기</th><th>진행</th><th>완료(주)</th><th>지연</th></tr></thead>
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
