/** S-4-1-2 Work Process 공정 데이터 (W-19) — 제조비 계산(CST-003) 입력.
 *  MAKE/BUY 구분이 Pricing Run 의 원가 경로를 결정. */
import { useEffect, useMemo, useState } from 'react'
import type { MaterialRow } from '../../api/types'
import { MACRO_CODING, MATERIAL_ROWS, PROCESS_DEF, PROCESS_OPTIONS } from '../../api/mock/data'
import { drawingLedgerService, workProcessService } from '../../api/services'
import { Btn, Chip, Combo, Fx, GroupBox } from '../../components/controls'
import { Cvs } from '../../components/Cvs'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function WorkProcessScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [process, setProcess] = useState(PROCESS_DEF.process)
  const [workplace, setWorkplace] = useState(PROCESS_DEF.workplace)
  const [person, setPerson] = useState(String(PROCESS_DEF.person))
  const [skill, setSkill] = useState(PROCESS_DEF.skill)
  const [wtime, setWtime] = useState(String(PROCESS_DEF.wtimeHr))
  const [rows, setRows] = useState<MaterialRow[]>(MATERIAL_ROWS)
  const [rowsReal, setRowsReal] = useState(false)
  const [selItem, setSelItem] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [cadView, setCadView] = useState<'2D' | '3D'>('2D')   // E5 — CAD 뷰 토글

  // E5 — 공정 항목 ↔ 도면 블록 매핑: 각 Item 을 블록으로 배치 (선택 = 블록 하이라이트)
  const cadBlocks = useMemo(() => rows.map((r, i) => ({
    id: r.item, name: r.item, sub: r.makeBuy,
    x: 10 + (i % 3) * 66, y: 12 + Math.floor(i / 3) * 50, w: 58, h: 40,
  })), [rows])
  // G3-c — 코드(도면) 컨텍스트 + 실 자재행 (도면 BOM + erp_work_process)
  const [code, setCode] = useState('KDCR 3-13')
  const [codeOpts, setCodeOpts] = useState<string[]>([])
  useEffect(() => {
    void drawingLedgerService.list().then((ds) => {
      const nos = ds.map((d) => d.drawingNo)
      if (nos.length) setCodeOpts(Array.from(new Set(nos)))
    })
  }, [])

  // 자재행 = 선택 코드의 도면 BOM 부품 + 저장된 MAKE/BUY (불가/무결과 시 mock)
  useEffect(() => {
    void workProcessService.materials(code).then((mats) => {
      if (mats && mats.length) { setRows(mats); setRowsReal(true) } else { setRows(MATERIAL_ROWS); setRowsReal(false) }
      setDirty(false)
    })
  }, [code])

  const save = () => {
    void workProcessService.save(rows.map((r) => ({ item: r.item, makeOrBuy: r.makeBuy })), code)
      .then((ok) => {
        if (ok) {
          setDirty(false)
          shell.setStatusMsg('공정 데이터 저장 ✓ — erp_work_process 영속 (CST-003 원가 경로 반영)')
        } else {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>저장 불가 — 백엔드 연결 필요</span>)
        }
      })
  }

  useFKeys(active, useMemo(() => ({ F12: save }), [rows])) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMakeBuy = (item: string) => {
    setRows((prev) => prev.map((r) => (r.item === item
      ? { ...r, makeBuy: r.makeBuy === 'MAKE' ? 'BUY' : 'MAKE', timeMin: r.makeBuy === 'MAKE' ? null : 45 }
      : r)))
    setDirty(true)
  }

  const cols: GridColumn<MaterialRow>[] = [
    { key: 'item', header: 'Item', width: 50, code: true, render: (r) => r.item },
    { key: 'wh', header: 'Warehouse', width: 70, align: 'center', render: (r) => r.warehouse },
    { key: 'min', header: 'Min Stock', width: 62, align: 'right', render: (r) => r.minStock },
    { key: 'sup', header: t('wp.supplier', '공급자'), width: 70, render: (r) => r.supplier },
    {
      key: 'mb', header: t('wp.makeBuy', '제조/구매 (더블클릭 전환)'), width: 130, align: 'center',
      render: (r) => (
        <span onDoubleClick={() => toggleMakeBuy(r.item)} style={{ cursor: 'pointer' }}>
          <Chip tone={r.makeBuy === 'MAKE' ? 'info' : 'ok'}>{r.makeBuy}</Chip>
        </span>
      ),
    },
    {
      key: 'time', header: t('wp.timeMin', 'Time(분)'), width: 58, align: 'right',
      render: (r) => (r.timeMin == null ? '-' : r.timeMin),
    },
    { key: 'rem', header: 'Remarks', render: (r) => r.remarks },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Code</label>
        <Combo width={130} value={code} options={codeOpts.length ? codeOpts : [code]}
          onChange={setCode} />
        <label>Process</label>
        <Combo width={110} value={process} options={PROCESS_OPTIONS.process}
          onChange={(v) => { setProcess(v); setDirty(true) }} />
        <label>Work place</label>
        <Combo width={110} value={workplace} options={PROCESS_OPTIONS.workplace}
          onChange={(v) => { setWorkplace(v); setDirty(true) }} />
        <label>Person</label>
        <input className="in" style={{ width: 40 }} value={person} aria-label="Person"
          onChange={(e) => { setPerson(e.target.value); setDirty(true) }} />
        <label>Skill</label>
        <Combo width={60} value={skill} options={PROCESS_OPTIONS.skill}
          onChange={(v) => { setSkill(v); setDirty(true) }} />
        <label>W. Time</label>
        <input className="in" style={{ width: 48 }} value={wtime} aria-label="W Time"
          onChange={(e) => { setWtime(e.target.value); setDirty(true) }} />
        <span className="unit">hr</span>
        <span style={{ flex: 1 }} />
        {dirty ? <Chip tone="warn">{t('wp.unsaved', '미저장 변경')}</Chip> : null}
        <Btn variant="pri" onClick={save}>{t('wp.saveF12', '저장 F12')}</Btn>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div className="fill-col" style={{ flex: 1, padding: 6, gap: 6, overflow: 'auto' }}>
          <GroupBox title={t('wp.processDef', '공정 정의 — {c} · {p} @ {w}')
            .replace('{c}', code).replace('{p}', process).replace('{w}', workplace)} noPad
            right={rowsReal ? <Chip tone="ok">dwg_bom×erp_work_process</Chip> : <Chip tone="warn">MOCK</Chip>}>
            <DenseGrid columns={cols} rows={rows}
              rowKey={(r) => r.item} selectedKey={selItem}
              onRowClick={(r) => setSelItem(r.item)} />
          </GroupBox>
          <GroupBox title={t('wp.cadMapping', 'CAD Mapping — 공정 항목 ↔ 도면 블록')}
            right={(
              <span style={{ display: 'inline-flex', gap: 2 }}>
                {(['2D', '3D'] as const).map((v) => (
                  <span key={v} role="button" data-cad-view={v}
                    onClick={() => setCadView(v)}
                    style={{
                      cursor: 'pointer', fontSize: 9.5, padding: '1px 7px', borderRadius: 2,
                      fontWeight: cadView === v ? 700 : 500,
                      color: cadView === v ? '#fff' : 'var(--txt-mute)',
                      background: cadView === v ? 'var(--title-navy)' : 'transparent',
                      border: '1px solid var(--line)',
                    }}>{v === '2D' ? '2D ☑' : '3D'}</span>
                ))}
              </span>
            )}>
            {cadView === '2D' ? (
              <Cvs blocks={cadBlocks} selectedId={selItem}
                onSelect={(b) => setSelItem(b.id)}
                style={{ height: 120 }} />
            ) : (
              <div className="cvs" style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--txt-mute)', textAlign: 'center', lineHeight: 1.7 }}>
                  🧊 {t('wp.cad3d', '3D 뷰 — §C 범위 외 (2D 도면 블록 매핑만 지원)')}<br />
                  <span style={{ fontSize: 9.5 }}>{t('wp.cad3dHint', '2D 로 전환하면 선택 항목의 도면 블록이 하이라이트됩니다')}</span>
                </span>
              </div>
            )}
            {selItem && cadView === '2D' ? (
              <div style={{ fontSize: 9.5, color: 'var(--txt-dim)', marginTop: 3 }}>
                {t('wp.cadSelected', '선택 블록: {i} (그리드 행 ↔ 도면 블록 연동)').replace('{i}', selItem)}
              </div>
            ) : null}
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 296, display: 'flex', flexDirection: 'column', padding: 6, gap: 6, overflow: 'auto' }}>
          <GroupBox title="Coding" right={
            <Btn variant="run" style={{ height: 18, fontSize: 10 }}
              onClick={() => shell.setStatusMsg('제조비 산식 평가 ✓ — 시간×임율×장비 (DWG-021)')}>
              Run
            </Btn>
          }>
            <Fx>{MACRO_CODING}</Fx>
          </GroupBox>
          <GroupBox title="Code">
            <input className="in ro" style={{ width: '100%', fontFamily: 'Consolas, monospace' }}
              value={code} readOnly aria-label="Code" />
          </GroupBox>
          <GroupBox title="Table — Work Process" noPad
            right={<span className="b" style={{ height: 18, fontSize: 10 }}>＋ ✎ ⬇</span>}>
            <table className="g">
              <thead><tr><th>Item</th><th>A</th><th>C</th><th>E</th></tr></thead>
              <tbody>
                <tr><td className="code">560</td><td className="num"></td><td className="num">45</td><td className="num">656</td></tr>
                <tr><td className="code">630</td><td className="num"></td><td className="num">45</td><td className="num">656</td></tr>
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title={t('wp.costPath', '원가 경로 (Pricing Run)')}>
            <div style={{ fontSize: 11, lineHeight: 1.9 }}>
              {t('wp.makePath', 'MAKE {n}건 → 제조비 (시간×임율)')
                .replace('{n}', String(rows.filter((r) => r.makeBuy === 'MAKE').length))}<br />
              {t('wp.buyPath', 'BUY {n}건 → 구매 단가 resolve')
                .replace('{n}', String(rows.filter((r) => r.makeBuy === 'BUY').length))}<br />
              <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
                {t('wp.toggleHint', 'MAKE/BUY 전환은 Material Data 더블클릭')}
              </span>
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
