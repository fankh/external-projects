/** S-1-4 Code Relationship (W-05, 슬라이드 36) — Mother-Child slot_map ·
 *  Running Test 통과(CODE-009)해야 승인 요청 가능. */
import { useEffect, useMemo, useState } from 'react'
import { MOTHER, type RunningTestRow } from '../../api/mock/dataCode'
import { approvalService, relationshipService, sysService, type ChildRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { Cvs } from '../../components/Cvs'
import { BlockCadView } from '../../components/BlockCadView'
import type { CanvasBlock } from '../../api/types'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const SLOT_OPTS: Record<string, string[]> = { B: ['13', '21', '32'], C: ['32', '45'], E: ['15', '21'] }

export function CodeRelationshipScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [children, setChildren] = useState<ChildRow[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [slots, setSlots] = useState<Record<string, string>>({ B: '13', C: '32', E: '15' })
  const [testRows, setTestRows] = useState<RunningTestRow[] | null>(null)
  const [tested, setTested] = useState(false)
  // B21 — Child 실등록 폼
  const [addChild, setAddChild] = useState('')
  const [addQty, setAddQty] = useState('1')
  // 엔진 통합 — 구성도를 Cvs(블록) / CadSvg(DXF 실엔진) 로 전환
  const [cadView, setCadView] = useState(false)

  // Mother + Child 블록 다이어그램 (엔진 통합 브리지 공용 모델)
  const relBlocks = useMemo<CanvasBlock[]>(() => {
    const blocks: CanvasBlock[] = [{ id: 'm', name: 'Mother', sub: MOTHER.code, x: 200, y: 12, w: 150, h: 60 }]
    children.slice(0, 8).forEach((c, i) => {
      blocks.push({ id: c.code, name: 'Child', sub: c.code, x: 20 + i * 130, y: 130, w: 118, h: 52, dashed: !checked.has(c.code) })
    })
    return blocks
  }, [children, checked])
  const relDims = useMemo(() => (children.length
    ? [{ x: 20, y: 205, w: Math.max(150, Math.min(children.length, 8) * 130 - 12), label: `Child ${Math.min(children.length, 8)}` }]
    : []), [children])

  useEffect(() => {
    void relationshipService.children(MOTHER.code).then((rows) => {
      setChildren(rows)
      setChecked(new Set(rows.map((c) => c.code)))
    })
  }, [])

  const runTest = () => {
    void (async () => {
      const rows = await relationshipService.runningTest(MOTHER.code, slots, checked)
      setTestRows(rows)
      setTested(true)
      shell.setStatusMsg(`Running Test ✓ — ${rows.length - 1} Child 전개 (순환 참조 없음, CODE-009)`)
    })()
  }

  useFKeys(active, useMemo(() => ({ F9: runTest }), [slots, checked])) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (code: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
    setTested(false)
  }

  const childCols: GridColumn<ChildRow>[] = [
    {
      key: 'chk', header: '☑', width: 26, align: 'center',
      render: (r) => (
        <input type="checkbox" checked={checked.has(r.code)} aria-label={`선택 ${r.code}`}
          onChange={() => toggle(r.code)} />
      ),
    },
    { key: 'code', header: 'Child', width: 74, code: true, render: (r) => r.code },
    { key: 'desc', header: 'Desc.', render: (r) => r.desc },
    { key: 'qty', header: "Q'ty", width: 34, align: 'right', render: (r) => r.qty },
    { key: 'rem', header: 'Remarks', width: 120, render: (r) => r.remarks },
    { key: 'data', header: 'Data', width: 36, align: 'center', render: () => '📄' },
  ]

  const testCols: GridColumn<RunningTestRow>[] = [
    { key: 'no', header: 'No.', width: 36, align: 'center', render: (r) => r.no },
    { key: 'name', header: 'Name', code: true, render: (r) => r.name },
    { key: 'qty', header: "Q'ty", width: 34, align: 'right', render: (r) => r.qty },
    { key: 'rem', header: 'Remarks', width: 110, render: (r) => r.remarks },
  ]

  return (
    <div className="fill-col">
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1.15, overflow: 'auto' }}>
          <GroupBox
            title={<span>Mother : <b style={{ color: 'var(--err)' }}>{MOTHER.code}</b>
              <span style={{ fontWeight: 400, color: 'var(--txt-dim)' }}> {MOTHER.desc}</span></span>}
            right={<Chip tone="ok">Approved</Chip>} noPad>
            <table className="g">
              <thead>
                <tr>{MOTHER.slots.map((s) => <th key={s.slot}>{s.slot} : {s.label}</th>)}</tr>
              </thead>
              <tbody>
                <tr>{MOTHER.slots.map((s) => <td key={s.slot} className="code">{s.values}</td>)}</tr>
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title={t('codrel.diagram', '구성도 — Mother · Child')} noPad
            right={
              <span style={{ display: 'flex', gap: 4 }}>
                <Btn style={{ height: 18, fontSize: 9.5 }} variant={cadView ? 'default' : 'pri'} onClick={() => setCadView(false)}>{t('codrel.viewBlock', '블록')}</Btn>
                <Btn style={{ height: 18, fontSize: 9.5 }} variant={cadView ? 'pri' : 'default'} onClick={() => setCadView(true)}>{t('codrel.viewCad', 'CAD 실엔진')}</Btn>
              </span>
            }>
            <div style={{ height: 230 }}>
              {cadView ? (
                <BlockCadView blocks={relBlocks} dims={relDims} name={`CodeRel_${MOTHER.code}`}
                  onStatus={(m) => shell.setStatusMsg(m)}
                  onError={(m) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{m}</span>)} />
              ) : (
                <Cvs blocks={relBlocks} dims={relDims} style={{ width: '100%', height: '100%' }} />
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--txt-dim)', lineHeight: 1.7, padding: '3px 6px' }}>
              {t('codrel.slotMapHint', 'Slot 매핑(slot_map)으로 Mother 값이 Child 코드 자릿수에 전파 (CODE-008)')} · {t('codrel.engineUnify', 'CAD 실엔진 = 동일 블록을 정규화 DrawingDocument 로 렌더·DXF 익스포트')}
            </div>
          </GroupBox>
          <GroupBox title="Add Child" right={<>
            <Combo width={130} value="Product / Sub Code" options={['Product / Sub Code', 'X-Code']} />
            <Btn onClick={() => {
              // B21 — code_relationship 실등록 (DRAFT, Running Test 통과 후 승인 CODE-009)
              if (!addChild.trim()) {
                shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>Child Code 를 입력하십시오</span>)
                return
              }
              void sysService.relationshipAdd(MOTHER.code, addChild.trim(), Number(addQty) || 1)
                .then((ok) => {
                  if (!ok) {
                    shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>Child 추가 불가 — 백엔드 연결 필요</span>)
                    return
                  }
                  void relationshipService.children(MOTHER.code).then((rows) => { if (rows) setChildren(rows) })
                  shell.setStatusMsg(`Child 추가 ✓ — ${MOTHER.code} → ${addChild} ×${addQty} (DRAFT, Running Test 후 승인)`)
                })
                .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
            }}>＋ Add</Btn>
          </>}>
            <div className="frm">
              <label>Child Code</label>
              <input className="in" value={addChild} aria-label="Child Code"
                placeholder="예: KDI 21" onChange={(e) => setAddChild(e.target.value)} />
              <label>Description</label>
              <input className="in" defaultValue="Inlet Cone W/O FF" aria-label="Child Description" />
              <label>Q'ty</label>
              <input className="in" value={addQty} style={{ maxWidth: 64 }} aria-label="Qty"
                onChange={(e) => setAddQty(e.target.value)} />
              <label>{t('codrel.slotMap', 'Slot 매핑')}</label>
              <input className="in" defaultValue="A↔A · B↔B · C↔C" aria-label="Slot 매핑" />
            </div>
          </GroupBox>
        </div>
        <div className="split-h" />
        <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
          <GroupBox title={t('codrel.childGroup', '[ Child Group ] — 더블클릭=코드 상세')} right={<Chip tone="ok">Approved</Chip>} noPad>
            <DenseGrid columns={childCols} rows={children} rowKey={(r) => r.code}
              onRowDoubleClick={(r) => shell.openTab({
                id: `code-detail:${r.code}`, screenId: 'code-detail',
                code: '상세', title: r.code, params: { code: r.code, name: r.desc },
              })} />
          </GroupBox>
          <GroupBox style={{ flex: 1 }}
            title="[ Part List Running Test ]"
            right={<>
              {Object.entries(SLOT_OPTS).map(([s, opts]) => (
                <Combo key={s} width={56} value={slots[s]} options={opts}
                  onChange={(v) => { setSlots((p) => ({ ...p, [s]: v })); setTested(false) }} />
              ))}
              <Btn variant="run" style={{ height: 18, fontSize: 10 }} onClick={runTest}>Run ▶ F9</Btn>
            </>} noPad>
            {testRows
              ? <DenseGrid columns={testCols} rows={testRows} rowKey={(r) => r.no} />
              : (
                <div style={{ padding: 10, color: 'var(--txt-mute)', fontSize: 11 }}>
                  {t('codrel.runHint', 'Mother Slot 조합(B·C·E)을 선택하고 Run — 조건 일치 Child 전량 전개 검증')}
                </div>
              )}
          </GroupBox>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
            {tested
              ? <Chip tone="ok">{t('codrel.testPassed', 'Running Test 통과')}</Chip>
              : <Chip tone="warn">{t('codrel.testNeeded', 'Test 필요')}</Chip>}
            <Btn variant="pri" disabled={!tested}
              onClick={() => {
                // F4 — 실배선: 범용 승인 API (승인 시 mother 관계 세트 APPROVED 전이)
                void approvalService.request(
                  'code_relationship',
                  `Code Relationship — ${MOTHER.code} (Running Test ${testRows ? testRows.length - 1 : 0}행 통과)`,
                  0, 'UPDATE', MOTHER.code)
                  .then((ok) => shell.setStatusMsg(ok
                    ? `승인 요청 ✓ — ${MOTHER.code} 관계 (승인함 등록 · 승인 시 APPROVED 전이)`
                    : <span style={{ color: 'var(--err)' }}>승인 요청 불가 — 백엔드 연결 필요 (mock)</span>))
                  .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
              }}>
              {t('common.requestApproval', '승인 요청')}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
