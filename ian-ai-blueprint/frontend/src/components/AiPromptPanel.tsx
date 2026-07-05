import { useEffect, useState } from 'react'
import {
  fetchModelCatalog,
  generateDrawingFromPrompt,
  type ModelOption,
} from '../api/blueprintApiClient'
import type { DrawingDocument } from '../types/drawing'

interface AiPromptPanelProps {
  onDrawingGenerated: (drawingDocument: DrawingDocument) => void
}

export function AiPromptPanel({ onDrawingGenerated }: AiPromptPanelProps) {
  const [promptText, setPromptText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationErrorMessage, setGenerationErrorMessage] = useState<string | null>(null)
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')

  useEffect(() => {
    fetchModelCatalog()
      .then((catalog) => {
        setModelOptions(catalog.models)
        setSelectedModelId(catalog.defaultModelId)
      })
      .catch(() => {
        /* model picker stays empty; backend default is used */
      })
  }, [])

  const requestGeneration = async () => {
    if (!promptText.trim() || isGenerating) return
    setIsGenerating(true)
    setGenerationErrorMessage(null)
    try {
      onDrawingGenerated(await generateDrawingFromPrompt(promptText, selectedModelId || undefined))
    } catch (generationError) {
      setGenerationErrorMessage(
        generationError instanceof Error ? generationError.message : String(generationError))
    } finally {
      setIsGenerating(false)
    }
  }

  const selectedModel = modelOptions.find((option) => option.id === selectedModelId)

  return (
    <section className="sidebar-section">
      <h2>AI 도면 생성</h2>
      {modelOptions.length > 0 && (
        <div className="model-picker">
          <label htmlFor="model-select">모델</label>
          <select
            id="model-select"
            value={selectedModelId}
            onChange={(changeEvent) => setSelectedModelId(changeEvent.target.value)}
            disabled={isGenerating}
          >
            {modelOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {selectedModel && <p className="model-hint">{selectedModel.description}</p>}
        </div>
      )}
      <textarea
        value={promptText}
        onChange={(changeEvent) => setPromptText(changeEvent.target.value)}
        placeholder="예: 방 2개와 욕실이 있는 작은 주택 평면도"
        rows={3}
      />
      <button onClick={() => void requestGeneration()} disabled={isGenerating || !promptText.trim()}>
        {isGenerating ? '생성 중…' : '생성'}
      </button>
      {generationErrorMessage && <p className="error-message">{generationErrorMessage}</p>}
    </section>
  )
}
