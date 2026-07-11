/** S-1-1 Sub Code 등록 (W-04 / 디자인시안 b04) — 마스터(그리드)-디테일(폼) 표준형.
 *  중복검토(CODE-006) · 승인 요청 → PENDING 행 추가. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SubCodeSlot } from '../../api/mock/dataCode'
import { codeSetupService } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { Cvs } from '../../components/Cvs'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function SubCodeScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [rows, setRows] = useState<SubCodeSlot[]>([])
  const [selSlot, setSelSlot] = useState<string | null>(null)
  // C2 — 코드 그룹 관리 (셀렉터·등록·Excel 왕복)
  const [group, setGroup] = useState('KOF')
  const [groups, setGroups] = useState<{ groupCode: string; groupName: string; groupType: string; slotCount: number; status: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const loadGroups = () => void codeSetupService.listGroups().then(setGroups)
  useEffect(() => { loadGroups() }, [])
  useEffect(() => {
    void codeSetupService.groupTable(group).then(setRows)
  }, [group])
  const groupName = groups.find((g) => g.groupCode === group)?.groupName ?? 'Specification - Fan'
  const [newItemNo, setNewItemNo] = useState('G')
  const [newDesc, setNewDesc] = useState('Impeller Type')
  const [newValues, setNewValues] = useState('Airfoil · Forward · 900 1000 1120')
  const [dupChecked, setDupChecked] = useState(false)

  const nextSlot = () => String.fromCharCode(65 + rows.length) // A=65

  const reset = () => {
    setNewItemNo(nextSlot())
    setNewDesc('')
    setNewValues('')
    setDupChecked(false)
    shell.setStatusMsg('신규 항목 입력 (F2)')
  }

  const checkDup = () => {
    const dup = rows.some((r) => r.slot === newItemNo.trim().toUpperCase())
    setDupChecked(!dup)
    shell.setStatusMsg(dup
      ? <span style={{ color: 'var(--err)' }}>중복 — Item {newItemNo} 이미 등록됨 (CODE-006)</span>
      : `중복 없음 ✓ — Item ${newItemNo} 사용 가능`)
  }

  const requestApproval = () => {
    if (!newItemNo.trim() || !newDesc.trim()) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>필수(노란 셀) 미입력</span>)
      return
    }
    const slot = newItemNo.trim().toUpperCase()
    const values = newValues.split(/[·,]+|\s{2,}/).map((v) => v.trim()).filter(Boolean)
    void (async () => {
      try {
        const mode = await codeSetupService.addItem(group, slot, newDesc, values)
        if (mode === 'live') {
          setRows(await codeSetupService.groupTable(group))
        } else {
          setRows((prev) => [
            ...prev.filter((r) => r.slot !== slot),
            { slot, label: newDesc, values: newValues, count: values.length, status: 'PENDING' },
          ])
        }
        setSelSlot(slot)
        shell.setStatusMsg(`승인 요청 — ${slot} · ${newDesc} (code_item PENDING → 승인함 등록)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '등록 실패'}</span>)
      }
    })()
  }

  const reload = () => {
    void codeSetupService.groupTable(group).then((r) => {
      setRows(r)
      shell.setStatusMsg(`재조회 ✓ — Group ${group} · ${r.length}개 Slot (code_item)`)
    })
  }

  // C2 — 그룹 등록·Excel 왕복
  const createGroup = () => {
    const code = window.prompt('그룹 코드 (예: KOF2)')?.trim().toUpperCase()
    if (!code) return
    const name = window.prompt('그룹 이름 (예: Specification - Fan)')?.trim()
    if (!name) return
    void codeSetupService.createGroup({ groupCode: code, groupName: name, groupType: 'SPECIFICATION' })
      .then((ok) => {
        if (ok) { loadGroups(); setGroup(code); shell.setStatusMsg(`그룹 등록 ✓ — ${code} ${name} (code_group DRAFT)`) }
        else shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>등록 불가 — 백엔드 연결 필요</span>)
      })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }
  const doExport = () => {
    void codeSetupService.exportGroup(group).then((ok) => {
      shell.setStatusMsg(ok ? `Excel 내보내기 ✓ — ${group}.xlsx (code_item)`
        : <span style={{ color: 'var(--err)' }}>내보내기 불가 — 백엔드 연결 필요</span>)
    })
  }
  const doImport = (f: globalThis.File) => {
    void codeSetupService.importGroup(group, f).then((rep) => {
      if (!rep) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>Import 불가 — 백엔드 연결 필요</span>); return }
      reload(); loadGroups()
      const rej = rep.rejected.length ? ` · 거부 ${rep.rejected.length}` : ''
      shell.setStatusMsg(`Excel Import ✓ — 추가 ${rep.inserted}·갱신 ${rep.updated}${rej} (code_item)`)
    }).catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  useFKeys(active, useMemo(() => ({
    F2: reset,
    F8: reload,
    F12: requestApproval,   // F4 — 저장 = 실제 쓰기 경로(등록+승인 요청)와 동일
  }), [newItemNo, newDesc, newValues])) // eslint-disable-line react-hooks/exhaustive-deps

  const cols: GridColumn<SubCodeSlot>[] = [
    { key: 'slot', header: 'Slot', width: 34, align: 'center', render: (r) => <b>{r.slot}</b> },
    { key: 'label', header: t('subcode.item', '항목'), width: 110, render: (r) => r.label },
    { key: 'values', header: t('subcode.valueList', '값 목록'), code: true, render: (r) => r.values },
    { key: 'count', header: t('subcode.count', '건수'), width: 40, align: 'right', render: (r) => r.count },
    {
      key: 'status', header: t('subcode.status', '상태'), width: 52, align: 'center',
      render: (r) => (r.status === 'APPROVED'
        ? <Chip tone="ok">{t('subcode.approved', '승인')}</Chip>
        : <Chip tone="warn">{t('enum.waiting', '대기')}</Chip>),
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Group<i>*</i></label>
        <Combo width={90} value={group}
          options={groups.length ? groups.map((g) => g.groupCode) : [group]}
          onChange={setGroup} />
        <Btn onClick={createGroup}>{t('subcode.groupReg', '그룹 등록')}</Btn>
        <label>{t('subcode.desc', '설명')}</label>
        <input className="in ro" style={{ width: 160 }} value={groupName} readOnly aria-label="설명" />
        <label>{t('subcode.apprStatus', '승인상태')}</label>
        <Combo width={84} value="전체" options={[
          { value: '전체', label: t('enum.all', '전체') },
          { value: '승인', label: t('subcode.approved', '승인') },
          { value: '대기', label: t('enum.waiting', '대기') },
        ]} />
        <span style={{ flex: 1 }} />
        <Btn onClick={reload}>
          {t('subcode.queryF8', '조회 F8')}
        </Btn>
        <Btn onClick={reset}>{t('subcode.newF2', '신규 F2')}</Btn>
        <Btn onClick={checkDup}>{t('subcode.dupCheck', '중복검토')}</Btn>
        <Btn variant="pri" onClick={requestApproval}>{t('subcode.saveF12', '저장 F12')}</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox style={{ flex: 1.3 }} noPad
          title={`Registered Code Table — ${group}`}
          right={<>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }}
              aria-label="code_item Excel"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
            <span className="b" style={{ height: 18, fontSize: 10, cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}>Excel ⬆</span>
            <span className="b" style={{ height: 18, fontSize: 10, cursor: 'pointer' }}
              onClick={doExport}>Excel ⬇</span>
          </>}>
          <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.slot}
            selectedKey={selSlot} onRowClick={(r) => setSelSlot(r.slot)} />
        </GroupBox>
        <div style={{ width: 330, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title={t('subcode.newItemTitle', '신규 항목 ({n}) — 필수는 노란 셀')
            .replace('{n}', newItemNo || nextSlot())}>
            <div className="frm c2">
              <label>Item No<i>*</i></label>
              <input className="in req" value={newItemNo} aria-label="Item No"
                onChange={(e) => { setNewItemNo(e.target.value); setDupChecked(false) }} />
              <label>{t('subcode.desc', '설명')}<i>*</i></label>
              <input className="in req" value={newDesc} aria-label="설명(신규)"
                onChange={(e) => setNewDesc(e.target.value)} />
              <label>Sub Item</label>
              <input className="in" value={newValues} aria-label="Sub Item" data-subitem-input
                onChange={(e) => setNewValues(e.target.value)} />
              <label>{t('subcode.refTable', '참조 Table')}</label>
              <Combo value="— 없음" options={[
                { value: '— 없음', label: t('subcode.none', '— 없음') },
                'Table12 (Variant)',
              ]} />
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
              {dupChecked ? <Chip tone="ok">{t('subcode.dupCheck', '중복검토')} ✓</Chip> : null}
              <Btn onClick={() => {
                // F4 — 값 구분자(·) 추가 + 입력 포커스 (Sub Item 은 · 구분 목록)
                setNewValues((prev) => (prev.trim() ? `${prev.trim()} · ` : prev))
                const el = document.querySelector<HTMLInputElement>('[data-subitem-input]')
                el?.focus()
                shell.setStatusMsg(t('subcode.addValueHint', '값 추가 — Sub Item 끝에 새 값 입력 (· 구분)'))
              }}>{t('subcode.addValue', '＋ 값 추가')}</Btn>
              <Btn variant="pri" onClick={requestApproval}>{t('common.requestApproval', '승인 요청')}</Btn>
            </div>
          </GroupBox>
          <GroupBox title={t('subcode.codeAsset', '코드 자산 — KDCR 3-13')} style={{ flex: 1 }}>
            <div style={{ fontSize: 11, lineHeight: 1.9 }}>
              <b style={{ color: 'var(--title-navy)' }}>DWG</b> PDF·CAD
              <Chip tone="info">3D ☑ 2D ☐</Chip>
              <Cvs blocks={[{ id: 'p', name: 'Casing', sub: 'KDCR 3-13', x: 40, y: 8, w: 120, h: 56 }]}
                style={{ height: 76, margin: '4px 0' }} />
              <b style={{ color: 'var(--title-navy)' }}>Table</b> KDCR 3-13 (Variant)
              <span className="b" style={{ float: 'right', height: 18, fontSize: 10 }}
                onClick={() => shell.openTab({ id: 'code-datatable', screenId: 'code-datatable', code: 'M-3-7', title: '데이터 Table' })}>
                {t('subcode.open', '열기')}
              </span>
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
