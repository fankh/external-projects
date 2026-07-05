import { useState } from 'react'
import { generateDrawingFromPrompt } from '../api/blueprintApiClient'
import type { DrawingDocument } from '../types/drawing'

interface AiPromptPanelProps {
  onDrawingGenerated: (drawingDocument: DrawingDocument) => void
}

export function AiPromptPanel({ onDrawingGenerated }: AiPromptPanelProps) {
  const [promptText, setPromptText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationErrorMessage, setGenerationErrorMessage] = useState<string | null>(null)

  const requestGeneration = async () => {
    if (!promptText.trim() || isGenerating) return
    setIsGenerating(true)
    setGenerationErrorMessage(null)
    try {
      onDrawingGenerated(await generateDrawingFromPrompt(promptText))
    } catch (generationError) {
      setGenerationErrorMessage(
        generationError instanceof Error ? generationError.message : String(generationError))
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <section className="sidebar-section">
      <h2>AI 도면 생성</h2>
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
