import { useState } from 'react'
import './App.css'
import { AiPromptPanel } from './components/AiPromptPanel'
import { BlueprintCanvas } from './components/BlueprintCanvas'
import { FileUploadPanel } from './components/FileUploadPanel'
import { LayerListPanel } from './components/LayerListPanel'
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
    <div className="app-layout">
      <aside className="sidebar">
        <h1>ian-ai-blueprint</h1>
        <FileUploadPanel onDrawingLoaded={loadDrawingDocument} />
        <AiPromptPanel onDrawingGenerated={loadDrawingDocument} />
        <LayerListPanel
          layers={currentDrawingDocument?.layers ?? []}
          hiddenLayerNames={hiddenLayerNames}
          onToggleLayerVisibility={toggleLayerVisibility}
        />
        {currentDrawingDocument && (
          <section className="sidebar-section">
            <h2>내보내기</h2>
            <button
              onClick={() => {
                setExportErrorMessage(null)
                exportDrawingAsDxf(currentDrawingDocument).catch((exportError) =>
                  setExportErrorMessage(
                    exportError instanceof Error ? exportError.message : String(exportError)))
              }}
            >
              DXF 내보내기
            </button>
            {exportErrorMessage && <p className="error-message">{exportErrorMessage}</p>}
          </section>
        )}
        {currentDrawingDocument && (
          <footer className="drawing-info">
            <div>{currentDrawingDocument.drawingName}</div>
            <div>
              {currentDrawingDocument.sourceFormat} · {currentDrawingDocument.units} ·{' '}
              엔티티 {currentDrawingDocument.entities.length}개
            </div>
            {skippedEntitySummary && <div>미지원 생략: {skippedEntitySummary}</div>}
          </footer>
        )}
      </aside>
      <main className="canvas-area">
        <BlueprintCanvas
          drawingDocument={currentDrawingDocument}
          hiddenLayerNames={hiddenLayerNames}
        />
      </main>
    </div>
  )
}

export default App
