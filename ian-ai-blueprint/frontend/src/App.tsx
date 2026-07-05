import { useState } from 'react'
import './App.css'
import { AiPromptPanel } from './components/AiPromptPanel'
import { BlueprintCanvas } from './components/BlueprintCanvas'
import { FileUploadPanel } from './components/FileUploadPanel'
import { LayerListPanel } from './components/LayerListPanel'
import { DownloadIcon, LogoMark } from './components/Icons'
import { exportDrawingAsDxf } from './api/blueprintApiClient'
import type { DrawingDocument } from './types/drawing'

function App() {
  const [currentDrawingDocument, setCurrentDrawingDocument] = useState<DrawingDocument | null>(null)
  const [hiddenLayerNames, setHiddenLayerNames] = useState<Set<string>>(new Set())
  const [exportErrorMessage, setExportErrorMessage] = useState<string | null>(null)

  const loadDrawingDocument = (drawingDocument: DrawingDocument) => {
    setCurrentDrawingDocument(drawingDocument)
    setHiddenLayerNames(new Set())
    setExportErrorMessage(null)
  }

  const toggleLayerVisibility = (layerName: string) => {
    setHiddenLayerNames((currentHiddenNames) => {
      const updatedHiddenNames = new Set(currentHiddenNames)
      if (updatedHiddenNames.has(layerName)) updatedHiddenNames.delete(layerName)
      else updatedHiddenNames.add(layerName)
      return updatedHiddenNames
    })
  }

  const skippedEntitySummary = currentDrawingDocument
    ? Object.entries(currentDrawingDocument.skippedEntityCounts)
        .map(([entityTypeName, skippedCount]) => `${entityTypeName}×${skippedCount}`)
        .join(', ')
    : ''

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <LogoMark size={19} />
          </span>
          <span className="brand-text">
            <span className="brand-name">ian-ai-blueprint</span>
            <span className="brand-tag">AI 2D 블루프린트 스튜디오</span>
          </span>
        </div>

        <div className="sidebar-scroll">
          <FileUploadPanel onDrawingLoaded={loadDrawingDocument} />
          <AiPromptPanel onDrawingGenerated={loadDrawingDocument} />
          <LayerListPanel
            layers={currentDrawingDocument?.layers ?? []}
            hiddenLayerNames={hiddenLayerNames}
            onToggleLayerVisibility={toggleLayerVisibility}
          />
          {currentDrawingDocument && (
            <section className="card">
              <div className="card-head">
                <span className="card-icon">
                  <DownloadIcon />
                </span>
                <span className="card-title">내보내기</span>
              </div>
              <button
                className="btn btn-secondary btn-block"
                onClick={() => {
                  setExportErrorMessage(null)
                  exportDrawingAsDxf(currentDrawingDocument).catch((exportError) =>
                    setExportErrorMessage(
                      exportError instanceof Error ? exportError.message : String(exportError)))
                }}
              >
                <DownloadIcon size={16} /> DXF 내보내기
              </button>
              {exportErrorMessage && <p className="error-message">{exportErrorMessage}</p>}
            </section>
          )}
        </div>

        {currentDrawingDocument && (
          <div className="drawing-meta">
            <span className="meta-name">{currentDrawingDocument.drawingName}</span>
            <span>
              {currentDrawingDocument.sourceFormat} · {currentDrawingDocument.units} · 엔티티{' '}
              {currentDrawingDocument.entities.length}개
            </span>
            {skippedEntitySummary && <span>미지원 생략: {skippedEntitySummary}</span>}
          </div>
        )}
      </aside>

      <main className="workspace">
        <div className="canvas-toolbar">
          <span className="win-dots">
            <span />
            <span />
            <span />
          </span>
          <span className={`toolbar-title${currentDrawingDocument ? '' : ' is-empty'}`}>
            {currentDrawingDocument ? currentDrawingDocument.drawingName : '도면 없음'}
          </span>
          {currentDrawingDocument && (
            <span className="toolbar-chips">
              <span className="chip">{currentDrawingDocument.sourceFormat}</span>
              <span className="chip">{currentDrawingDocument.units}</span>
              <span className="chip">엔티티 {currentDrawingDocument.entities.length}</span>
              {skippedEntitySummary && <span className="chip chip-warn">생략 {skippedEntitySummary}</span>}
            </span>
          )}
        </div>
        <div className="canvas-wrap">
          <BlueprintCanvas
            drawingDocument={currentDrawingDocument}
            hiddenLayerNames={hiddenLayerNames}
          />
        </div>
      </main>
    </div>
  )
}

export default App
