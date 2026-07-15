'use client'

/** Project Folder — 업로드·개별/ZIP 다운로드·DXF 드릴다운 (N5 복구). */
import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { uploadProjectFile, type ActState } from './actions'

export interface FolderFile {
  name: string; fileType: string; kind: string; kindTone: 'ok' | 'warn' | 'info'
  run: string; date: string; folder: string; fileId?: number; registrant?: string
}

const FOLDERS = ['RECEIVED', 'DWG', 'BOM', 'PRICE', 'DOC']

export function FolderGrid({ rows, project }: { rows: FolderFile[]; project: string }) {
  const router = useRouter()
  const [upSt, upAction, upPending] = useActionState(uploadProjectFile, {} as ActState)

  const cols: GridColumn<FolderFile>[] = [
    { key: 'name', header: '파일명', render: (r) => r.name },
    { key: 'type', header: '유형', width: 60, align: 'center', sortValue: (r) => r.fileType, render: (r) => r.fileType },
    { key: 'folder', header: '폴더', width: 100, align: 'center', sortValue: (r) => r.folder, render: (r) => r.folder },
    { key: 'kind', header: '종류', width: 90, align: 'center', sortValue: (r) => r.kind, render: (r) => <Chip tone={r.kindTone}>{r.kind}</Chip> },
    { key: 'run', header: 'Run', width: 60, align: 'center', render: (r) => r.run || '—' },
    { key: 'reg', header: '등록자', width: 80, align: 'center', render: (r) => r.registrant || '—' },
    { key: 'date', header: '일자', width: 96, align: 'center', render: (r) => r.date },
    { key: 'dl', header: '⬇', width: 40, align: 'center', render: (r) => r.fileId != null ? (
      <button className="b" style={{ height: 18, fontSize: 10 }} title="다운로드"
        onClick={() => window.open(`/api/next/bin?kind=file&id=${r.fileId}&name=${encodeURIComponent(r.name)}`, '_blank')}>⬇</button>
    ) : '—' },
  ]

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11 }}>Project</label>
        <input className="in" defaultValue={project} style={{ height: 22, fontSize: 11, width: 110 }}
          onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/common/folder?project=${encodeURIComponent((e.target as HTMLInputElement).value)}`) }} />
        <form action={upAction} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="hidden" name="project" value={project} />
          <select className="in" name="folder" defaultValue="RECEIVED" style={{ width: 92 }}>
            {FOLDERS.map((f) => <option key={f}>{f}</option>)}
          </select>
          <input className="in" type="file" name="uploadedFile" style={{ width: 190, fontSize: 10 }} />
          <button className="b run" type="submit" disabled={upPending}>⬆ 업로드</button>
        </form>
        <button className="b" onClick={() => window.open(`/api/next/bin?kind=zip&project=${encodeURIComponent(project)}`, '_blank')}>⬇ ZIP (전체)</button>
        {upSt.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{upSt.error}</span> : null}
        {upSt.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{upSt.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-folder" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.fileId ?? r.name}
          onRowDoubleClick={(r) => { if (r.fileType === 'DXF' && r.fileId != null) router.push(`/detail/cad-viewer?fileId=${r.fileId}`) }}
          emptyText="파일이 없습니다" />
      </div>
    </div>
  )
}
