import { useRef, useState, type DragEvent } from 'react'
import { uploadDrawingFile } from '../api/blueprintApiClient'
import type { DrawingDocument } from '../types/drawing'

interface FileUploadPanelProps {
  onDrawingLoaded: (drawingDocument: DrawingDocument) => void
}

export function FileUploadPanel({ onDrawingLoaded }: FileUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  const uploadSelectedFile = async (selectedFile: File) => {
    setIsUploading(true)
    setUploadErrorMessage(null)
    try {
      onDrawingLoaded(await uploadDrawingFile(selectedFile))
    } catch (uploadError) {
      setUploadErrorMessage(uploadError instanceof Error ? uploadError.message : String(uploadError))
    } finally {
      setIsUploading(false)
    }
  }

  const handleDrop = (dropEvent: DragEvent) => {
    dropEvent.preventDefault()
    setIsDragActive(false)
    const droppedFile = dropEvent.dataTransfer.files[0]
    if (droppedFile) void uploadSelectedFile(droppedFile)
  }

  return (
    <section className="sidebar-section">
      <h2>CAD 파일 업로드</h2>
      <div
        className={`upload-dropzone${isDragActive ? ' drag-active' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(dragEvent) => { dragEvent.preventDefault(); setIsDragActive(true) }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
      >
        {isUploading ? '업로드 중…' : 'DXF · DWG · IFC 파일을 끌어다 놓거나 클릭'}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".dxf,.dwg,.ifc"
        hidden
        onChange={(changeEvent) => {
          const selectedFile = changeEvent.target.files?.[0]
          if (selectedFile) void uploadSelectedFile(selectedFile)
          changeEvent.target.value = ''
        }}
      />
      {uploadErrorMessage && <p className="error-message">{uploadErrorMessage}</p>}
    </section>
  )
}
