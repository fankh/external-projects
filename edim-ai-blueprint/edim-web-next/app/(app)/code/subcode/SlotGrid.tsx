'use client'

/** Sub Code 등록 — 그룹 등록·항목 등록(중복검토 CODE-006 + 승인)·Excel 왕복 (N4b 복구). */
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { addItem, approveSlotValues, createGroup, importGroupExcel, type ActState } from './actions'
import { usePermission } from '@/components/PermissionProvider'

export interface SlotRow {
  slot: string; label: string; values: string; allValues: string
  count: number; status: string; approved: boolean
}

const GT_KEY: Record<string, [string, string]> = {
  SPECIFICATION: ['subcode.gtShortSpec', '사양'], RAW_MATERIAL: ['subcode.gtShortRaw', '원자재'],
  GPI: ['subcode.gtShortGpi', '구매품'], PRODUCT: ['subcode.gtShortProduct', '제품'],
}
export interface GroupRow { groupCode: string; groupType: string; slotCount: number }

export function SlotGrid({ rows, group, groups = [] }: {
  rows: SlotRow[]; group: string; groups?: GroupRow[]
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [grpSt, grpAction, grpPending] = useActionState(createGroup, {} as ActState)
  const [impSt, impAction, impPending] = useActionState(importGroupExcel, {} as ActState)
  const [itemNo, setItemNo] = useState('')
  const [desc, setDesc] = useState('')
  const [values, setValues] = useState('')
  const [dupMsg, setDupMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [dupOk, setDupOk] = useState(false)
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const perm = usePermission()

  const cols: GridColumn<SlotRow>[] = [
    { key: 'slot', header: 'Slot', width: 64, align: 'center', code: true, render: (r) => r.slot },
    { key: 'label', header: t('subcode.item', '항목명'), render: (r) => r.label },
    { key: 'values', header: t('subcode.valueList', '값'), render: (r) => r.values || '—' },
    { key: 'count', header: t('subcode.count', '개수'), width: 56, align: 'right', sortValue: (r) => r.count, render: (r) => r.count },
    { key: 'status', header: t('subcode.status', '상태'), width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.approved ? 'ok' : 'info'}>{r.status}</Chip> },
    // #28 — 승인된 값만 제품 코드 조합에 편입된다. 미승인 Slot 은 여기서 바로 승인.
    { key: 'approve', header: t('subcode.approveCol', '승인'), width: 60, align: 'center', render: (r) => (
      r.approved ? <span style={{ color: 'var(--txt-dim)' }}>—</span> : (
        <button className="b" data-slot-approve={r.slot} disabled={pending || !perm.canWrite('code-master')}
          title={perm.canWrite('code-master') ? t('subcode.approveHint', '미승인 값을 승인해 조합 대상에 편입') : perm.denyWrite}
          onClick={(e) => { e.stopPropagation(); start(async () => setSt(await approveSlotValues(group, r.slot))) }}>
          {t('common.approve', '승인')}
        </button>
      )) },
  ]

  // #26 — Item No 를 비우면 서버가 Item Head 를 자동 부여(A→B→…)한다.
  // 다음 글자를 미리 보여 주면 사용자가 직접 입력하다 충돌(409)할 일이 없다.
  const nextSlot = (() => {
    const used = new Set(rows.map((r) => r.slot))
    for (let i = 0; i < 26; i++) {
      const c = String.fromCharCode(65 + i)
      if (!used.has(c)) return c
    }
    return 'AA'
  })()

  const checkDup = () => {
    const slot = itemNo.trim().toUpperCase()
    if (!slot) {
      // 자동 부여 경로 — 중복이 있을 수 없으므로 그대로 통과시킨다
      setDupOk(true)
      setDupMsg({ text: `자동 부여 — Item ${nextSlot} 로 등록됩니다 (#26)` })
      return
    }
    const dup = rows.some((r) => r.slot === slot)
    setDupOk(!dup)
    setDupMsg(dup
      ? { text: `중복 — Item ${slot} 이미 등록됨 (CODE-006)`, err: true }
      : { text: `중복 없음 ✓ — Item ${slot} 사용 가능` })
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px 0', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11 }}>{t('subcode.group', '그룹')}</label>
        {/* #27 — 그룹을 타입과 함께 목록에서 고른다(종전엔 코드를 직접 타이핑해야 했다) */}
        <select className="in" data-group-pick value={group} style={{ height: 22, fontSize: 11, width: 190 }}
          onChange={(e) => router.push(`/code/subcode?group=${encodeURIComponent(e.target.value)}`)}>
          {groups.length ? groups.map((g) => (
            <option key={g.groupCode} value={g.groupCode}>{g.groupCode} — {GT_KEY[g.groupType] ? t(GT_KEY[g.groupType][0], GT_KEY[g.groupType][1]) : g.groupType} ({g.slotCount})</option>
          )) : <option value={group}>{group}</option>}
        </select>
        <form action={grpAction} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input className="in req" name="groupCode" placeholder={t('subcode.newGroupCodePh', '새 그룹 코드')} style={{ width: 90 }} />
          <input className="in req" name="groupName" placeholder={t('subcode.groupNamePh', '그룹 이름')} style={{ width: 110 }} />
          {/* #27 — API 가 받는 유형만 노출한다. 종전 목록(PART/MATERIAL/ETC)은 전부 422 로 거부됐고,
              정작 원자재·구매품 Sub Code 유형(RAW_MATERIAL/GPI)은 고를 수도 없었다. */}
          <select className="in" name="groupType" data-group-type defaultValue="SPECIFICATION" style={{ width: 132 }}>
            <option value="SPECIFICATION">{t('subcode.gtSpec', '사양 (Specification)')}</option>
            <option value="RAW_MATERIAL">{t('subcode.gtRaw', '원자재 (Raw Material)')}</option>
            <option value="GPI">{t('subcode.gtGpi', '구매품 (GPI)')}</option>
            <option value="PRODUCT">{t('subcode.gtProduct', '제품 (Product)')}</option>
          </select>
          <button className="b" type="submit" disabled={grpPending}>{t('subcode.groupReg', '그룹 등록')}</button>
        </form>
        <span className="sep" />
        <form action={impAction} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="hidden" name="group" value={group} />
          <input className="in" type="file" name="uploadedFile" accept=".xlsx" style={{ width: 180, fontSize: 10 }} />
          {/* 트리아지 #32 — Diff Review: 반영 없이 insert/update/거부 미리보기 */}
          <label style={{ display: 'inline-flex', gap: 3, alignItems: 'center', fontSize: 10.5 }}
            title={t('subcode.dryRunHint', '검토(Diff) — 반영 없이 추가/갱신/거부 미리보기')}>
            <input type="checkbox" name="dryRun" data-import-dryrun aria-label="검토만" />
            {t('subcode.dryRun', '검토만')}
          </label>
          <button className="b" type="submit" disabled={impPending}>{t('subcode.importBtn', '⬆ Import')}</button>
        </form>
        <button className="b" onClick={() => window.open(`/api/next/xlsx?kind=group&id=${encodeURIComponent(group)}`, '_blank')}>{t('subcode.exportBtn', '⬇ Export')}</button>
        {(grpSt.error || impSt.error) ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{grpSt.error || impSt.error}</span> : null}
        {(grpSt.ok || impSt.ok) ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{grpSt.ok || impSt.ok}</span> : null}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '0 6px', flexWrap: 'wrap', fontSize: 11 }}>
        <span style={{ fontWeight: 600 }}>{t('subcode.newItem', '신규 항목')}</span>
        <input className="in" data-item-no style={{ width: 74 }}
          placeholder={t('subcode.autoSlot', `자동(${nextSlot})`)} title={t('subcode.autoSlotHint', '비우면 Item Head 자동 부여 (#26)')} value={itemNo}
          onChange={(e) => { setItemNo(e.target.value); setDupOk(false); setDupMsg(null) }} />
        <input className="in req" style={{ width: 130 }} placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <input className="in" style={{ width: 180 }} placeholder={t('subcode.valuesPh', '값 목록 (· 또는 , 구분)')} value={values} onChange={(e) => setValues(e.target.value)} />
        <button className="b" onClick={checkDup}>{t('subcode.dupCheck', '중복검토')}</button>
        <button className="b run" disabled={pending || !dupOk} title={dupOk ? undefined : t('subcode.dupFirstHint', '중복검토 통과 후 요청 가능')}
          onClick={() => start(async () => {
            const vals = values.split(/[·,]+|\s{2,}/).map((v) => v.trim()).filter(Boolean)
            const r = await addItem(group, itemNo, desc, vals)
            setSt(r)
            if (r.ok) { setItemNo(''); setDesc(''); setValues(''); setDupOk(false); setDupMsg(null) }
          })}>{t('common.requestApproval', '승인 요청')}</button>
        {dupMsg ? <span style={{ color: dupMsg.err ? 'var(--err)' : 'var(--run)' }}>{dupMsg.text}</span> : null}
        {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: '0 6px 6px' }}>
        <DenseGrid prefKey="next-slots" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.slot} emptyText={t('subcode.empty', 'Slot 이 없습니다')} />
      </div>
    </div>
  )
}
