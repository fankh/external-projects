'use client'

import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'

export interface FolderFile {
  name: string; fileType: string; kind: string; kindTone: 'ok' | 'warn' | 'info'
  run: string; date: string; folder: string; fileId?: number; registrant?: string
}

const cols: GridColumn<FolderFile>[] = [
  { key: 'name', header: '파일명', render: (r) => r.name },
  { key: 'type', header: '유형', width: 60, align: 'center', sortValue: (r) => r.fileType, render: (r) => r.fileType },
  { key: 'folder', header: '폴더', width: 100, align: 'center', sortValue: (r) => r.folder, render: (r) => r.folder },
  { key: 'kind', header: '종류', width: 90, align: 'center', sortValue: (r) => r.kind, render: (r) => <Chip tone={r.kindTone}>{r.kind}</Chip> },
  { key: 'run', header: 'Run', width: 60, align: 'center', render: (r) => r.run || '—' },
  { key: 'reg', header: '등록자', width: 80, align: 'center', render: (r) => r.registrant || '—' },
  { key: 'date', header: '일자', width: 96, align: 'center', render: (r) => r.date },
]

export function FolderGrid({ rows, project }: { rows: FolderFile[]; project: string }) {
  const router = useRouter()
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px' }}>
        <label style={{ fontSize: 11 }}>Project</label>
        <input className="in" defaultValue={project} style={{ height: 22, fontSize: 11, width: 120 }}
          onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/common/folder?project=${encodeURIComponent((e.target as HTMLInputElement).value)}`) }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>Enter 로 프로젝트 전환</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-folder" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.fileId ?? r.name} emptyText="파일이 없습니다" />
      </div>
    </div>
  )
}
