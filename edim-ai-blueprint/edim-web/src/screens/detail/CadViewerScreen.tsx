/** CAD 뷰어 (INT-04) — MinIO 저장 DXF 를 정규화 DrawingDocument 로 파싱해 SVG 렌더.
 *  레이어 표시 토글 · 휠 줌 · 맞춤 · 다운로드. DWG 는 ODA 미설정 시 501 안내. */
import { useEffect, useMemo, useState } from 'react'
import { cadService, fileService, type CadDocument } from '../../api/services'
import { Btn, Chip } from '../../components/controls'
import { CadSvg, type LayerOverride } from '../../components/CadSvg'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

export function CadViewerScreen({ tab }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const { setStatusMsg } = shell
  const fileId = Number(tab.params?.fileId ?? 0)
  const name = String(tab.params?.name ?? 'drawing.dxf')
  const [doc, setDoc] = useState<CadDocument | null>(null)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  useEffect(() => {
    void cadService.view(fileId)
      .then((d) => {
        if (d === null) setOffline(true)
        else {
          setDoc(d)
          setStatusMsg(`CAD 로드 — ${d.drawingName} · 엔티티 ${d.entities.length} · ${d.units}`)
        }
      })
      .catch((e: Error) => {
        setError(e.message)
        setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>)
      })
  }, [fileId, setStatusMsg])

  // B16 DWG-025 특성 편집 — 레이어별 색·선굵기 오버라이드 (표시 속성, 원본 DXF 불변)
  const [overrides, setOverrides] = useState<Record<string, LayerOverride>>({})

  const layerColor = useMemo(() => {
    const m: Record<string, string> = {}
    doc?.layers.forEach((l) => {
      m[l.layerName] = overrides[l.layerName]?.color
        ?? (l.colorHex === '#ffffff' ? '#2B3A55' : l.colorHex)
    })
    return m
  }, [doc, overrides])

  return (
    <div className="fill-col">
      <div className="toolbar">
        <button type="button" className="b" data-cad-back onClick={() => {
          const from = typeof tab.params?.from === 'string' ? tab.params.from : null
          if (from) shell.activateTab(from)
          shell.closeTab(tab.id)
        }}>← {t('common.backToList', '목록으로')}</button>
        <span className="sep" />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>{name}</span>
        {doc ? <Chip tone="info">{doc.sourceFormat.toUpperCase()} · {doc.units}</Chip> : null}
        <span className="sep" />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>휠 줌 · 드래그 이동 · 더블클릭 맞춤</span>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => {
          void fileService.download(fileId, name)
            .catch((e: Error) => setStatusMsg(
              <span style={{ color: 'var(--err)' }}>{e.message}</span>))
        }}>⬇ DXF</Btn>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: 200, borderRight: '1px solid var(--line)', background: '#FAFBFC', overflow: 'auto', flex: 'none' }}>
          <div className="lnav" style={{ width: '100%', border: 'none' }}>
            <div className="hd">{t('cad.layer', '레이어')} {doc ? `(${doc.layers.length})` : ''}</div>
            <div className="tree2">
              {doc?.layers.map((l) => (
                <div key={l.layerName} className="tn" style={{ gap: 6 }}
                  onClick={() => setHidden((prev) => {
                    const next = new Set(prev)
                    if (next.has(l.layerName)) next.delete(l.layerName)
                    else next.add(l.layerName)
                    return next
                  })}>
                  <input type="checkbox" readOnly checked={!hidden.has(l.layerName)}
                    aria-label={`레이어 ${l.layerName}`} />
                  {/* 특성 편집 (DWG-025) — 색상 클릭 = 변경, 클릭 전파 차단 */}
                  <input type="color" value={layerColor[l.layerName] ?? '#2B3A55'}
                    aria-label={`레이어 색 ${l.layerName}`}
                    style={{ width: 14, height: 14, padding: 0, border: '1px solid var(--line)', flex: 'none', cursor: 'pointer' }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setOverrides((cur) => ({
                      ...cur, [l.layerName]: { ...cur[l.layerName], color: e.target.value },
                    }))} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.layerName}</span>
                  <select className="in" value={overrides[l.layerName]?.width ?? 1}
                    aria-label={`레이어 굵기 ${l.layerName}`}
                    style={{ fontSize: 9, padding: '0 1px', width: 34, flex: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setOverrides((cur) => ({
                      ...cur, [l.layerName]: { ...cur[l.layerName], width: Number(e.target.value) },
                    }))}>
                    {[1, 2, 3].map((w) => <option key={w} value={w}>{w}×</option>)}
                  </select>
                </div>
              ))}
              {Object.keys(overrides).length ? (
                <div style={{ padding: '2px 8px', textAlign: 'right' }}>
                  <Btn style={{ height: 18, fontSize: 9.5 }} onClick={() => setOverrides({})}>
                    {t('cad.resetProps', '특성 원복')}
                  </Btn>
                </div>
              ) : null}
            </div>
            {doc ? (
              <div style={{ padding: '6px 8px', fontSize: 10, color: 'var(--txt-dim)', lineHeight: 1.8, borderTop: '1px solid var(--line)' }}>
                엔티티 {doc.entities.length}<br />
                {Object.entries(doc.skippedEntityCounts).length > 0
                  ? `미지원 스킵: ${Object.entries(doc.skippedEntityCounts)
                    .map(([k, v]) => `${k}×${v}`).join(', ')}`
                  : '전 엔티티 렌더됨'}
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ flex: 1, background: '#fff', minWidth: 0 }}>
          {doc ? (
            <CadSvg doc={doc} hiddenLayers={hidden} layerOverrides={overrides} />
          ) : (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--txt-mute)', fontSize: 11.5, textAlign: 'center', lineHeight: 2 }}>
              {error
                ? <span style={{ color: 'var(--err)' }}>{error}</span>
                : offline
                  ? <>CAD 파싱은 백엔드가 필요합니다 (현재 MOCK 모드)<br />
                    <span style={{ fontSize: 10.5 }}>ezdxf 파서 — DWG 는 ODA File Converter 설정 후 지원</span></>
                  : '로드 중…'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
