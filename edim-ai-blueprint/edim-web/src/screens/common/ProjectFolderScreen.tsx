/** M-15-8/9 Project Folder·이력 조회 (W-24, 슬라이드 64) — 폴더 5종 자동 분류
 *  (dwg_file.folder CHECK) · sys_history diff. */
import { useEffect, useRef, useState } from 'react'
import { FOLDERS } from '../../api/mock/dataMore'
import { fileService, historyService, type FolderFileEx, type HistoryRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

export function ProjectFolderScreen(_props: ScreenProps) {
  const shell = useShell()
  const [folder, setFolder] = useState<string>('DWG')
  const [selFile, setSelFile] = useState<string | null>(null)
  const [hist, setHist] = useState<HistoryRow[]>([])
  const [files, setFiles] = useState<FolderFileEx[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  const loadFiles = () => void fileService.list('PS-61313-5').then(setFiles)

  useEffect(() => {
    void historyService.recent().then(setHist)
    loadFiles()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const upload = (f: globalThis.File) => {
    void (async () => {
      try {
        const ok = await fileService.upload(f, folder, 'PS-61313-5')
        if (ok) {
          loadFiles()
          shell.setStatusMsg(`업로드 — ${f.name} → ${folder}/ (MinIO 버킷 edim + dwg_file 등록)`)
        } else {
          shell.setStatusMsg('업로드 — 백엔드 불가 (mock 모드)')
        }
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '업로드 실패'}</span>)
      }
    })()
  }

  const rows = files.filter((f) => f.folder === folder)
  const sel = files.find((f) => f.name === selFile) ?? null

  const cols: GridColumn<FolderFileEx>[] = [
    { key: 'name', header: '파일명', code: true, render: (r) => r.name },
    { key: 'type', header: '유형', width: 44, align: 'center', render: (r) => r.fileType },
    {
      key: 'kind', header: '구분', width: 62, align: 'center',
      render: (r) => <Chip tone={r.kindTone}>{r.kind}</Chip>,
    },
    { key: 'run', header: 'Run', width: 36, align: 'center', code: true, render: (r) => r.run },
    { key: 'date', header: '일자', width: 46, align: 'center', render: (r) => r.date },
    {
      key: 'dl', header: '', width: 36, align: 'center',
      render: (r) => (
        <span className="b ic" style={{ height: 18, width: 18, fontSize: 10 }}
          onClick={() => {
            if (r.fileId != null) {
              void fileService.download(r.fileId, r.name)
                .then(() => shell.setStatusMsg(`다운로드 — ${r.name} (MinIO 스트리밍)`))
                .catch((e: Error) => shell.setStatusMsg(
                  <span style={{ color: 'var(--err)' }}>{e.message}</span>))
            } else {
              shell.setStatusMsg(`${r.name} — Run 산출물 바이너리 생성은 S5 (Run 파이프라인 실체화)`)
            }
          }}>⬇</span>
      ),
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Project</label>
        <Combo width={110} value="Micron #7" options={['Micron #7', 'PS-598']} />
        <span style={{ fontFamily: 'Consolas, monospace', color: 'var(--title-navy)' }}>PS-61313-5</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          EDIM Run 산출물 자동 저장 규약 (개요 §6) — dwg_file.folder CHECK 5종
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 168, flex: 'none' }}>
          <GroupBox title="Folder — PS-61313-5" noPad>
            <div className="tree2">
              {FOLDERS.map((f) => (
                <div key={f.name} className={`tn l2 ${folder === f.name ? 'sel' : ''}`}
                  onClick={() => { setFolder(f.name); setSelFile(null) }}>
                  <span className="ico">📁</span>{f.name} ({files.filter((x) => x.folder === f.name).length})
                </div>
              ))}
            </div>
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 6, overflow: 'auto' }}>
          <GroupBox title={`${folder} — ${rows.length}건`} noPad>
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.name}
              selectedKey={selFile} onRowClick={(r) => setSelFile(r.name)} />
          </GroupBox>
          <GroupBox title="이력 조회 (sys_history) — diff = before/after JSON 비교" noPad
            right={<Combo width={84} value="대상: 전체" options={['대상: 전체', 'Run', 'Code']} />}>
            <table className="g">
              <thead><tr><th>일시</th><th>대상</th><th>작업</th><th>작업자</th><th></th></tr></thead>
              <tbody>
                {hist.map((h, i) => (
                  <tr key={i}>
                    <td className="c">{h.at}</td>
                    <td className="code">{h.target}</td>
                    <td>{h.action}</td>
                    <td className="c">{h.by}</td>
                    <td className="c">
                      <span className="b" style={{ height: 18, fontSize: 10 }}
                        onClick={() => shell.setStatusMsg(`diff — ${h.target} before/after JSON 비교`)}>diff</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="선택 파일">
            <div className="cvs" style={{ height: 110 }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, color: 'var(--txt-mute)', textAlign: 'center' }}>
                {sel ? `${sel.name} 미리보기` : '파일을 선택하십시오'}
              </div>
            </div>
            {sel ? (
              <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', marginTop: 4, lineHeight: 1.7 }}>
                {sel.fileType} · Run {sel.run} · {sel.date}<br />연결 도면: KDCR 3-13 (Rev.B)
              </div>
            ) : null}
          </GroupBox>
          <GroupBox title="일괄 작업">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <input ref={fileInput} type="file" style={{ display: 'none' }} aria-label="업로드 파일"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) upload(f)
                  e.target.value = ''
                }} />
              <Btn variant="pri" onClick={() => fileInput.current?.click()}>⬆ 업로드 ({folder})</Btn>
              <Btn onClick={() => shell.setStatusMsg(`ZIP 다운로드 — ${folder} ${rows.length}건`)}>ZIP 다운로드</Btn>
              <Btn onClick={() => shell.setStatusMsg('고객 전달용 — 워터마크·Grade 통제 적용 내보내기')}>고객 전달용 내보내기</Btn>
            </div>
          </GroupBox>
          <GroupBox title="RECEIVED 폴더">
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.7 }}>
              접수 자료(S-3-5) + 데이터 이행 원본 보존 (이행계획서 §2-4)
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
