'use client'

/** 단가 해석 위젯 (M-12-5) — GET /prices/resolve: 코드·기준일의 유효 단가 (소스 우선순위 엔진). */
import { useState, useTransition } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { resolvePrice, type ResolvedPrice } from './actions'

export function PriceResolve() {
  const { t } = useI18n()
  const [code, setCode] = useState('')
  const [at, setAt] = useState('')
  const [out, setOut] = useState<ResolvedPrice | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const run = () => start(async () => {
    const r = await resolvePrice(code, at || undefined)
    if (r.error) { setErr(r.error); setOut(null); return }
    setErr(null); setOut(r.result!)
  })
  return (
    <div data-price-resolve style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 8px', fontSize: 11, flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
      <b style={{ color: 'var(--title-navy)' }}>{t('price.resolveTitle', '단가 해석')}</b>
      <input className="in" value={code} aria-label="해석 코드" placeholder={t('price.resolveCodePh', '코드 (예: KDF 32)')}
        onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') run() }}
        style={{ width: 120, height: 20, fontSize: 10.5 }} />
      <input className="in" type="date" value={at} aria-label="기준일" onChange={(e) => setAt(e.target.value)} style={{ height: 20, fontSize: 10.5 }} />
      <button className="b" data-price-resolve-run disabled={pending} onClick={run}
        title={t('price.resolveHint', '기준일 유효 단가 1건 — 소스 우선순위(구매>견적>표준) 적용')}>{t('common.query', '조회')}</button>
      {err ? <span style={{ color: 'var(--err)' }}>{err}</span> : null}
      {out ? (
        <span data-price-resolve-out style={{ color: 'var(--run)', fontWeight: 600 }}>
          {out.code} = ₩{out.price.toLocaleString()} <span style={{ color: 'var(--txt-dim)', fontWeight: 400 }}>
            ({out.source} · {out.supplier} · {out.from}{out.to ? `~${out.to}` : '~'})</span>
        </span>
      ) : null}
    </div>
  )
}
