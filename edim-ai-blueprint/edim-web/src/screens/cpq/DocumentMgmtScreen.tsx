/** M-5-4 Document Management 문서함 (W-11, 슬라이드 20·58) — 문서 통제 대장 ·
 *  상태 필터 · Grade 통제(S-1~S-n) · 더블클릭=문서 상세. */
import { useEffect, useMemo, useState } from 'react'
import type { DocRow } from '../../api/mock/dataMore'
import { docService } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const STAGES = ['Set-up', 'Check', 'Approve', 'Accepted']
const STATUS_TONE: Record<DocRow['status'], 'ok' | 'warn' | 'info'> = {
  'Set-up': 'info', Check: 'info', 'Approve 대기': 'warn', Accepted: 'ok',
}

export function DocumentMgmtScreen({ active }: ScreenProps) {
  const shell = useShell()
  const [docs, setDocs] = useState<DocRow[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('전체')
  const [search, setSearch] = useState('')
  const [selDoc, setSelDoc] = useState<string | null>(null)

  useEffect(() => {
    void docService.list().then((rows) => {
      setDocs(rows)
      setSelDoc(rows[0]?.docNo ?? null)
    })
  }, [])

  const rows = useMemo(() => docs.filter((d) =>
    (statusFilter === '전체' || d.status.startsWith(statusFilter))
    && (search.trim() === '' || (d.title + d.docNo).toLowerCase().includes(search.toLowerCase()))),
    [docs, statusFilter, search])

  useFKeys(active, useMemo(() => ({
    F8: () => shell.setStatusMsg(`조회 — ${rows.length}건 (Grade 미달 문서는 마스킹, DOC-002)`),
  }), [rows.length])) // eslint-disable-line react-hooks/exhaustive-deps

  const sel = docs.find((d) => d.docNo === selDoc) ?? null
  const stageIdx = sel ? STAGES.findIndex((s) => sel.status.startsWith(s)) : -1

  const counts = STAGES.map((s) => docs.filter((d) => d.status.startsWith(s)).length)

  const cols: GridColumn<DocRow>[] = [
    { key: 'no', header: 'DOC No.', width: 92, code: true, render: (r) => r.docNo },
    { key: 'title', header: 'Title', render: (r) => r.title },
    { key: 'p', header: 'Person', width: 48, align: 'center', render: (r) => r.person },
    { key: 'd', header: 'date', width: 46, align: 'center', render: (r) => r.date },
    {
      key: 'st', header: 'Released Status', width: 90, align: 'center',
      render: (r) => <Chip tone={STATUS_TONE[r.status]}>{r.status}</Chip>,
    },
    { key: 'ap', header: 'Approver', width: 56, align: 'center', render: (r) => r.approver },
    { key: 'ad', header: 'App. Date', width: 58, align: 'center', render: (r) => r.appDate },
    { key: 'v', header: 'Version', width: 52, align: 'center', code: true, render: (r) => r.version },
    { key: 'g', header: 'Grade', width: 44, align: 'center', render: (r) => <Chip tone="warn">{r.grade}</Chip> },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>문서 유형</label>
        <Combo width={80} value="전체" options={['전체', 'Technical', 'General']} />
        <label>Grade</label>
        <Combo width={64} value="전체" options={['전체', 'S-1', 'S-2', 'S-3']} />
        <label>검색</label>
        <input className="in" style={{ width: 160 }} value={search} aria-label="검색"
          onChange={(e) => setSearch(e.target.value)} />
        <span style={{ flex: 1 }} />
        <Btn variant="pri">＋ 문서 등록</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 158, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <GroupBox title="상태 필터" noPad>
            <div className="tree2">
              <div className={`tn ${statusFilter === '전체' ? 'sel' : ''}`}
                onClick={() => setStatusFilter('전체')}>
                <span className="pm">·</span>전체 ({docs.length})
              </div>
              {STAGES.map((s, i) => (
                <div key={s} className={`tn l2 ${statusFilter === s ? 'sel' : ''}`}
                  onClick={() => setStatusFilter(s)}>
                  <span className="pm">·</span>{s} ({counts[i]})
                </div>
              ))}
            </div>
          </GroupBox>
          <GroupBox title="분류" noPad>
            <div className="tree2">
              <div className="tn"><span className="pm">−</span>Product</div>
              <div className="tn l2 sel"><span className="pm">·</span>AHU · Fan</div>
              <div className="tn"><span className="pm">+</span>Technical · General</div>
            </div>
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 6, overflow: 'auto' }}>
          <GroupBox title={`문서 대장 — ${rows.length}건 (더블클릭=문서 상세)`} noPad style={{ flex: 1 }}>
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.docNo}
              selectedKey={selDoc} onRowClick={(r) => setSelDoc(r.docNo)}
              onRowDoubleClick={(r) => shell.openTab({
                id: `doc-detail:${r.docNo}`, screenId: 'doc-detail',
                code: '문서', title: r.docNo,
                params: { file: `${r.title} (${r.docNo})`, folder: 'DATA', fileType: 'PDF', status: r.status },
              })} />
          </GroupBox>
          {sel ? (
            <GroupBox title={`선택 문서 — ${sel.title} · Progress`}>
              <div className="flow">
                {STAGES.map((s, i) => (
                  <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span className={`fs ${i < stageIdx ? 'done' : i === stageIdx ? 'now' : ''}`}>{s}</span>
                    {i < STAGES.length - 1 ? <span className="ar">→</span> : null}
                  </span>
                ))}
              </div>
              <div className="frm" style={{ marginTop: 6 }}>
                <label>Management Grade</label>
                <Combo value={sel.grade} options={['S-1', 'S-2', 'S-3']} />
                <label>Version</label>
                <input className="in ro" value={sel.version} readOnly aria-label="Version" />
              </div>
            </GroupBox>
          ) : null}
        </div>
        <div className="split-h" />
        <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="미리보기 — Grade 통제">
            <div className="cvs" style={{ height: 150 }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, color: 'var(--txt-mute)', textAlign: 'center' }}>
                {sel ? `${sel.title} 미리보기` : '문서 선택'}<br />
              </div>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 3 }}>
              권한 미달 시 차단·목록 마스킹 (DOC-002)
            </div>
          </GroupBox>
          <GroupBox title="Print" right={<Btn style={{ height: 18, fontSize: 10 }}
            onClick={() => shell.setStatusMsg('Print — 워터마크·출력 통제 적용 (Security Solution 협의)')}>🖨</Btn>}>
            <div style={{ fontSize: 10, color: 'var(--txt-dim)' }}>워터마크·출력 통제 적용</div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
