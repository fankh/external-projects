/** M-5-4 Document Management 문서함 (W-11, 슬라이드 20·58) — 문서 통제 대장 ·
 *  상태 필터 · Grade 통제(S-1~S-n) · 더블클릭=문서 상세. */
import { useEffect, useMemo, useState } from 'react'
import type { DocRow } from '../../api/mock/dataMore'
import { docService } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { QuickEditDialog } from '../../components/QuickEditDialog'
import { usePermission } from '../../shell/PermissionContext'
import { useEscapeClose } from '../../shell/useEscapeClose'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const STAGES = ['Set-up', 'Check', 'Approve', 'Accepted']
const STATUS_TONE: Record<DocRow['status'], 'ok' | 'warn' | 'info'> = {
  'Set-up': 'info', Check: 'info', 'Approve 대기': 'warn', Accepted: 'ok',
}

export function DocumentMgmtScreen({ active }: ScreenProps) {
  const shell = useShell()
  const perm = usePermission()
  const { t } = useI18n()
  const [docs, setDocs] = useState<DocRow[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('전체')
  const [search, setSearch] = useState('')
  const [selDoc, setSelDoc] = useState<string | null>(null)
  const [showMeta, setShowMeta] = useState(false)   // F5 — 메타 수정

  const load = () => docService.list().then((rows) => {
    setDocs(rows)
    setSelDoc((cur) => cur ?? rows[0]?.docNo ?? null)
    return rows.length
  })

  useEffect(() => { void load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => docs.filter((d) =>
    (statusFilter === '전체' || d.status.startsWith(statusFilter))
    && (search.trim() === '' || (d.title + d.docNo).toLowerCase().includes(search.toLowerCase()))),
    [docs, statusFilter, search])

  useFKeys(active, useMemo(() => ({
    F8: () => {
      // F4 — 실재조회 (타 화면 F8 표준과 동일)
      void load().then((n) =>
        shell.setStatusMsg(`재조회 ✓ — ${n}건 (doc_control · Grade 미달 문서는 마스킹, DOC-002)`))
    },
  }), [])) // eslint-disable-line react-hooks/exhaustive-deps

  const sel = docs.find((d) => d.docNo === selDoc) ?? null
  const stageIdx = sel ? STAGES.findIndex((s) => sel.status.startsWith(s)) : -1

  // 미리보기 = 실 PDF 렌더 (Grade 워터마크) — 선택 변경 시 갱신
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfDenied, setPdfDenied] = useState<string | null>(null)   // D9 — 등급 열람 차단 메시지
  useEffect(() => {
    setPdfUrl(null); setPdfDenied(null)
    if (!selDoc) return
    let revoked: string | null = null
    void docService.renderPdf(selDoc).then((u) => { revoked = u; setPdfUrl(u) })
      .catch((e: Error) => { setPdfUrl(null); setPdfDenied(e.message || '미리보기 불가') })
    return () => { if (revoked) URL.revokeObjectURL(revoked) }
  }, [selDoc])

  // ＋ 문서 등록
  const [showReg, setShowReg] = useState(false)
  useEscapeClose(showReg, () => setShowReg(false))
  const [reg, setReg] = useState({ docNo: '', title: '', docType: 'TECH_DOC', grade: 'S-3' })
  const register = () => {
    void (async () => {
      try {
        const ok = await docService.create(reg)
        if (!ok) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>등록 불가 — 백엔드 연결 필요</span>)
          return
        }
        setShowReg(false)
        setReg({ docNo: '', title: '', docType: 'TECH_DOC', grade: 'S-3' })
        await docService.list().then(setDocs)
        shell.setStatusMsg(`문서 등록 ✓ — ${reg.docNo} (Set-up · 승인 요청 자동 등록)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '등록 실패'}</span>)
      }
    })()
  }

  const counts = STAGES.map((s) => docs.filter((d) => d.status.startsWith(s)).length)

  const cols: GridColumn<DocRow>[] = [
    { key: 'no', header: 'DOC No.', width: 92, code: true, render: (r) => r.docNo },
    { key: 'title', header: 'Title', render: (r) => r.title },
    { key: 'p', header: 'Person', width: 48, align: 'center', render: (r) => r.person },
    { key: 'd', header: 'date', width: 46, align: 'center', render: (r) => r.date },
    {
      key: 'st', header: 'Released Status', width: 90, align: 'center',
      render: (r) => <Chip tone={STATUS_TONE[r.status]}>
        {r.status === 'Approve 대기' ? t('docmgmt.approveWaiting', 'Approve 대기') : r.status}
      </Chip>,
    },
    { key: 'ap', header: 'Approver', width: 56, align: 'center', render: (r) => r.approver },
    { key: 'ad', header: 'App. Date', width: 58, align: 'center', render: (r) => r.appDate },
    { key: 'v', header: 'Version', width: 52, align: 'center', code: true, render: (r) => r.version },
    { key: 'g', header: 'Grade', width: 44, align: 'center', render: (r) => <Chip tone="warn">{r.grade}</Chip> },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('docmgmt.docType', '문서 유형')}</label>
        <Combo width={80} value="전체" options={[{ value: '전체', label: t('enum.all', '전체') }, 'Technical', 'General']} />
        <label>Grade</label>
        <Combo width={64} value="전체" options={[{ value: '전체', label: t('enum.all', '전체') }, 'S-1', 'S-2', 'S-3']} />
        <label>{t('docmgmt.search', '검색')}</label>
        <input className="in" style={{ width: 160 }} value={search} aria-label="검색"
          onChange={(e) => setSearch(e.target.value)} />
        <span style={{ flex: 1 }} />
        <Btn disabled={!perm.canWrite('cpq-docmgmt') || !sel}
          title={perm.canWrite('cpq-docmgmt') ? undefined : perm.denyWrite}
          onClick={() => setShowMeta(true)}>{t('docmgmt.editMeta', '메타 수정')}</Btn>
        <Btn variant="pri" disabled={!perm.canWrite('cpq-docmgmt')}
          title={perm.canWrite('cpq-docmgmt') ? undefined : perm.denyWrite}
          onClick={() => setShowReg(true)}>{t('docmgmt.addDoc', '＋ 문서 등록')}</Btn>
      </div>
      {showMeta && sel ? (
        <QuickEditDialog dataAttr="doc-meta"
          title={`문서 메타 수정 — ${sel.docNo}`}
          fields={[
            { key: 'title', label: t('docmgmt.title', '제목'), value: sel.title, required: true },
            { key: 'docType', label: t('docmgmt.docType', '문서 유형'), value: sel.docType ?? 'TECH_DOC', type: 'combo',
              options: ['TECH_DOC', 'QUOTE', 'REPORT', 'FORM'] },
            { key: 'grade', label: 'Grade', value: sel.grade, type: 'combo',
              options: ['S-1', 'S-2', 'S-3', 'S-4'] },
          ]}
          onClose={() => setShowMeta(false)}
          onSubmit={async (v) => {
            const ok = await docService.updateMeta(sel.docNo, {
              title: v.title, docType: v.docType, grade: v.grade,
            })
            if (!ok) return t('common.needBackend', '백엔드 연결 필요 (mock 모드)')
            setShowMeta(false)
            void load()
            shell.setStatusMsg(`메타 수정 ✓ — ${sel.docNo} (doc_control · DOC_META_UPDATE 감사, ACCEPTED 는 409 통제)`)
            return null
          }} />
      ) : null}
      {showReg ? (
        <div data-doc-reg style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowReg(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 330, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>{t('docmgmt.regTitle', '문서 등록 — doc_control')}</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowReg(false)}>✕</span>
            </div>
            <div className="frm c2" style={{ padding: 10 }}>
              <label>DOC No *</label>
              <input className="in req" value={reg.docNo} aria-label="문서 번호" placeholder="DF 342-236 A"
                onChange={(e) => setReg({ ...reg, docNo: e.target.value })} />
              <label>{t('docmgmt.titleReq', '제목 *')}</label>
              <input className="in req" value={reg.title} aria-label="문서 제목"
                onChange={(e) => setReg({ ...reg, title: e.target.value })} />
              <label>{t('docmgmt.type', '유형')}</label>
              <Combo width={130} value={reg.docType} options={['TECH_DOC', 'QUOTE', 'REPORT', 'FORM']}
                onChange={(v) => setReg({ ...reg, docType: v })} />
              <label>Grade</label>
              <Combo width={130} value={reg.grade} options={['S-1', 'S-2', 'S-3', 'S-4']}
                onChange={(v) => setReg({ ...reg, grade: v })} />
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowReg(false)}>{t('docmgmt.cancel', '취소')}</Btn>
              <Btn variant="pri" onClick={register}>{t('docmgmt.registerF12', '등록 F12')}</Btn>
            </div>
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 158, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <GroupBox title={t('docmgmt.statusFilter', '상태 필터')} noPad>
            <div className="tree2">
              <div className={`tn ${statusFilter === '전체' ? 'sel' : ''}`}
                onClick={() => setStatusFilter('전체')}>
                <span className="pm">·</span>{t('enum.all', '전체')} ({docs.length})
              </div>
              {STAGES.map((s, i) => (
                <div key={s} className={`tn l2 ${statusFilter === s ? 'sel' : ''}`}
                  onClick={() => setStatusFilter(s)}>
                  <span className="pm">·</span>{s} ({counts[i]})
                </div>
              ))}
            </div>
          </GroupBox>
          <GroupBox title={t('docmgmt.category', '분류')} noPad>
            <div className="tree2">
              <div className="tn"><span className="pm">−</span>Product</div>
              <div className="tn l2 sel"><span className="pm">·</span>AHU · Fan</div>
              <div className="tn"><span className="pm">+</span>Technical · General</div>
            </div>
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 6, overflow: 'auto' }}>
          <GroupBox title={t('docmgmt.docLedger', '문서 대장 — {n}건 (더블클릭=문서 상세)').replace('{n}', String(rows.length))} noPad style={{ flex: 1 }}>
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.docNo}
              selectedKey={selDoc} onRowClick={(r) => setSelDoc(r.docNo)}
              onRowDoubleClick={(r) => shell.openTab({
                id: `doc-detail:${r.docNo}`, screenId: 'doc-detail',
                code: '문서', title: r.docNo,
                params: { file: `${r.title} (${r.docNo})`, folder: 'DATA', fileType: 'PDF', status: r.status },
              })} />
          </GroupBox>
          {sel ? (
            <GroupBox title={t('docmgmt.selDocProgress', '선택 문서 — {n} · Progress').replace('{n}', sel.title)}>
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
        <div className="side-scroll" style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GroupBox title={t('docmgmt.previewGrade', '미리보기 — Grade 통제')}>
            {pdfUrl ? (
              <iframe title="문서 미리보기" src={pdfUrl} data-doc-preview
                style={{ width: '100%', height: 240, border: '1px solid var(--line)' }} />
            ) : pdfDenied ? (
              <div className="cvs" data-doc-denied style={{ height: 150, border: '1px solid var(--err)' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--err)', textAlign: 'center', padding: 8 }}>
                  <span style={{ fontSize: 18 }}>🔒</span>
                  {pdfDenied}
                </div>
              </div>
            ) : (
              <div className="cvs" style={{ height: 150 }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, color: 'var(--txt-mute)', textAlign: 'center' }}>
                  {sel ? t('docmgmt.rendering', '렌더 중… (백엔드 필요)') : t('docmgmt.selectDoc', '문서 선택')}<br />
                </div>
              </div>
            )}
            <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 3 }}>
              {t('docmgmt.gradeHint', 'S-1/S-2 는 CONFIDENTIAL 워터마크 강제 · 권한 미달 시 마스킹 (DOC-002)')}
            </div>
          </GroupBox>
          <GroupBox title="Print" right={<Btn style={{ height: 18, fontSize: 10 }}
            onClick={() => {
              if (pdfUrl) {
                window.open(pdfUrl, '_blank')
                shell.setStatusMsg(`Print — ${sel?.docNo ?? ''} 실렌더 PDF (Grade 워터마크 적용)`)
              } else {
                shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>Print 불가 — 백엔드 연결 필요</span>)
              }
            }}>🖨</Btn>}>
            <div style={{ fontSize: 10, color: 'var(--txt-dim)' }}>{t('docmgmt.printHint', '워터마크·출력 통제 적용 (실렌더)')}</div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
