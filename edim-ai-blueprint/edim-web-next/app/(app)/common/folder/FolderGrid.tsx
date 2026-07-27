'use client'

/** Project Folder — 업로드·개별/ZIP 다운로드·DXF 드릴다운 (N5 복구). */
import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { uploadProjectFile, type ActState } from './actions'

export interface FolderFile {
  name: string; fileType: string; kind: string; kindTone: 'ok' | 'warn' | 'info'
  run: string; date: string; folder: string; fileId?: number; registrant?: string
  fileRole?: 'SOURCE' | 'OUTPUT' | 'RECEIVED'; immutable?: boolean
  currentRun?: boolean   // 18.82 — 현재 기준 Run 의 산출물인가(지난 Run 것과 구분)
}

const FOLDERS = ['RECEIVED', 'DWG', 'BOM', 'PRICE', 'DOC']

export function FolderGrid({ rows, project }: { rows: FolderFile[]; project: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [upSt, upAction, upPending] = useActionState(uploadProjectFile, {} as ActState)
  // 18.79 — ZIP 은 종전에 window.open 으로 새 탭을 열었다. 실패하면 사용자는 원시 JSON 이
  // 뜬 빈 탭을 보게 되고, '무엇을 하라' 는 안내(폴더로 나눠 받으라)가 화면에 남지 않는다.
  // 성공하면 그대로 내려받고, 실패하면 **사유를 이 화면에 적는다**.
  const [dlErr, setDlErr] = useState('')
  const [dlBusy, setDlBusy] = useState(false)
  const download = async (url: string, fallbackName: string) => {
    setDlErr(''); setDlBusy(true)
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try { detail = (await res.json())?.detail ?? detail } catch { /* 비 JSON */ }
        setDlErr(detail); return
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = fallbackName
      a.click(); URL.revokeObjectURL(a.href)
    } catch (e) {
      setDlErr(e instanceof Error ? e.message : '다운로드 실패')
    } finally { setDlBusy(false) }
  }
  // 백엔드 kind 값(한국어) → 로케일 표시 (값 자체는 서버 데이터라 클라이언트에서 매핑)
  const kindLabel: Record<string, string> = {
    '승인도': t('kind.dwgApproval', '승인도'), '견적/원가': t('kind.quoteCost', '견적/원가'),
    '기술자료': t('kind.techData', '기술자료'), '접수자료': t('kind.received', '접수자료'),
    '업로드': t('kind.upload', '업로드'),
    '산출물': t('kind.output', '산출물'), '작도 원본': t('kind.source', '작도 원본'),
  }

  const cols: GridColumn<FolderFile>[] = [
    { key: 'name', header: t('folder.fileName', '파일명'), render: (r) => r.name },
    { key: 'type', header: t('folder.typeCol', '유형'), width: 60, align: 'center', sortValue: (r) => r.fileType, render: (r) => r.fileType },
    { key: 'folder', header: t('run.folder', '폴더'), width: 100, align: 'center', sortValue: (r) => r.folder, render: (r) => r.folder },
    { key: 'kind', header: t('folder.kindCol', '종류'), width: 90, align: 'center', sortValue: (r) => r.kind, render: (r) => <Chip tone={r.kindTone}>{kindLabel[r.kind] ?? r.kind}</Chip> },
    // #53 — 산출물(납품물)은 불변: 편집·덮어쓰기가 서버에서 409 로 막힌다는 사실을 화면에서 알린다
    { key: 'lock', header: '', width: 26, align: 'center', render: (r) => r.immutable
      ? <span data-file-immutable title={t('folder.immutable', 'Run 산출물 — 편집·덮어쓰기 불가 (납품물 불변)')}>🔒</span>
      : <span style={{ color: 'var(--txt-mute)' }}>—</span> },
    // 18.82 — 지난 Run 의 산출물이 현재 납품물과 같은 얼굴로 섞이지 않게 '현재' 를 표시한다.
    { key: 'run', header: 'Run', width: 92, align: 'center', render: (r) => (
      <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
        {r.run || '—'}{r.currentRun ? <Chip tone="ok">{t('folder.currentRun', '현재')}</Chip> : null}
      </span>) },
    { key: 'reg', header: t('folder.registrant', '등록자'), width: 80, align: 'center', render: (r) => r.registrant || '—' },
    { key: 'date', header: t('folder.dateCol', '일자'), width: 96, align: 'center', render: (r) => r.date },
    { key: 'dl', header: '⬇', width: 40, align: 'center', render: (r) => r.fileId != null ? (
      <button className="b" style={{ height: 18, fontSize: 10 }} title={t('common.download', '다운로드')}
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
          <button className="b run" type="submit" disabled={upPending}>{t('folder.uploadBtn', '⬆ 업로드')}</button>
        </form>
        <button className="b" disabled={dlBusy} data-zip-all
          onClick={() => void download(`/api/next/bin?kind=zip&project=${encodeURIComponent(project)}`, `${project}.zip`)}>{t('folder.zipAll', '⬇ ZIP (전체)')}</button>
        <button className="b" data-export-package disabled={dlBusy} title={t('folder.exportPkgHint', '고객 전달용 — 최신 Run 산출물 + 작도 원본 ZIP + 전달 매니페스트 (내부 접수자료 제외, E2)')}
          onClick={() => void download(`/api/next/bin?kind=exportpkg&project=${encodeURIComponent(project)}`, `${project}-export.zip`)}>{t('folder.exportPkg', '⬇ 전달 패키지')}</button>
        {dlErr ? <span style={{ fontSize: 11, color: 'var(--err)' }} data-dl-err>{dlErr}</span> : null}
        {upSt.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{upSt.error}</span> : null}
        {upSt.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{upSt.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-folder" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.fileId ?? r.name}
          onRowDoubleClick={(r) => { if (r.fileType === 'DXF' && r.fileId != null) router.push(`/detail/cad-viewer?fileId=${r.fileId}`) }}
          emptyText={t('folder.empty', '파일이 없습니다')} />
      </div>
    </div>
  )
}
