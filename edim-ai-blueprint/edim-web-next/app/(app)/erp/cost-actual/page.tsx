import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ActualGrid, type ActualRow } from './ActualGrid'
import { ActualForm } from './ActualForm'

interface VarCat { category: string; label: string; estimate: number; actual: number; variance: number; varianceRate: number; alert: boolean }
interface Variance { estimateAvailable: boolean; categories: VarCat[]; totalEstimate: number; totalActual: number; totalVariance: number; totalVarianceRate: number; alert: boolean }

const won = (n: number) => `₩ ${Math.round(n).toLocaleString()}`
const pct = (r: number) => `${r >= 0 ? '+' : ''}${(r * 100).toFixed(1)}%`

export const dynamic = 'force-dynamic'

export default async function CostActualPage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: ActualRow[] = []
  let v: Variance | null = null
  let err: string | null = null
  try {
    ;[rows, v] = await Promise.all([apiServer<ActualRow[]>('/cost/actuals'), apiServer<Variance>('/cost/variance')])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>{t('costact.title', '원가 실적·차이분석')} (D-6)</span>
        {!err ? <span className="chip info">{rows.length}건</span> : null}
        {!err && rows.length >= 2000 ? <span className="chip warn" title="최신 2000건만 표시됩니다 (성능 상한). 프로젝트로 좁히십시오.">상한</span> : null}
        {v ? <span className={`chip ${v.alert ? 'err' : 'ok'}`}>{t('costact.totalVar', '총 차이')} {won(v.totalVariance)} ({pct(v.totalVarianceRate)}){v.alert ? ` — ${t('costact.alert', '경보')}` : ''}</span> : null}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>SSR · /cost/actuals · /cost/variance</span>
      </div>
      <ActualForm />
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : null}
        {v ? (
          <div className="gb" style={{ padding: 0 }}>
            <table className="g" style={{ width: '100%' }}>
              <thead><tr><th>{t('act.vcat', '원가 분류')}</th><th>{t('act.est', '추정(견적)')}</th><th>{t('act.act', '실적')}</th><th>{t('act.var', '차이')}</th><th>{t('act.rate', '차이율')}</th></tr></thead>
              <tbody>
                {v.categories.map((c) => (
                  <tr key={c.category}>
                    <td>{c.label}</td>
                    <td className="num">{won(c.estimate)}</td>
                    <td className="num">{won(c.actual)}</td>
                    <td className="num" style={{ color: c.variance > 0 ? 'var(--err)' : 'var(--ok)' }}>{won(c.variance)}</td>
                    <td className="num" style={{ color: c.alert ? 'var(--err)' : undefined }}>{pct(c.varianceRate)}{c.alert ? ' ⚠' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!err ? <div style={{ flex: 1, minHeight: 0 }}><ActualGrid rows={rows} /></div> : null}
      </div>
    </div>
  )
}
