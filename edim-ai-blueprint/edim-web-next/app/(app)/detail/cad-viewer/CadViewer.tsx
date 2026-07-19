'use client'

import { useState } from 'react'
import { CadSvg } from '@/components/CadSvg'
import { useI18n } from '@/components/I18nProvider'
import type { CadDocument } from '@/lib/cadTypes'

/** DXF/DWG 뷰어 — SSR /cad/view/{id} → CadSvg 렌더 + 레이어 토글 + 편집 모드(DXF). */
export function CadViewer({ doc, fileId, related = [] }: { doc: CadDocument; fileId: number; related?: { code: string; name: string; href: string }[] }) {
  const { t } = useI18n()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [edit, setEdit] = useState(false)
  const [plotScale, setPlotScale] = useState('100')
  const toggle = (l: string) => setHidden((s) => { const n = new Set(s); n.has(l) ? n.delete(l) : n.add(l); return n })
  const canEdit = doc.sourceFormat === 'dxf'

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>{doc.drawingName}</span>
        <span className="chip info">{doc.sourceFormat.toUpperCase()}</span>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{t('detail.entities', '엔티티')} {doc.entities.length} · file {fileId}</span>
        {canEdit ? <button type="button" data-cad-edit-toggle className={`b ${edit ? 'pri' : ''}`} style={{ height: 18, fontSize: 10 }} onClick={() => setEdit((e) => !e)}>✎ {t('detail.edit', '편집')}</button> : null}
        <select className="in" data-cad-plot-scale value={plotScale} aria-label={t('cad.plotScale', '축척')}
          style={{ height: 18, fontSize: 9.5, width: 58 }} onChange={(e) => setPlotScale(e.target.value)}>
          {['50', '100', '200'].map((s) => <option key={s} value={s}>1:{s}</option>)}
        </select>
        <button type="button" data-cad-plot className="b" style={{ height: 18, fontSize: 10 }}
          title={t('cad.plotHint', '1:축척 벡터 PDF 인쇄 (A4 가로)')}
          onClick={() => window.open(`/api/next/bin?kind=cadplot&id=${fileId}&scale=${plotScale}&paper=A4&orient=landscape`, '_blank')}>🖶 {t('cad.plotBtn', '축척 PDF')}</button>
        <a href="/detail/model3d" data-3d-link className="b" style={{ height: 18, fontSize: 10, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
          title={t('detail.model3dHint', '제품 3D 뷰어 — 원본 PPT 내장 GLB 정본 (U29)')}>🧊 3D</a>
        {related.map((r) => (
          <a key={r.code} href={r.href} data-related-code className="chip info"
            title={`${t('detail.relatedCode', '관련 제품 코드 (도면 텍스트·파일명 매칭, U10)')} — ${r.name}`}
            style={{ textDecoration: 'none' }}>🔗 {r.code}</a>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{t('cad.layer', '레이어')}</span>
        {doc.layers.map((l) => (
          <button key={l.layerName} type="button" className={`b ${hidden.has(l.layerName) ? '' : 'pri'}`}
            style={{ height: 18, fontSize: 9.5 }} onClick={() => toggle(l.layerName)}>{l.layerName}</button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <CadSvg doc={doc} hiddenLayers={hidden} editable={edit && canEdit} />
      </div>
    </div>
  )
}
