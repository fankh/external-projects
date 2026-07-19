'use client'

import { useState } from 'react'
import { CadSvg, type CadEditOp, type LayerOverride } from '@/components/CadSvg'
import { useI18n } from '@/components/I18nProvider'
import type { CadDocument } from '@/lib/cadTypes'
import { viewerCadEdit, viewerCadView } from './actions'

/** DXF/DWG 뷰어 — SSR /cad/view/{id} → CadSvg 렌더 + 레이어 토글 + 편집 모드(DXF). */
export function CadViewer({ doc: initialDoc, fileId, related = [] }: { doc: CadDocument; fileId: number; related?: { code: string; name: string; href: string }[] }) {
  const { t } = useI18n()
  const [doc, setDoc] = useState(initialDoc)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [plotScale, setPlotScale] = useState('100')
  const [editMsg, setEditMsg] = useState<{ text: string; err?: boolean } | null>(null)
  // B16 DWG-025 특성 편집 — 레이어별 색·선굵기 오버라이드 (표시 속성, 원본 DXF 불변)
  const [overrides, setOverrides] = useState<Record<string, LayerOverride>>({})
  const toggle = (l: string) => setHidden((s) => { const n = new Set(s); n.has(l) ? n.delete(l) : n.add(l); return n })
  const canEdit = doc.sourceFormat === 'dxf'

  // 편집 op → DXF 재저장 (Design Editor 와 동일 경로). 실패 시 서버 정본 복원.
  const onEdit = (ops: CadEditOp[]) => {
    void viewerCadEdit(fileId, ops)
      .then((r) => { setDoc(r.document); setEditMsg({ text: `${t('cad.editApplied', 'CAD 편집 ✓')} — ${r.applied}${t('detail.cases', '건')} (${t('detail.entities', '엔티티')} ${r.document.entities.length})` }) })
      .catch((e: Error) => {
        void viewerCadView(fileId).then((d) => { if (d) setDoc(d) })
        setEditMsg({ text: e.message, err: true })
      })
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>{doc.drawingName}</span>
        <span className="chip info">{doc.sourceFormat.toUpperCase()}</span>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{t('detail.entities', '엔티티')} {doc.entities.length} · file {fileId}</span>
        <select className="in" data-cad-plot-scale value={plotScale} aria-label={t('cad.plotScale', '축척')}
          style={{ height: 18, fontSize: 9.5, width: 58 }} onChange={(e) => setPlotScale(e.target.value)}>
          {['50', '100', '200'].map((s) => <option key={s} value={s}>1:{s}</option>)}
        </select>
        <button type="button" data-cad-plot className="b" style={{ height: 18, fontSize: 10 }}
          title={t('cad.plotHint', '1:축척 벡터 PDF 인쇄 (A4 가로)')}
          onClick={() => window.open(`/api/next/bin?kind=cadplot&id=${fileId}&scale=${plotScale}&paper=A4&orient=landscape`, '_blank')}>🖶 {t('cad.plotBtn', '축척 PDF')}</button>
        <button type="button" data-cad-dxf-dl className="b" style={{ height: 18, fontSize: 10 }}
          title={t('cad.dxfDlHint', '원본 파일 다운로드')}
          onClick={() => window.open(`/api/next/bin?kind=file&id=${fileId}&name=${encodeURIComponent(doc.drawingName || `file-${fileId}.dxf`)}`, '_blank')}>⬇ DXF</button>
        <a href="/detail/model3d" data-3d-link className="b" style={{ height: 18, fontSize: 10, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
          title={t('detail.model3dHint', '제품 3D 뷰어 — 원본 PPT 내장 GLB 정본 (U29)')}>🧊 3D</a>
        {related.map((r) => (
          <a key={r.code} href={r.href} data-related-code className="chip info"
            title={`${t('detail.relatedCode', '관련 제품 코드 (도면 텍스트·파일명 매칭, U10)')} — ${r.name}`}
            style={{ textDecoration: 'none' }}>🔗 {r.code}</a>
        ))}
        {editMsg ? <span data-cad-edit-msg style={{ fontSize: 10, color: editMsg.err ? 'var(--err)' : 'var(--run)' }}>{editMsg.text}</span> : null}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{t('cad.layer', '레이어')}</span>
        {doc.layers.map((l) => (
          <span key={l.layerName} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <button type="button" className={`b ${hidden.has(l.layerName) ? '' : 'pri'}`}
              style={{ height: 18, fontSize: 9.5 }} onClick={() => toggle(l.layerName)}>{l.layerName}</button>
            {/* 특성 편집 (DWG-025) — 색·선굵기 표시 오버라이드 (원본 DXF 불변) */}
            <input type="color" data-layer-color={l.layerName}
              value={overrides[l.layerName]?.color ?? (l.colorHex === '#ffffff' ? '#2B3A55' : l.colorHex)}
              aria-label={`레이어 색 ${l.layerName}`}
              style={{ width: 14, height: 14, padding: 0, border: '1px solid var(--line)', cursor: 'pointer' }}
              onChange={(e) => setOverrides((cur) => ({ ...cur, [l.layerName]: { ...cur[l.layerName], color: e.target.value } }))} />
            <select className="in" data-layer-width={l.layerName} value={overrides[l.layerName]?.width ?? 1}
              aria-label={`레이어 굵기 ${l.layerName}`}
              style={{ fontSize: 9, padding: '0 1px', width: 34, height: 16 }}
              onChange={(e) => setOverrides((cur) => ({ ...cur, [l.layerName]: { ...cur[l.layerName], width: Number(e.target.value) } }))}>
              {[1, 2, 3].map((w) => <option key={w} value={w}>{w}×</option>)}
            </select>
          </span>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <CadSvg doc={doc} hiddenLayers={hidden} editable={canEdit} onEdit={onEdit} layerOverrides={overrides} />
      </div>
    </div>
  )
}
