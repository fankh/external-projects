'use client'

/** 서버측 검색 입력 — q 쿼리 파라미터를 URL 에 반영(다른 파라미터 보존).
 *  대장 그리드가 SSR 로 필터된 행만 받아오게 한다(9.23 — /parts·/companies 검색). */
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useI18n } from '@/components/I18nProvider'

export function SearchBox({ placeholder }: { placeholder?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { t } = useI18n()
  const [v, setV] = useState(params.get('q') ?? '')

  function push(q: string) {
    const next = new URLSearchParams(Array.from(params.entries()))
    if (q) next.set('q', q)
    else next.delete('q')
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); push(v.trim()) }} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input
        className="in" value={v} onChange={(e) => setV(e.target.value)}
        aria-label={t('common.search', '검색')}
        placeholder={placeholder ?? t('common.search', '검색')}
        style={{ height: 20, fontSize: 10, width: 150 }} />
      <button className="b" style={{ height: 20, fontSize: 10 }}>{t('common.search', '검색')}</button>
      {params.get('q') && (
        <button type="button" className="b" style={{ height: 20, fontSize: 10 }}
          title={t('common.clear', '지우기')}
          onClick={() => { setV(''); push('') }}>✕</button>
      )}
    </form>
  )
}
