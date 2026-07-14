/** 제품 코드 마스터 (M-3-8) — product_code 수동 CRUD.
 *  코드가 Run/expand 부산물로만 생성되던 갭 해소: 수동 생성·코드명 수정·상태(DRAFT/APPROVED/INACTIVE=비활성)·삭제(참조 시 409). SETUP 이상. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { productCodeService, type ProductCodeRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { QuickEditDialog } from '../../components/QuickEditDialog'
import { usePermission } from '../../shell/PermissionContext'
import { useEscapeClose } from '../../shell/useEscapeClose'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'info'> = { APPROVED: 'ok', DRAFT: 'info', INACTIVE: 'warn' }

export function ProductCodeMasterScreen({ active }: ScreenProps) {
  const shell = useShell()
  const perm = usePermission()
  const { setStatusMsg } = shell
  const [rows, setRows] = useState<ProductCodeRow[]>([])
  const [groups, setGroups] = useState<{ groupCode: string; groupName: string }[]>([])
  const [offline, setOffline] = useState(false)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showReg, setShowReg] = useState(false)
  const [edit, setEdit] = useState<ProductCodeRow | null>(null)
  const [reg, setReg] = useState({ mainCode: '', codeName: '', groupCode: '' })
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [bulk, setBulk] = useState<{ action: 'STATUS' | 'DELETE'; status?: string; label: string; danger?: boolean } | null>(null)
  useEscapeClose(showReg, () => setShowReg(false))

  const load = useCallback(() => {
    void productCodeService.list(statusFilter).then((r) => {
      if (r === null) { setOffline(true); return }
      setOffline(false); setRows(r); setSel(new Set())
    })
  }, [statusFilter])

  const runBulk = useCallback(async (): Promise<string | null> => {
    if (!bulk) return null
    const ids = [...sel]
    const r = await productCodeService.batch(ids, bulk.action, bulk.status ?? '')
    if (r === null) return '백엔드 연결 필요 (mock 모드)'
    setBulk(null); load()
    const skip = r.skipped?.length ? ` · 건너뜀 ${r.skipped.length}건 (${r.skipped.slice(0, 2).map((s) => `${s.code ?? s.id}:${s.reason}`).join('; ')}${r.skipped.length > 2 ? '…' : ''})` : ''
    setStatusMsg(`일괄 ${bulk.label} ✓ — ${r.done}/${r.requested}건${skip}`)
    return null
  }, [bulk, sel, load, setStatusMsg])
  useEffect(() => { load() }, [load])
  useEffect(() => { void productCodeService.groups().then((g) => setGroups(g)) }, [])

  const canWrite = perm.canWrite('code-master')
  const register = () => {
    if (!reg.mainCode.trim() || !reg.codeName.trim() || !reg.groupCode) {
      setStatusMsg(<span style={{ color: 'var(--err)' }}>필수 — 코드·코드명·그룹</span>); return
    }
    void productCodeService.create(reg)
      .then((okc) => {
        if (!okc) { setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
        setShowReg(false); setReg({ mainCode: '', codeName: '', groupCode: '' }); load()
        setStatusMsg(`제품 코드 등록 ✓ — ${reg.mainCode} (DRAFT)`)
      })
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }
  const setStatus = (r: ProductCodeRow, status: string) => {
    void productCodeService.patch(r.productCodeId, { status })
      .then(() => { load(); setStatusMsg(`${r.mainCode} → ${status}`) })
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }
  const remove = (r: ProductCodeRow) => {
    void productCodeService.remove(r.productCodeId)
      .then((okc) => { if (okc) { load(); setStatusMsg(`삭제 ✓ — ${r.mainCode}`) } })
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  useFKeys(active, useMemo(() => ({
    F2: () => { if (canWrite) setShowReg(true); else setStatusMsg(perm.denyWrite) },
    F8: load,
  }), [canWrite, load, perm.denyWrite, setStatusMsg]))

  const cols: GridColumn<ProductCodeRow>[] = [
    { key: 'code', header: '코드', width: 130, code: true, render: (r) => r.mainCode },
    { key: 'name', header: '코드명 (더블클릭 편집)', editable: canWrite, editValue: (r) => r.codeName, render: (r) => r.codeName },
    { key: 'group', header: '그룹', width: 90, align: 'center', render: (r) => r.groupCode },
    { key: 'status', header: '상태', width: 84, align: 'center', render: (r) => <Chip tone={STATUS_TONE[r.status] ?? 'info'}>{r.status}</Chip> },
    { key: 'refs', header: '참조', width: 50, align: 'right', sortValue: (r) => r.refs, render: (r) => r.refs },
    {
      key: 'act', header: '작업', width: 150, align: 'center', noSort: true, render: (r) => (
        <span style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
          {r.status !== 'APPROVED' ? <Btn style={{ height: 18, fontSize: 9 }} disabled={!canWrite} onClick={() => setStatus(r, 'APPROVED')}>승인</Btn> : null}
          {r.status !== 'INACTIVE' ? <Btn style={{ height: 18, fontSize: 9 }} disabled={!canWrite} onClick={() => setStatus(r, 'INACTIVE')}>비활성</Btn> : <Btn style={{ height: 18, fontSize: 9 }} disabled={!canWrite} onClick={() => setStatus(r, 'DRAFT')}>복원</Btn>}
          <Btn style={{ height: 18, fontSize: 9 }} disabled={!canWrite || r.refs > 0} title={r.refs > 0 ? '참조 있어 삭제 불가' : undefined} onClick={() => remove(r)}>삭제</Btn>
        </span>
      ),
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>상태</label>
        <Combo width={110} value={statusFilter} options={['ALL', 'DRAFT', 'APPROVED', 'INACTIVE']} onChange={setStatusFilter} />
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          제품 코드 수동 관리 — Run/expand 자동 생성분 포함. 참조 있으면 삭제 대신 비활성
        </span>
        <span style={{ flex: 1 }} />
        {sel.size > 0 ? (
          <>
            <Chip tone="info">{sel.size} 선택</Chip>
            <Btn disabled={!canWrite} onClick={() => setBulk({ action: 'STATUS', status: 'APPROVED', label: '승인' })}>일괄 승인</Btn>
            <Btn disabled={!canWrite} onClick={() => setBulk({ action: 'STATUS', status: 'INACTIVE', label: '비활성' })}>일괄 비활성</Btn>
            <Btn disabled={!canWrite} onClick={() => setBulk({ action: 'DELETE', label: '삭제', danger: true })}>일괄 삭제</Btn>
            <span style={{ width: 8 }} />
          </>
        ) : null}
        <Btn variant="pri" disabled={!canWrite} title={canWrite ? undefined : perm.denyWrite} onClick={() => setShowReg(true)}>＋ 등록 F2</Btn>
        <Btn onClick={load}>조회 F8</Btn>
      </div>
      {bulk ? (
        <ConfirmDialog dataAttr="pc-bulk"
          title={`일괄 ${bulk.label} — ${sel.size}건`}
          danger={bulk.danger}
          confirmLabel={`${bulk.label} (${sel.size})`}
          message={bulk.action === 'DELETE'
            ? <>선택한 <b>{sel.size}건</b>을 삭제합니다. 참조가 있는 코드는 자동으로 건너뜁니다(비활성 권장). 되돌릴 수 없습니다.</>
            : <>선택한 <b>{sel.size}건</b>의 상태를 <b>{bulk.status}</b>(으)로 일괄 변경합니다.</>}
          onConfirm={runBulk}
          onClose={() => setBulk(null)} />
      ) : null}
      {showReg ? (
        <div data-pc-reg style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowReg(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 340, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }} onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>제품 코드 등록 — product_code</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowReg(false)}>✕</span>
            </div>
            <div className="frm c2" style={{ padding: 10 }}>
              <label>코드 *</label>
              <input className="in req" value={reg.mainCode} aria-label="코드" placeholder="예: KDX 9-9"
                onChange={(e) => setReg({ ...reg, mainCode: e.target.value })} />
              <label>코드명 *</label>
              <input className="in req" value={reg.codeName} aria-label="코드명"
                onChange={(e) => setReg({ ...reg, codeName: e.target.value })} />
              <label>그룹 *</label>
              <Combo width={160} value={reg.groupCode} onChange={(v) => setReg({ ...reg, groupCode: v })}
                options={[{ value: '', label: '(선택)' }, ...groups.map((g) => ({ value: g.groupCode, label: `${g.groupCode} — ${g.groupName}` }))]} />
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowReg(false)}>취소</Btn>
              <Btn variant="pri" onClick={register}>등록 F12</Btn>
            </div>
          </div>
        </div>
      ) : null}
      {edit ? (
        <QuickEditDialog dataAttr="pc-edit" title={`코드명 수정 — ${edit.mainCode}`}
          fields={[{ key: 'codeName', label: '코드명', value: edit.codeName, required: true }]}
          onClose={() => setEdit(null)}
          onSubmit={async (v) => {
            const okc = await productCodeService.patch(edit.productCodeId, { codeName: v.codeName })
            if (!okc) return '백엔드 연결 필요'
            setEdit(null); load(); setStatusMsg(`코드명 수정 ✓ — ${edit.mainCode}`); return null
          }} />
      ) : null}
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox title={`제품 코드 — ${rows.length}건`} noPad style={{ height: '100%' }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>백엔드 연결 필요 — 제품 코드는 실DB(product_code)에서만 조회됩니다</div>
          ) : (
            <DenseGrid prefKey="product-codes" columns={cols} rows={rows} rowKey={(r) => r.productCodeId}
              emptyText={`${statusFilter === 'ALL' ? '' : statusFilter + ' '}제품 코드가 없습니다`}
              multiSelect selectedKeys={sel as Set<string | number>} onSelectionChange={(k) => setSel(k as Set<number>)}
              onRowDoubleClick={(r) => { if (canWrite) setEdit(r); else setStatusMsg(perm.denyWrite) }}
              onCellEdit={(r, _i, _k, v) => {
                if (!v.trim() || v === r.codeName) return
                void productCodeService.patch(r.productCodeId, { codeName: v.trim() })
                  .then((ok) => { if (ok) { load(); setStatusMsg(`코드명 수정 ✓ — ${r.mainCode}: ${v.trim()}`) } })
                  .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
              }} />
          )}
        </GroupBox>
      </div>
    </div>
  )
}
