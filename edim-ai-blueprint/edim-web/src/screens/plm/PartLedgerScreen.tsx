/** M-4-7 부품 대장 (B17) — prt_part 실 CRUD + 공급자 코드 매핑 (ERP-018).
 *  등록 F2 · 행 선택 = 우측 공급자 코드 · BOM 참조 부품 삭제 보호 (409). */
import { useEffect, useMemo, useRef, useState } from 'react'
import { partService, xlsxService, type PartRow, type SupplierCodeRow } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { QuickEditDialog } from '../../components/QuickEditDialog'
import { useI18n } from '../../i18n/I18nContext'
import { usePermission } from '../../shell/PermissionContext'
import { useEscapeClose } from '../../shell/useEscapeClose'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function PartLedgerScreen({ active }: ScreenProps) {
  const shell = useShell()
  const perm = usePermission()
  const { t } = useI18n()
  const [rows, setRows] = useState<PartRow[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [showReg, setShowReg] = useState(false)
  const [editRow, setEditRow] = useState<PartRow | null>(null)   // F5 — 속성 수정
  useEscapeClose(showReg, () => setShowReg(false))
  const [reg, setReg] = useState({
    partNo: '', name: '', spec: '', materialCode: '', supplier: '',
    productCode: '', unit: 'EA', weight: '', isStandard: false,
  })
  const [supCodes, setSupCodes] = useState<SupplierCodeRow[] | null>(null)
  const [supForm, setSupForm] = useState({ supplier: '', supplierCode: '', supplierName: '' })

  const load = () => { void partService.list().then(setRows) }
  const impRef = useRef<HTMLInputElement>(null)
  const doImport = (f: File) => {
    void partService.importExcel(f)
      .then((r) => {
        if (!r) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
        load()
        shell.setStatusMsg(`부품 대량등록 ✓ — 등록 ${r.inserted}건${r.rejected.length ? ` · 거부 ${r.rejected.length}건 (${r.rejected.slice(0, 2).join('; ')}${r.rejected.length > 2 ? '…' : ''})` : ''}`)
      })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }
  useEffect(load, [])

  useEffect(() => {
    if (!sel) { setSupCodes(null); return }
    void partService.supplierCodes(sel).then(setSupCodes)
  }, [sel])

  const register = () => {
    if (!reg.partNo.trim() || !reg.name.trim()) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>필수(노란 셀) — 부품번호·부품명 입력</span>)
      return
    }
    void (async () => {
      try {
        const ok = await partService.create({
          partNo: reg.partNo.trim(), name: reg.name.trim(), spec: reg.spec.trim(),
          materialCode: reg.materialCode.trim(), supplier: reg.supplier.trim(),
          productCode: reg.productCode.trim(), unit: reg.unit.trim() || 'EA',
          weight: reg.weight.trim() ? Number(reg.weight) : null, isStandard: reg.isStandard,
        })
        if (!ok) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>등록 불가 — 백엔드 연결 필요</span>)
          return
        }
        setShowReg(false)
        setSel(reg.partNo.trim())
        load()
        shell.setStatusMsg(`부품 등록 ✓ — ${reg.partNo} (prt_part)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '등록 실패'}</span>)
      }
    })()
  }

  const removePart = (no: string) => {
    void (async () => {
      try {
        const ok = await partService.remove(no)
        if (!ok) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>삭제 불가 — 백엔드 연결 필요</span>); return }
        if (sel === no) setSel(null)
        load()
        shell.setStatusMsg(`부품 삭제 ✓ — ${no}`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e instanceof Error ? e.message : '삭제 실패'}</span>)
      }
    })()
  }
  const removeSel = () => {
    if (!sel) {
      shell.setStatusMsg(<span style={{ color: 'var(--warn)' }}>삭제 — 대상 부품 행을 선택하십시오</span>)
      return
    }
    void (async () => {
      try {
        const ok = await partService.remove(sel)
        if (!ok) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>삭제 불가 — 백엔드 연결 필요</span>)
          return
        }
        setSel(null)
        load()
        shell.setStatusMsg(`부품 삭제 ✓ — ${sel}`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '삭제 실패'}</span>)
      }
    })()
  }

  const addSupCode = () => {
    if (!sel) return
    if (!supForm.supplier.trim() || !supForm.supplierCode.trim()) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>공급처·공급자 코드를 입력하십시오</span>)
      return
    }
    void (async () => {
      try {
        const ok = await partService.addSupplierCode(
          sel, supForm.supplier.trim(), supForm.supplierCode.trim(), supForm.supplierName.trim())
        if (!ok) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>매핑 불가 — 백엔드 연결 필요</span>)
          return
        }
        setSupForm({ supplier: '', supplierCode: '', supplierName: '' })
        void partService.supplierCodes(sel).then(setSupCodes)
        shell.setStatusMsg(`공급자 코드 매핑 ✓ — ${sel} (prt_supplier_code_map, 발주 문서 표시)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '매핑 실패'}</span>)
      }
    })()
  }

  useFKeys(active, useMemo(() => ({
    F2: () => {
      if (!perm.canWrite('plm-parts')) { shell.setStatusMsg(perm.denyWrite); return }
      setShowReg(true)
    },
    F3: removeSel,
    F8: () => { load(); shell.setStatusMsg('부품 대장 재조회 (prt_part)') },
  }), [sel])) // eslint-disable-line react-hooks/exhaustive-deps

  const cols: GridColumn<PartRow>[] = [
    { key: 'no', header: t('parts.partNo', '부품번호'), width: 104, code: true, render: (r) => r.partNo },
    { key: 'name', header: t('parts.partName', '부품명'), render: (r) => r.name },
    { key: 'spec', header: t('parts.specCol', '사양'), width: 130, render: (r) => r.spec || '-' },
    { key: 'mat', header: t('parts.materialCol', '재질'), width: 62, align: 'center', render: (r) => r.material ?? '-' },
    { key: 'sup', header: t('parts.supplierCol', '공급처'), width: 70, align: 'center', render: (r) => r.supplier ?? '-' },
    { key: 'unit', header: 'Unit', width: 38, align: 'center', render: (r) => r.unit },
    { key: 'wt', header: t('parts.weightCol', '중량(kg)'), width: 62, align: 'right', render: (r) => r.weight ?? '-' },
    {
      key: 'std', header: 'STD', width: 44, align: 'center',
      render: (r) => (r.isStandard ? <Chip tone="info">{t('parts.stdChip', 'STD')}</Chip> : null),
    },
    { key: 'bom', header: t('parts.bomCol', 'BOM 참조'), width: 58, align: 'right', render: (r) => r.bomCount },
    { key: 'code', header: 'Code', width: 84, render: (r) => r.productCode ?? '-' },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('parts.title', '부품 대장 — prt_part')}</label>
        {rows === null
          ? <Chip tone="warn">{t('dwg.needBackend', '백엔드 연결 필요')}</Chip>
          : <Chip tone="info">prt_part {rows.length}건</Chip>}
        <span style={{ flex: 1 }} />
        <Btn onClick={() => void xlsxService.download('/parts/export.xlsx', 'parts')
          .then((n) => shell.setStatusMsg(n < 0 ? <span style={{ color: 'var(--err)' }}>내보내기 불가</span> : `부품 XLSX ✓ — ${n}건`))}>⬇ XLSX</Btn>
        <input ref={impRef} type="file" accept=".xlsx" style={{ display: 'none' }} aria-label="대량 등록 파일"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
        <Btn disabled={!perm.canWrite('plm-parts')} title="헤더: 부품번호·부품명·사양·단위·중량·공급처"
          onClick={() => impRef.current?.click()}>⬆ 대량등록</Btn>
        <Btn onClick={() => { load(); shell.setStatusMsg('부품 대장 재조회 (prt_part)') }}>{t('dwg.queryF8', '조회 F8')}</Btn>
        <Btn disabled={!perm.canWrite('plm-parts') || !sel}
          title={perm.canWrite('plm-parts') ? undefined : perm.denyWrite}
          onClick={() => {
            const r = (rows ?? []).find((x) => x.partNo === sel)
            if (r) setEditRow(r)
          }}>{t('parts.editBtn', '✎ 수정')}</Btn>
        <Btn variant="pri" disabled={!perm.canWrite('plm-parts')}
          title={perm.canWrite('plm-parts') ? undefined : perm.denyWrite}
          onClick={() => setShowReg(true)}>{t('parts.registerF2', '＋ 부품 등록 F2')}</Btn>
      </div>
      {showReg ? (
        <div data-part-reg style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowReg(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 380, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>부품 등록 — prt_part</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowReg(false)}>✕</span>
            </div>
            <div className="frm c2" style={{ padding: 10 }}>
              <label>{t('parts.partNo', '부품번호')} *</label>
              <input className="in req" value={reg.partNo} aria-label="등록 부품번호"
                placeholder="예: PRT-CON-150" onChange={(e) => setReg({ ...reg, partNo: e.target.value })} />
              <label>{t('parts.partName', '부품명')} *</label>
              <input className="in req" value={reg.name} aria-label="등록 부품명"
                onChange={(e) => setReg({ ...reg, name: e.target.value })} />
              <label>{t('parts.specCol', '사양')}</label>
              <input className="in" value={reg.spec} aria-label="등록 사양"
                onChange={(e) => setReg({ ...reg, spec: e.target.value })} />
              <label>{t('parts.materialCol', '재질')}</label>
              <input className="in" value={reg.materialCode} aria-label="등록 재질 코드"
                placeholder="M-3-2 코드 (예: SS400)" onChange={(e) => setReg({ ...reg, materialCode: e.target.value })} />
              <label>{t('parts.supplierCol', '공급처')}</label>
              <input className="in" value={reg.supplier} aria-label="등록 공급처"
                onChange={(e) => setReg({ ...reg, supplier: e.target.value })} />
              <label>Code</label>
              <input className="in" value={reg.productCode} aria-label="등록 제품코드"
                placeholder="연결 제품코드 (선택)" onChange={(e) => setReg({ ...reg, productCode: e.target.value })} />
              <label>{t('parts.weightCol', '중량(kg)')}</label>
              <input className="in" value={reg.weight} aria-label="등록 중량"
                onChange={(e) => setReg({ ...reg, weight: e.target.value })} />
              <label>STD</label>
              <span>
                <input type="checkbox" checked={reg.isStandard} aria-label="표준품 여부"
                  onChange={(e) => setReg({ ...reg, isStandard: e.target.checked })} /> 표준품
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowReg(false)}>{t('dwg.cancel', '취소')}</Btn>
              <Btn variant="pri" onClick={register}>{t('dwg.registerF12', '등록 F12')}</Btn>
            </div>
          </div>
        </div>
      ) : null}
      {editRow ? (
        <QuickEditDialog dataAttr="part-edit" title={`부품 수정 — ${editRow.partNo}`}
          fields={[
            { key: 'name', label: t('parts.partName', '부품명'), value: editRow.name, required: true },
            { key: 'specification', label: t('parts.specCol', '사양'), value: editRow.spec },
            { key: 'materialCode', label: t('parts.materialCol', '재질'), value: editRow.material ?? '' },
            { key: 'supplier', label: t('parts.supplierCol', '공급처'), value: editRow.supplier ?? '' },
            { key: 'code', label: 'Code', value: editRow.productCode ?? '' },
            { key: 'weight', label: t('parts.weightCol', '중량(kg)'), value: editRow.weight != null ? String(editRow.weight) : '' },
            { key: 'isStandard', label: 'STD', value: editRow.isStandard ? 'Y' : 'N', type: 'combo', options: ['Y', 'N'] },
          ]}
          onClose={() => setEditRow(null)}
          onSubmit={async (v) => {
            try {
              const ok = await partService.update(editRow.partNo, {
                name: v.name, specification: v.specification, materialCode: v.materialCode,
                supplier: v.supplier, code: v.code,
                weight: v.weight.trim() ? Number(v.weight) : undefined,
                isStandard: v.isStandard === 'Y',
                baseUpdatedAt: editRow.updatedAt,   // D9 — 낙관적 잠금
              })
              if (!ok) return t('common.needBackend', '백엔드 연결 필요 (mock 모드)')
            } catch (e) {
              // D9 — 동시 편집 충돌(409) 재조회 안내
              load()
              return e instanceof Error ? e.message : '수정 실패'
            }
            setEditRow(null)
            load()
            shell.setStatusMsg(`부품 수정 ✓ — ${editRow.partNo} (prt_part · PART_UPDATE 감사)`)
            return null
          }} />
      ) : null}
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox title={`${t('parts.title', '부품 대장 — prt_part')} (F3=삭제·BOM 참조 보호)`} noPad style={{ flex: 1.4 }}>
          <DenseGrid prefKey="parts" colFilter columns={cols} rows={rows ?? []} rowKey={(r) => r.partNo}
            selectedKey={sel} onRowClick={(r) => setSel(r.partNo)} stickyFirst
            rowActions={(r) => [
              { label: '선택', onClick: () => setSel(r.partNo) },
              ...(perm.canWrite('plm-parts') ? [{ label: '삭제', danger: true, onClick: () => removePart(r.partNo) }] : []),
            ]} />
        </GroupBox>
        <div className="split-h" />
        <GroupBox title={`${t('parts.supCodes', '공급자 코드 매핑 (ERP-018)')}${sel ? ` — ${sel}` : ''}`} noPad
          style={{ width: 320, flex: 'none' }}>
          {!sel ? (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
              {t('parts.selectHint', '부품 행을 선택하면 공급자 코드 매핑이 표시됩니다')}
            </div>
          ) : supCodes === null ? (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('dwg.needBackend', '백엔드 연결 필요')}</div>
          ) : (
            <>
              {supCodes.length ? (
                <table className="g">
                  <thead><tr><th>{t('parts.supplierCol', '공급처')}</th>
                    <th>{t('purchase.supCode', '공급자 코드')}</th><th>{t('dwg.descCol', '설명')}</th></tr></thead>
                  <tbody>
                    {supCodes.map((s) => (
                      <tr key={s.mapId}>
                        <td className="c">{s.supplier}</td>
                        <td className="c" style={{ fontFamily: 'Consolas, monospace' }}>{s.supplierCode}</td>
                        <td style={{ fontSize: 10 }}>{s.supplierName || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: 8, fontSize: 11, color: 'var(--txt-mute)' }}>{t('parts.noSupCodes', '공급자 코드 매핑 없음')}</div>
              )}
              <div className="frm c2" style={{ padding: 6, borderTop: '1px solid var(--line-soft)' }}>
                <label>{t('parts.supplierCol', '공급처')}</label>
                <input className="in" value={supForm.supplier} aria-label="매핑 공급처"
                  onChange={(e) => setSupForm({ ...supForm, supplier: e.target.value })} />
                <label>{t('purchase.supCode', '공급자 코드')}</label>
                <input className="in" value={supForm.supplierCode} aria-label="매핑 공급자 코드"
                  onChange={(e) => setSupForm({ ...supForm, supplierCode: e.target.value })} />
                <label>{t('dwg.descCol', '설명')}</label>
                <input className="in" value={supForm.supplierName} aria-label="매핑 설명"
                  onChange={(e) => setSupForm({ ...supForm, supplierName: e.target.value })} />
              </div>
              <div style={{ textAlign: 'right', padding: '0 6px 6px' }}>
                <Btn onClick={addSupCode}>{t('parts.supCodeAdd', '매핑 추가')}</Btn>
              </div>
            </>
          )}
        </GroupBox>
      </div>
    </div>
  )
}
