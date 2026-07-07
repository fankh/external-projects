import { useEffect, useState } from 'react'
import {
  fetchModelCatalog,
  generateDrawingFromPrompt,
  type ModelOption,
} from '../api/blueprintApiClient'
import { SparklesIcon } from './Icons'
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
  const [isAiEnabled, setIsAiEnabled] = useState(true)

  useEffect(() => {
    fetchModelCatalog()
      .then((catalog) => {
        setModelOptions(catalog.models)
        setSelectedModelId(catalog.defaultModelId)
        setIsAiEnabled(catalog.aiEnabled)
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
    <section className="card">
      <div className="card-head">
        <span className="card-icon">
          <SparklesIcon />
        </span>
        <span className="card-title">AI 도면 생성</span>
        {!isAiEnabled && <span className="card-sub">샘플 모드</span>}
      </div>
      <div className="card-body">
        {!isAiEnabled && (
          <p className="field-hint">API 키 미설정 · 프롬프트와 무관한 샘플 도면을 반환합니다</p>
        )}
        {modelOptions.length > 0 && (
          <div>
            <label className="field-label" htmlFor="model-select">모델</label>
            <select
              className="select"
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
            {selectedModel && <p className="field-hint">{selectedModel.description}</p>}
          </div>
        )}
        <textarea
          className="textarea"
          value={promptText}
          onChange={(changeEvent) => setPromptText(changeEvent.target.value)}
          placeholder="예: 스마트폰 전면 외형도 — 화면, 후면 카메라, 측면 버튼"
          rows={3}
        />
        <button
          className="btn btn-primary btn-block"
          onClick={() => void requestGeneration()}
          disabled={isGenerating || !promptText.trim()}
        >
          <SparklesIcon size={16} />
          {isGenerating ? '생성 중…' : '도면 생성'}
        </button>
        {generationErrorMessage && <p className="error-message">{generationErrorMessage}</p>}
      </div>
    </section>
  )
}
