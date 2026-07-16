'use client'

import { useState } from 'react'
import { CadSvg } from '@/components/CadSvg'
import { useI18n } from '@/components/I18nProvider'
import type { CadDocument } from '@/lib/cadTypes'

/** C-1 구성 배치 CAD 정본 (SSR /cad/arrangement) → CadSvg 실엔진 렌더. 레이어 토글 데모. */
export function ArrangementCanvas({ doc }: { doc: CadDocument }) {
  const { t } = useI18n()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const toggle = (l: string) => setHidden((s) => { const n = new Set(s); n.has(l) ? n.delete(l) : n.add(l); return n })

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>{t('arr.canvasTitle', '구성 배치 — CAD 정본 (SSR)')}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{t('arr.layer', '레이어')}</span>
        {doc.layers.map((l) => (
          <button key={l.layerName} type="button" className={`b ${hidden.has(l.layerName) ? '' : 'pri'}`}
            style={{ height: 18, fontSize: 9.5 }} onClick={() => toggle(l.layerName)}>{l.layerName}</button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <CadSvg doc={doc} hiddenLayers={hidden} />
      </div>
    </div>
  )
}
