import type { DrawingDocument } from '../types/drawing'

async function parseJsonOrThrow(response: Response): Promise<any> {
  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`
    try {
      const errorBody = await response.json()
      if (errorBody.detail) errorDetail = String(errorBody.detail)
    } catch {
      /* keep generic message */
    }
    throw new Error(errorDetail)
  }
  return response.json()
}

export async function uploadDrawingFile(selectedFile: File): Promise<DrawingDocument> {
  const formData = new FormData()
  formData.append('uploadedFile', selectedFile)
  const response = await fetch('/api/drawings/upload', {
    method: 'POST',
    body: formData,
  })
  return parseJsonOrThrow(response)
}

export async function generateDrawingFromPrompt(promptText: string): Promise<DrawingDocument> {
  const response = await fetch('/api/drawings/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ promptText }),
  })
  return parseJsonOrThrow(response)
}

export async function exportDrawingAsDxf(drawingDocument: DrawingDocument): Promise<void> {
  const response = await fetch('/api/drawings/export/dxf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(drawingDocument),
  })
  if (!response.ok) throw new Error(`내보내기 실패 (HTTP ${response.status})`)

  const dxfBlob = await response.blob()
  const downloadUrl = URL.createObjectURL(dxfBlob)
  const downloadAnchor = document.createElement('a')
  downloadAnchor.href = downloadUrl
  downloadAnchor.download = `${drawingDocument.drawingName}.dxf`
  downloadAnchor.click()
  URL.revokeObjectURL(downloadUrl)
}
