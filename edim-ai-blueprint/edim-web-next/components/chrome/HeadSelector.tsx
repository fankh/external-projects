'use client'

/** Head 선택기 (4.0 — 요구 #14 "권한 기반 Head 표시·선택").
 *
 * Head 는 EP2 슬라이드 56 의 다단계 구조 — 사용자/Set-up/관리자/플랫폼용이 나뉘고,
 * 각 Head 마다 좌/중/우 패널 바인딩이 따로 붙는다. 여기서는 **게시된(PUBLISHED) Head 중
 * 내 레벨이 볼 수 있는 것만** 서버가 걸러 내려주므로, 화면은 그대로 표시만 한다.
 * 선택 시 그 Head 의 CENTER 바인딩 화면으로 이동한다(좌측 패널은 프로세스가 담당 — #17).
 */
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import { getHead, listHeads, type HeadRow } from '@/lib/headActions'

const KEY = 'edim.headCode'

export function HeadSelector() {
  const { t } = useI18n()
  const router = useRouter()
  const [heads, setHeads] = useState<HeadRow[] | null>(null)
  const [sel, setSel] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    start(async () => {
      const rows = await listHeads()
      setHeads(rows)
      let saved = ''
      try { saved = window.localStorage.getItem(KEY) ?? '' } catch { /* noop */ }
      const pick = rows.find((h) => h.headCode === saved) ?? rows[0]
      if (pick) setSel(pick.headCode)
    })
  }, [])

  // Head 가 정의되지 않은 테넌트에서는 아무것도 보이지 않는다(도입 무영향)
  if (!heads || heads.length === 0) return null

  const go = (code: string) => {
    setSel(code)
    try { window.localStorage.setItem(KEY, code) } catch { /* noop */ }
    const h = heads.find((x) => x.headCode === code)
    if (!h) return
    start(async () => {
      const d = await getHead(h.headId)
      const center = d?.bindings.find((b) => b.panel === 'CENTER' && b.targetKind === 'SCREEN')
      if (center?.targetRef?.startsWith('/')) router.push(center.targetRef)
    })
  }

  return (
    <span data-head-selector style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8 }}
      title={t('head.hint', 'Head — 권한에 따라 보이는 업무 영역. 선택하면 그 Head 의 기본 화면으로 이동합니다')}>
      <span style={{ fontSize: 10.5, color: 'var(--txt-mute)' }}>{t('head.label', 'Head')}</span>
      <select className="in" data-head-select value={sel} disabled={pending}
        onChange={(e) => go(e.target.value)}
        style={{ height: 20, fontSize: 10.5, maxWidth: 150 }}>
        {heads.map((h) => (
          <option key={h.headId} value={h.headCode}>{h.headName}</option>
        ))}
      </select>
    </span>
  )
}
