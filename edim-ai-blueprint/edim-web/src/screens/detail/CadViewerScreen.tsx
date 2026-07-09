/** CAD 뷰어 (INT-04) — MinIO 저장 DXF 를 정규화 DrawingDocument 로 파싱해 SVG 렌더.
 *  레이어 표시 토글 · 휠 줌 · 맞춤 · 다운로드. DWG 는 ODA 미설정 시 501 안내. */
import { useEffect, useMemo, useState } from 'react'
import { cadService, fileService, type CadDocument } from '../../api/services'
import { Btn, Chip } from '../../components/controls'
import { CadSvg } from '../../components/CadSvg'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

export function CadViewerScreen({ tab }: ScreenProps) {
  const shell = useShell()
  const { setStatusMsg } = shell
  const fileId = Number(tab.params?.fileId ?? 0)
  const name = String(tab.params?.name ?? 'drawing.dxf')
  const [doc, setDoc] = useState<CadDocument | null>(null)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(1)

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

  const layerColor = useMemo(() => {
    const m: Record<string, string> = {}
    doc?.layers.forEach((l) => {
      m[l.layerName] = l.colorHex === '#ffffff' ? '#2B3A55' : l.colorHex
    })
    return m
  }, [doc])

  return (
    <div className="fill-col">
      <div className="toolbar">
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>{name}</span>
        {doc ? <Chip tone="info">{doc.sourceFormat.toUpperCase()} · {doc.units}</Chip> : null}
        <span className="sep" />
        <Btn onClick={() => setZoom(1)}>맞춤</Btn>
        <Btn variant="ic" onClick={() => setZoom((z) => Math.min(z * 1.4, 40))}>＋</Btn>
        <Btn variant="ic" onClick={() => setZoom((z) => Math.max(z / 1.4, 0.2))}>－</Btn>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{Math.round(zoom * 100)}% (휠 줌)</span>
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
            <div className="hd">레이어 {doc ? `(${doc.layers.length})` : ''}</div>
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
                  <span style={{
                    width: 10, height: 10, background: layerColor[l.layerName],
                    border: '1px solid var(--line)', flex: 'none',
                  }} />
                  {l.layerName}
                </div>
              ))}
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
        <div style={{ flex: 1, background: '#fff', minWidth: 0 }}
          onWheel={(e) => setZoom((z) => Math.min(40, Math.max(0.2, z * (e.deltaY < 0 ? 1.15 : 0.87))))}>
          {doc ? (
            <CadSvg doc={doc} hiddenLayers={hidden} zoom={zoom} />
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
