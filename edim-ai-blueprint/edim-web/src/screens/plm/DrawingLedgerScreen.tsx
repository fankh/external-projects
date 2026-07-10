/** M-4-1 도면 대장 (B7) — dwg_drawing·dwg_revision·dwg_supersedure 실배선.
 *  등록(F2)·Rev 올리기·Supersedure 대체 등록, 더블클릭=연결 DXF CAD 뷰어. */
import { useEffect, useMemo, useState } from 'react'
import {
  drawingLedgerService, referencerService,
  type DrawingFileRow, type DrawingRow, type DrawingVariantRow, type DwgApprovalRow,
  type ReferencerRow, type RevisionRow, type SupersedureRow,
} from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'info' | 'err'> = {
  DRAFT: 'warn', REVIEW: 'info', APPROVED: 'ok', RELEASED: 'info',
}

export function DrawingLedgerScreen({ active, tab }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [drawings, setDrawings] = useState<DrawingRow[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [revs, setRevs] = useState<RevisionRow[]>([])
  const [sups, setSups] = useState<SupersedureRow[]>([])
  const [showReg, setShowReg] = useState(false)
  const [reg, setReg] = useState({ drawingNo: '', name: '', drawingType: 'PART', kind: 'STANDARD' })
  const [revReason, setRevReason] = useState('')
  const [supForm, setSupForm] = useState({ oldNo: '', newNo: '', reason: '' })
  // B16 상세 탭 — Rev | 승인 단계 | Variants | Referencers | 첨부
  const [dtab, setDtab] = useState<'rev' | 'appr' | 'var' | 'ref' | 'att'>('rev')
  const [variants, setVariants] = useState<DrawingVariantRow[] | null>(null)
  const [refs, setRefs] = useState<ReferencerRow[] | null>(null)
  const [files, setFiles] = useState<DrawingFileRow[] | null>(null)

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

  // 상세 탭 데이터 — 선택/탭 변경 시 해당 탭만 조회
  useEffect(() => {
    if (!sel) return
    if (dtab === 'var') void drawingLedgerService.variants(sel).then(setVariants)
    else if (dtab === 'ref') void referencerService.list(sel).then(setRefs)
    else if (dtab === 'att') void drawingLedgerService.files(sel).then(setFiles)
  }, [sel, dtab])

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
    { key: 'name', header: t('dwg.drawingName', '도면명'), render: (r) => r.name },
    { key: 'type', header: t('dwg.typeCol', '유형'), width: 72, align: 'center', render: (r) => r.type },
    { key: 'kind', header: 'Kind', width: 100, align: 'center', render: (r) => r.kind },
    { key: 'rev', header: 'Rev', width: 40, align: 'center', render: (r) => <b>{r.rev}</b> },
    { key: 'revc', header: t('dwg.revCount', 'Rev수'), width: 40, align: 'right', render: (r) => r.revCount },
    {
      key: 'st', header: t('dwg.statusCol', '상태'), width: 78, align: 'center',
      render: (r) => (
        <>
          <Chip tone={STATUS_TONE[r.status] ?? 'info'}>{r.status}</Chip>
          {r.superseded ? <Chip tone="err">{t('dwg.superseded', '대체됨')}</Chip> : null}
        </>
      ),
    },
    { key: 'file', header: t('dwg.fileCol', '파일 (DXF)'), width: 130, render: (r) => r.fileName ?? '-' },
  ]

  const nos = drawings.map((d) => d.drawingNo)

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('dwg.ledger', '도면 대장')}</label>
        <Chip tone="info">{t('dwg.countChip', 'dwg_drawing {n}건').replace('{n}', String(drawings.length))}</Chip>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{t('dwg.dblOpenHint', '더블클릭 = 연결 DXF CAD 뷰어')}</span>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => { load(); shell.setStatusMsg('도면 대장 재조회 (dwg_drawing)') }}>{t('dwg.queryF8', '조회 F8')}</Btn>
        <Btn variant="pri" onClick={() => setShowReg(true)}>{t('dwg.registerF2', '＋ 도면 등록 F2')}</Btn>
      </div>
      {showReg ? (
        <div data-dwg-reg style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowReg(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 340, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>{t('dwg.regTitle', '도면 등록 — dwg_drawing')}</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowReg(false)}>✕</span>
            </div>
            <div className="frm c2" style={{ padding: 10 }}>
              <label>{t('dwg.drawingNo', '도면번호')} *</label>
              <input className="in req" value={reg.drawingNo} aria-label="등록 도면번호"
                placeholder={t('dwg.noPlaceholder', '예: KDCR 3-15')}
                onChange={(e) => setReg({ ...reg, drawingNo: e.target.value })} />
              <label>{t('dwg.drawingName', '도면명')} *</label>
              <input className="in req" value={reg.name} aria-label="등록 도면명"
                onChange={(e) => setReg({ ...reg, name: e.target.value })} />
              <label>{t('dwg.typeCol', '유형')}</label>
              <Combo width={140} value={reg.drawingType} options={['PART', 'ASSEMBLY', 'LAYOUT']}
                onChange={(v) => setReg({ ...reg, drawingType: v })} />
              <label>Kind</label>
              <Combo width={140} value={reg.kind} options={['STANDARD', 'APPROVAL', 'MANUFACTURING']}
                onChange={(v) => setReg({ ...reg, kind: v })} />
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowReg(false)}>{t('dwg.cancel', '취소')}</Btn>
              <Btn variant="pri" onClick={register}>{t('dwg.registerF12', '등록 F12')}</Btn>
            </div>
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1.3, overflow: 'auto' }}>
          <GroupBox title={t('dwg.listTitle', '도면 목록 — {n}건 (클릭=Rev 이력)')
            .replace('{n}', String(drawings.length))} noPad style={{ flex: 1 }}>
            <DenseGrid columns={cols} rows={drawings} rowKey={(r) => r.drawingNo}
              selectedKey={sel} onRowClick={(r) => setSel(r.drawingNo)}
              onRowDoubleClick={openCad} />
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 330, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title={`${t('dwg.detailTitle', '도면 상세')}${sel ? ` — ${sel}` : ''}`} noPad>
            {sel ? (
              <>
                <div className="mdi" style={{ flex: 'none' }}>
                  {([
                    ['rev', t('dwg.tabRev', 'Rev 이력')],
                    ['appr', t('dwg.tabApproval', '승인 단계')],
                    ['var', t('dwg.tabVariants', 'Variants')],
                    ['ref', t('dwg.tabReferencers', 'Referencers')],
                    ['att', t('dwg.tabAttachment', '첨부')],
                  ] as const).map(([k, label]) => (
                    <span key={k} className={`t ${dtab === k ? 'on' : ''}`}
                      onClick={() => setDtab(k)}>{label}</span>
                  ))}
                </div>
                {dtab === 'rev' ? (
                  <>
                    <table className="g">
                      <thead><tr><th>Rev</th><th>{t('dwg.dateCol', '일자')}</th>
                        <th>{t('dwg.reasonCol', '사유')}</th><th>{t('dwg.byCol', '처리자')}</th></tr></thead>
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
                        placeholder={t('dwg.revReasonPh', '개정 사유')} onChange={(e) => setRevReason(e.target.value)} />
                      <Btn variant="pri" onClick={revUp}>
                        {t('dwg.revUp', 'Rev 올리기')}
                        {selected ? ` (${selected.rev}→${t('dwg.nextRev', '다음')})` : ''}
                      </Btn>
                    </div>
                  </>
                ) : dtab === 'appr' ? (
                  <DwgApprovalTab no={sel} onStatusChange={load} />
                ) : dtab === 'var' ? (
                  variants === null ? (
                    <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('dwg.needBackend', '백엔드 연결 필요')}</div>
                  ) : variants.length === 0 ? (
                    <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('dwg.noVariants', '동일 패밀리 도면 없음')}</div>
                  ) : (
                    <table className="g">
                      <thead><tr><th>Drawing No.</th><th>{t('dwg.drawingName', '도면명')}</th>
                        <th>Rev</th><th>{t('dwg.statusCol', '상태')}</th></tr></thead>
                      <tbody>
                        {variants.map((v) => (
                          <tr key={v.drawingNo} style={{ cursor: 'pointer' }} onClick={() => setSel(v.drawingNo)}>
                            <td className="c" style={{ fontFamily: 'Consolas, monospace' }}>{v.drawingNo}</td>
                            <td>{v.name}</td>
                            <td className="c"><b>{v.rev}</b></td>
                            <td className="c">
                              <Chip tone={STATUS_TONE[v.status] ?? 'info'}>{v.status}</Chip>
                              {v.superseded ? <Chip tone="err">{t('dwg.superseded', '대체됨')}</Chip> : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : dtab === 'ref' ? (
                  refs === null ? (
                    <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('dwg.needBackend', '백엔드 연결 필요')}</div>
                  ) : refs.length === 0 ? (
                    <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('dwg.noRefs', '이 도면(코드)을 참조하는 상위 없음')}</div>
                  ) : (
                    <table className="g">
                      <thead><tr><th>{t('dwg.motherCol', '상위 코드')}</th><th>{t('dwg.descCol', '설명')}</th>
                        <th>Qty</th><th>{t('dwg.statusCol', '상태')}</th></tr></thead>
                      <tbody>
                        {refs.map((r, i) => (
                          <tr key={i}>
                            <td className="c" style={{ fontFamily: 'Consolas, monospace' }}>{r.code}</td>
                            <td>{r.name}</td>
                            <td className="r">{r.qty}</td>
                            <td className="c">{r.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : (
                  files === null ? (
                    <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('dwg.needBackend', '백엔드 연결 필요')}</div>
                  ) : files.length === 0 ? (
                    <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('dwg.noFiles', '연결 파일 없음 (Run 산출물 생성 시 자동 연결)')}</div>
                  ) : (
                    <table className="g">
                      <thead><tr><th>{t('dwg.fileCol', '파일 (DXF)')}</th><th>{t('dwg.typeCol', '유형')}</th>
                        <th>Size</th><th>{t('dwg.dateCol', '일자')}</th></tr></thead>
                      <tbody>
                        {files.map((f) => (
                          <tr key={f.fileId} style={{ cursor: 'pointer' }}
                            title={t('dwg.dblOpenHint', '더블클릭 = 연결 DXF CAD 뷰어')}
                            onDoubleClick={() => shell.openTab({
                              id: `cad-viewer:${f.fileId}`, screenId: 'cad-viewer', code: 'CAD',
                              title: f.fileName.slice(0, 16),
                              params: { fileId: f.fileId, name: f.fileName, from: tab.id },
                            })}>
                            <td style={{ fontFamily: 'Consolas, monospace' }}>{f.fileName}</td>
                            <td className="c">{f.fileType}</td>
                            <td className="r">{f.size ? `${Math.round(f.size / 1024)}KB` : '-'}</td>
                            <td className="c">{f.date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </>
            ) : (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
                {t('dwg.selectHint', '좌측 도면 행을 선택하면 Rev 이력이 표시됩니다')}
              </div>
            )}
          </GroupBox>
          <GroupBox title={t('dwg.supTitle', 'Supersedure — {n}건 (dwg_supersedure)')
            .replace('{n}', String(sups.length))} noPad
            right={<span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>{t('dwg.supHint', '구도면 → 신도면 대체')}</span>}>
            {sups.length ? (
              <table className="g">
                <thead><tr><th>{t('dwg.oldNo', '구도면')}</th><th>{t('dwg.newNo', '신도면')}</th>
                  <th>{t('dwg.dateCol', '일자')}</th></tr></thead>
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
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('dwg.noSup', '대체 이력 없음')}</div>
            )}
            <div className="frm c2" style={{ padding: 6, borderTop: '1px solid var(--line-soft)' }}>
              <label>{t('dwg.oldNo', '구도면')}</label>
              <Combo width={150} value={supForm.oldNo || '(선택)'}
                options={[{ value: '(선택)', label: t('dwg.selectOpt', '(선택)') }, ...nos]}
                onChange={(v) => setSupForm({ ...supForm, oldNo: v === '(선택)' ? '' : v })} />
              <label>{t('dwg.newNo', '신도면')}</label>
              <Combo width={150} value={supForm.newNo || '(선택)'}
                options={[{ value: '(선택)', label: t('dwg.selectOpt', '(선택)') }, ...nos]}
                onChange={(v) => setSupForm({ ...supForm, newNo: v === '(선택)' ? '' : v })} />
              <label>{t('dwg.reasonCol', '사유')}</label>
              <input className="in" value={supForm.reason} aria-label="대체 사유"
                onChange={(e) => setSupForm({ ...supForm, reason: e.target.value })} />
            </div>
            <div style={{ textAlign: 'right', padding: '0 6px 6px' }}>
              <Btn onClick={supersede}>{t('dwg.supRegister', '대체 등록')}</Btn>
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}

const STEP_LABEL: Record<string, string> = { WRITE: '작성', REVIEW: '검토', APPROVE: '승인' }
const STEPS = ['WRITE', 'REVIEW', 'APPROVE'] as const

/** B16 — 단계별 승인 탭 (dwg_approval WRITE→REVIEW→APPROVE, 반려=DRAFT 복귀) */
function DwgApprovalTab(props: { no: string; onStatusChange: () => void }) {
  const shell = useShell()
  const { t } = useI18n()
  const [rows, setRows] = useState<DwgApprovalRow[] | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () => { void drawingLedgerService.stepApprovals(props.no).then(setRows) }
  useEffect(reload, [props.no]) // eslint-disable-line react-hooks/exhaustive-deps

  if (rows === null) {
    return <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('dwg.needBackend', '백엔드 연결 필요')}</div>
  }
  const approved = new Set(rows.filter((r) => r.result === 'APPROVED').map((r) => r.step))
  const next = STEPS.find((s) => !approved.has(s))

  const decide = (approve: boolean) => {
    if (!next) return
    if (!approve && !comment.trim()) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>반려는 코멘트 필수</span>)
      return
    }
    setBusy(true)
    void (async () => {
      try {
        const r = await drawingLedgerService.decideStep(props.no, next, approve, comment.trim())
        setComment('')
        reload()
        props.onStatusChange()
        shell.setStatusMsg(
          `${props.no} ${STEP_LABEL[next]} ${approve ? '승인' : '반려'} ✓${r.drawingStatus ? ` — 도면 상태 ${r.drawingStatus}` : ''} (dwg_approval)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '처리 실패'}</span>)
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, padding: 6, alignItems: 'center' }}>
        {STEPS.map((s, i) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {i > 0 ? <span style={{ color: 'var(--txt-mute)' }}>→</span> : null}
            <Chip tone={approved.has(s) ? 'ok' : s === next ? 'warn' : 'info'}>
              {STEP_LABEL[s]}{approved.has(s) ? ' ✓' : s === next ? ' …' : ''}
            </Chip>
          </span>
        ))}
        {!next ? <span style={{ fontSize: 10, color: 'var(--ok)', marginLeft: 4 }}>{t('dwg.chainDone', '승인 체인 완료')}</span> : null}
      </div>
      {rows.length ? (
        <table className="g">
          <thead><tr><th>{t('dwg.stepCol', '단계')}</th><th>{t('dwg.resultCol', '결과')}</th>
            <th>{t('dwg.dateCol', '일자')}</th><th>{t('dwg.byCol', '처리자')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.approvalId} title={r.comment}>
                <td className="c">{STEP_LABEL[r.step] ?? r.step}</td>
                <td className="c">
                  <Chip tone={r.result === 'APPROVED' ? 'ok' : 'err'}>{r.result === 'APPROVED' ? '승인' : '반려'}</Chip>
                </td>
                <td className="c">{r.date}</td>
                <td className="c">{r.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--txt-mute)' }}>{t('dwg.noSteps', '승인 이력 없음 — 작성 단계부터 진행')}</div>
      )}
      {next ? (
        <div style={{ display: 'flex', gap: 4, padding: 6, alignItems: 'center' }}>
          <input className="in" style={{ flex: 1 }} value={comment} aria-label="단계 코멘트"
            placeholder={t('dwg.stepCommentPh', '코멘트 (반려 시 필수)')} onChange={(e) => setComment(e.target.value)} />
          <Btn variant="pri" disabled={busy} onClick={() => decide(true)}>
            {STEP_LABEL[next]} {t('dwg.approveBtn', '승인')}
          </Btn>
          <Btn disabled={busy} onClick={() => decide(false)}>{t('dwg.rejectBtn', '반려')}</Btn>
        </div>
      ) : null}
    </div>
  )
}
