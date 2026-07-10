/** M-4-1 도면 대장 (B7) — dwg_drawing·dwg_revision·dwg_supersedure 실배선.
 *  등록(F2)·Rev 올리기·Supersedure 대체 등록, 더블클릭=연결 DXF CAD 뷰어. */
import { useEffect, useMemo, useState } from 'react'
import {
  drawingLedgerService, type DrawingRow, type RevisionRow, type SupersedureRow,
} from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'info' | 'err'> = {
  DRAFT: 'warn', REVIEW: 'info', APPROVED: 'ok', RELEASED: 'info',
}

export function DrawingLedgerScreen({ active, tab }: ScreenProps) {
  const shell = useShell()
  const [drawings, setDrawings] = useState<DrawingRow[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [revs, setRevs] = useState<RevisionRow[]>([])
  const [sups, setSups] = useState<SupersedureRow[]>([])
  const [showReg, setShowReg] = useState(false)
  const [reg, setReg] = useState({ drawingNo: '', name: '', drawingType: 'PART', kind: 'STANDARD' })
  const [revReason, setRevReason] = useState('')
  const [supForm, setSupForm] = useState({ oldNo: '', newNo: '', reason: '' })

  const load = () => {
    void drawingLedgerService.list().then(setDrawings)
    void drawingLedgerService.supersedures().then(setSups)
  }
  useEffect(load, [])

  // 코드 상세 "도면 열기" 등에서 params.select 로 진입 시 해당 행 선택
  useEffect(() => {
    const want = tab.params?.select
    if (typeof want === 'string') setSel(want)
  }, [tab.params?.select])

  useEffect(() => {
    if (!sel) { setRevs([]); return }
    void drawingLedgerService.revisions(sel).then(setRevs)
  }, [sel])

  const selected = useMemo(() => drawings.find((d) => d.drawingNo === sel), [drawings, sel])

  const register = () => {
    if (!reg.drawingNo.trim() || !reg.name.trim()) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>필수(노란 셀) — 도면번호·도면명 입력</span>)
      return
    }
    void (async () => {
      try {
        const ok = await drawingLedgerService.create({
          drawingNo: reg.drawingNo.trim(), name: reg.name.trim(),
          drawingType: reg.drawingType, kind: reg.kind,
        })
        if (!ok) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>등록 불가 — 백엔드 연결 필요</span>)
          return
        }
        setShowReg(false)
        setSel(reg.drawingNo.trim())
        load()
        shell.setStatusMsg(`도면 등록 ✓ — ${reg.drawingNo} Rev.A DRAFT (dwg_drawing)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '등록 실패'}</span>)
      }
    })()
  }

  const revUp = () => {
    if (!selected) {
      shell.setStatusMsg(<span style={{ color: 'var(--warn)' }}>Rev 올리기 — 대상 도면 행을 선택하십시오</span>)
      return
    }
    void (async () => {
      try {
        const rev = await drawingLedgerService.revUp(selected.drawingNo, revReason.trim())
        if (rev == null) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>Rev 올리기 불가 — 백엔드 연결 필요</span>)
          return
        }
        setRevReason('')
        load()
        void drawingLedgerService.revisions(selected.drawingNo).then(setRevs)
        shell.setStatusMsg(`Rev 올리기 ✓ — ${selected.drawingNo} Rev.${selected.rev} → Rev.${rev} (dwg_revision)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : 'Rev 올리기 실패'}</span>)
      }
    })()
  }

  const supersede = () => {
    const { oldNo, newNo } = supForm
    if (!oldNo || !newNo) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>대체 등록 — 구도면·신도면을 선택하십시오</span>)
      return
    }
    if (oldNo === newNo) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>구도면과 신도면이 같습니다</span>)
      return
    }
    void (async () => {
      try {
        const ok = await drawingLedgerService.supersede(oldNo, newNo, supForm.reason.trim())
        if (!ok) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>대체 등록 불가 — 백엔드 연결 필요</span>)
          return
        }
        setSupForm({ oldNo: '', newNo: '', reason: '' })
        load()
        shell.setStatusMsg(`Supersedure ✓ — ${oldNo} → ${newNo} (dwg_supersedure)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '대체 등록 실패'}</span>)
      }
    })()
  }

  const openCad = (r: DrawingRow) => {
    if (r.fileId) {
      shell.openTab({
        id: `cad-viewer:${r.fileId}`, screenId: 'cad-viewer',
        code: 'CAD', title: (r.fileName ?? r.drawingNo).slice(0, 16),
        params: { fileId: r.fileId, name: r.fileName ?? r.drawingNo, from: tab.id },
      })
    } else {
      shell.setStatusMsg(<span style={{ color: 'var(--warn)' }}>
        {r.drawingNo} — 연결된 DXF 없음 (EDIM Run 산출물 생성 시 자동 연결)</span>)
    }
  }

  useFKeys(active, useMemo(() => ({
    F2: () => setShowReg(true),
    F8: () => { load(); shell.setStatusMsg('도면 대장 재조회 (dwg_drawing)') },
  }), [])) // eslint-disable-line react-hooks/exhaustive-deps

  const cols: GridColumn<DrawingRow>[] = [
    { key: 'no', header: 'Drawing No.', width: 96, code: true, render: (r) => r.drawingNo },
    { key: 'name', header: '도면명', render: (r) => r.name },
    { key: 'type', header: '유형', width: 72, align: 'center', render: (r) => r.type },
    { key: 'kind', header: 'Kind', width: 100, align: 'center', render: (r) => r.kind },
    { key: 'rev', header: 'Rev', width: 40, align: 'center', render: (r) => <b>{r.rev}</b> },
    { key: 'revc', header: 'Rev수', width: 40, align: 'right', render: (r) => r.revCount },
    {
      key: 'st', header: '상태', width: 78, align: 'center',
      render: (r) => (
        <>
          <Chip tone={STATUS_TONE[r.status] ?? 'info'}>{r.status}</Chip>
          {r.superseded ? <Chip tone="err">대체됨</Chip> : null}
        </>
      ),
    },
    { key: 'file', header: '파일 (DXF)', width: 130, render: (r) => r.fileName ?? '-' },
  ]

  const nos = drawings.map((d) => d.drawingNo)

  return (
    <div className="fill-col">
      <div className="qband">
        <label>도면 대장</label>
        <Chip tone="info">dwg_drawing {drawings.length}건</Chip>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>더블클릭 = 연결 DXF CAD 뷰어</span>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => { load(); shell.setStatusMsg('도면 대장 재조회 (dwg_drawing)') }}>조회 F8</Btn>
        <Btn variant="pri" onClick={() => setShowReg(true)}>＋ 도면 등록 F2</Btn>
      </div>
      {showReg ? (
        <div data-dwg-reg style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowReg(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 340, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>도면 등록 — dwg_drawing</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowReg(false)}>✕</span>
            </div>
            <div className="frm c2" style={{ padding: 10 }}>
              <label>도면번호 *</label>
              <input className="in req" value={reg.drawingNo} aria-label="등록 도면번호"
                placeholder="예: KDCR 3-15"
                onChange={(e) => setReg({ ...reg, drawingNo: e.target.value })} />
              <label>도면명 *</label>
              <input className="in req" value={reg.name} aria-label="등록 도면명"
                onChange={(e) => setReg({ ...reg, name: e.target.value })} />
              <label>유형</label>
              <Combo width={140} value={reg.drawingType} options={['PART', 'ASSEMBLY', 'LAYOUT']}
                onChange={(v) => setReg({ ...reg, drawingType: v })} />
              <label>Kind</label>
              <Combo width={140} value={reg.kind} options={['STANDARD', 'APPROVAL', 'MANUFACTURING']}
                onChange={(v) => setReg({ ...reg, kind: v })} />
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowReg(false)}>취소</Btn>
              <Btn variant="pri" onClick={register}>등록 F12</Btn>
            </div>
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1.3, overflow: 'auto' }}>
          <GroupBox title={`도면 목록 — ${drawings.length}건 (클릭=Rev 이력)`} noPad style={{ flex: 1 }}>
            <DenseGrid columns={cols} rows={drawings} rowKey={(r) => r.drawingNo}
              selectedKey={sel} onRowClick={(r) => setSel(r.drawingNo)}
              onRowDoubleClick={openCad} />
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 330, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title={`Rev 이력${sel ? ` — ${sel}` : ''} (dwg_revision)`} noPad>
            {sel ? (
              <>
                <table className="g">
                  <thead><tr><th>Rev</th><th>일자</th><th>사유</th><th>처리자</th></tr></thead>
                  <tbody>
                    {revs.map((r) => (
                      <tr key={r.rev}>
                        <td className="c"><b>{r.rev}</b></td>
                        <td className="c">{r.date}</td>
                        <td>{r.reason}</td>
                        <td className="c">{r.by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: 4, padding: 6, alignItems: 'center' }}>
                  <input className="in" style={{ flex: 1 }} value={revReason} aria-label="Rev 사유"
                    placeholder="개정 사유" onChange={(e) => setRevReason(e.target.value)} />
                  <Btn variant="pri" onClick={revUp}>
                    Rev 올리기{selected ? ` (${selected.rev}→다음)` : ''}
                  </Btn>
                </div>
              </>
            ) : (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
                좌측 도면 행을 선택하면 Rev 이력이 표시됩니다
              </div>
            )}
          </GroupBox>
          <GroupBox title={`Supersedure — ${sups.length}건 (dwg_supersedure)`} noPad
            right={<span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>구도면 → 신도면 대체</span>}>
            {sups.length ? (
              <table className="g">
                <thead><tr><th>구도면</th><th>신도면</th><th>일자</th></tr></thead>
                <tbody>
                  {sups.map((s, i) => (
                    <tr key={i} title={s.reason}>
                      <td className="c" style={{ fontFamily: 'Consolas, monospace' }}>{s.oldNo}</td>
                      <td className="c" style={{ fontFamily: 'Consolas, monospace' }}>
                        {s.newNo} <b>Rev.{s.newRev}</b>
                      </td>
                      <td className="c">{s.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>대체 이력 없음</div>
            )}
            <div className="frm c2" style={{ padding: 6, borderTop: '1px solid var(--line-soft)' }}>
              <label>구도면</label>
              <Combo width={150} value={supForm.oldNo || '(선택)'} options={['(선택)', ...nos]}
                onChange={(v) => setSupForm({ ...supForm, oldNo: v === '(선택)' ? '' : v })} />
              <label>신도면</label>
              <Combo width={150} value={supForm.newNo || '(선택)'} options={['(선택)', ...nos]}
                onChange={(v) => setSupForm({ ...supForm, newNo: v === '(선택)' ? '' : v })} />
              <label>사유</label>
              <input className="in" value={supForm.reason} aria-label="대체 사유"
                onChange={(e) => setSupForm({ ...supForm, reason: e.target.value })} />
            </div>
            <div style={{ textAlign: 'right', padding: '0 6px 6px' }}>
              <Btn onClick={supersede}>대체 등록</Btn>
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
