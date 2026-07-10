/** M-8-4 창고·저장위치 계층 (B19, ERP-020/021) — erp_warehouse 실 CRUD.
 *  REGION→PLANT→WAREHOUSE→STORAGE→SECTOR 5계층 (순서 강제), 위험물 허용·검사주기. */
import { useEffect, useMemo, useState } from 'react'
import { warehouseService, type WarehouseNode } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { useI18n } from '../../i18n/I18nContext'
import { usePermission } from '../../shell/PermissionContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const TYPE_TONE: Record<WarehouseNode['type'], 'info' | 'ok' | 'warn' | 'err'> = {
  REGION: 'info', PLANT: 'info', WAREHOUSE: 'ok', STORAGE: 'warn', SECTOR: 'err',
}
const TYPES = ['REGION', 'PLANT', 'WAREHOUSE', 'STORAGE', 'SECTOR']

export function WarehouseScreen({ active }: ScreenProps) {
  const shell = useShell()
  const perm = usePermission()
  const { t } = useI18n()
  const [nodes, setNodes] = useState<WarehouseNode[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    parentCode: '', locationType: 'STORAGE', code: '', name: '',
    hazard: '', inspection: '', remarks: '',
  })

  const load = () => { void warehouseService.tree().then(setNodes) }
  useEffect(load, [])

  const add = () => {
    if (!form.code.trim() || !form.name.trim()) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>필수(노란 셀) — 위치 코드·이름 입력</span>)
      return
    }
    void (async () => {
      try {
        const ok = await warehouseService.create(form)
        if (!ok) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>등록 불가 — 백엔드 연결 필요</span>)
          return
        }
        setShowAdd(false)
        setForm({ ...form, code: '', name: '', hazard: '', inspection: '', remarks: '' })
        load()
        shell.setStatusMsg(`위치 등록 ✓ — ${form.code} (erp_warehouse, 계층 검증 통과)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '등록 실패'}</span>)
      }
    })()
  }

  const removeSel = () => {
    if (!sel) {
      shell.setStatusMsg(<span style={{ color: 'var(--warn)' }}>삭제 — 대상 위치 행을 선택하십시오</span>)
      return
    }
    void (async () => {
      try {
        const ok = await warehouseService.remove(sel)
        if (!ok) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>삭제 불가 — 백엔드 연결 필요</span>)
          return
        }
        setSel(null)
        load()
        shell.setStatusMsg(`위치 삭제 ✓ — ${sel}`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '삭제 실패'}</span>)
      }
    })()
  }

  useFKeys(active, useMemo(() => ({
    F2: () => {
      if (!perm.canWrite('erp-warehouse')) { shell.setStatusMsg(perm.denyWrite); return }
      setShowAdd(true)
    },
    F3: removeSel,
    F8: () => { load(); shell.setStatusMsg('창고 계층 재조회 (erp_warehouse)') },
  }), [sel])) // eslint-disable-line react-hooks/exhaustive-deps

  const parentOptions = ['(최상위 REGION)', ...(nodes ?? []).map((n) => n.code)]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('wh.title', '창고/저장위치 계층 — erp_warehouse')}</label>
        {nodes === null
          ? <Chip tone="warn">{t('dwg.needBackend', '백엔드 연결 필요')}</Chip>
          : <Chip tone="info">{nodes.length}노드</Chip>}
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          {t('wh.hierHint', '계층: REGION→PLANT→WAREHOUSE→STORAGE→SECTOR (순서 강제)')}
        </span>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => { load(); shell.setStatusMsg('창고 계층 재조회 (erp_warehouse)') }}>{t('dwg.queryF8', '조회 F8')}</Btn>
        <Btn variant="pri" disabled={!perm.canWrite('erp-warehouse')}
          title={perm.canWrite('erp-warehouse') ? undefined : perm.denyWrite}
          onClick={() => setShowAdd(true)}>{t('wh.addF2', '＋ 위치 등록 F2')}</Btn>
      </div>
      {showAdd ? (
        <div data-wh-add style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowAdd(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 360, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>위치 등록 — erp_warehouse</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowAdd(false)}>✕</span>
            </div>
            <div className="frm c2" style={{ padding: 10 }}>
              <label>상위 위치</label>
              <Combo width={170} value={form.parentCode || '(최상위 REGION)'} options={parentOptions}
                onChange={(v) => setForm({ ...form, parentCode: v === '(최상위 REGION)' ? '' : v })} />
              <label>{t('wh.typeCol', '유형')}</label>
              <Combo width={130} value={form.locationType} options={TYPES}
                onChange={(v) => setForm({ ...form, locationType: v })} />
              <label>{t('wh.codeCol', '코드')} *</label>
              <input className="in req" value={form.code} aria-label="위치 코드"
                placeholder="예: WH-A-CHEM" onChange={(e) => setForm({ ...form, code: e.target.value })} />
              <label>{t('wh.nameCol', '이름')} *</label>
              <input className="in req" value={form.name} aria-label="위치 이름"
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <label>{t('wh.hazardCol', '위험물 허용')}</label>
              <input className="in" value={form.hazard} aria-label="위험물 허용"
                placeholder="예: 액체·가스 (빈 값 = 불허)" onChange={(e) => setForm({ ...form, hazard: e.target.value })} />
              <label>{t('wh.inspectionCol', '검사주기')}</label>
              <input className="in" value={form.inspection} aria-label="검사주기"
                placeholder="예: 1개월" onChange={(e) => setForm({ ...form, inspection: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowAdd(false)}>{t('dwg.cancel', '취소')}</Btn>
              <Btn variant="pri" onClick={add}>{t('dwg.registerF12', '등록 F12')}</Btn>
            </div>
          </div>
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox title={`${t('wh.title', '창고/저장위치 계층 — erp_warehouse')} (F3=삭제·하위 보호)`} noPad style={{ height: '100%', overflow: 'auto' }}>
          <table className="g" data-wh-tree>
            <thead><tr>
              <th>{t('wh.codeCol', '코드')}</th><th>{t('wh.nameCol', '이름')}</th>
              <th style={{ width: 90 }}>{t('wh.typeCol', '유형')}</th>
              <th>{t('wh.hazardCol', '위험물 허용')}</th>
              <th style={{ width: 76 }}>{t('wh.inspectionCol', '검사주기')}</th>
            </tr></thead>
            <tbody>
              {(nodes ?? []).map((n) => (
                <tr key={n.code} className={sel === n.code ? 'sel' : ''}
                  style={{ cursor: 'pointer' }} onClick={() => setSel(n.code)} title={n.path}>
                  <td style={{ fontFamily: 'Consolas, monospace', paddingLeft: 8 + n.depth * 16 }}>
                    {n.depth > 0 ? '└ ' : ''}{n.code}
                  </td>
                  <td>{n.name}</td>
                  <td className="c"><Chip tone={TYPE_TONE[n.type]}>{n.type}</Chip></td>
                  <td>{n.hazard
                    ? <><Chip tone="warn">위험물</Chip> {n.hazard}</>
                    : <span style={{ color: 'var(--txt-mute)' }}>불허</span>}</td>
                  <td className="c">{n.inspection || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GroupBox>
      </div>
    </div>
  )
}
