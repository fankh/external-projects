/** M-4-3 건축 설비 Design — Duct 자동 배치 (W-15, 슬라이드 68).
 *  실엔진화: 정적 div mock → 서버 작도 DXF(/cad/duct-layout)를 CadSvg 실엔진 렌더.
 *  CadSvg 편집(치수 DI·Block 삽입) 인터랙티브 지원 — onEdit 로컬 적용. */
import { useCallback, useState } from 'react'
import { DUCT_CALC } from '../../api/mock/dataMore'
import { cadService, type CadDocument, type CadEntity } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { CadSvg, type CadEditOp } from '../../components/CadSvg'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

/** 생성 문서에 작도 op 로컬 적용 — 인터랙티브 치수/블록 (파일 영속 없이 화면 편집) */
function applyCadOps(doc: CadDocument, ops: CadEditOp[]): CadDocument {
  const ents: CadEntity[] = [...doc.entities]
  let seq = ents.length + 1
  const nid = () => `e-local-${seq++}`
  for (const op of ops) {
    if (op.op !== 'add') continue
    const layer = op.layer ?? 'DUCT'
    if (op.entityType === 'line' || op.entityType === 'dim') {
      ents.push({ entityId: nid(), entityType: 'line', layerName: op.entityType === 'dim' ? 'DIM' : layer,
        startPoint: { x: op.x1!, y: op.y1! }, endPoint: { x: op.x2!, y: op.y2! } })
      if (op.entityType === 'dim') {
        const len = Math.round(Math.hypot(op.x2! - op.x1!, op.y2! - op.y1!))
        ents.push({ entityId: nid(), entityType: 'text', layerName: 'DIM',
          insertionPoint: { x: (op.x1! + op.x2!) / 2, y: (op.y1! + op.y2!) / 2 }, textContent: String(len), textHeight: 80 })
      }
    } else if (op.entityType === 'circle') {
      ents.push({ entityId: nid(), entityType: 'circle', layerName: layer, centerPoint: { x: op.x1!, y: op.y1! }, radius: op.radius! })
    } else if (op.entityType === 'rect' || op.entityType === 'block') {
      const x1 = op.x1!, y1 = op.y1!, x2 = op.x2!, y2 = op.y2!
      ents.push({ entityId: nid(), entityType: 'polyline', layerName: op.entityType === 'block' ? 'AHU' : layer, isClosed: true,
        vertexPoints: [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }] })
      if (op.entityType === 'block')
        ents.push({ entityId: nid(), entityType: 'text', layerName: 'LABEL',
          insertionPoint: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, textContent: op.text ?? 'BLOCK', textHeight: 70 })
    }
  }
  return { ...doc, entities: ents }
}

export function DuctDesignScreen(_props: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [doc, setDoc] = useState<CadDocument | null>(null)
  const [offline, setOffline] = useState(false)
  const [diffusers, setDiffusers] = useState(3)
  const [floor, setFloor] = useState('3F')
  const [edit, setEdit] = useState(false)
  const [tool, setTool] = useState<string | null>(null)
  const placed = doc !== null

  const generate = useCallback((nd: number, fl: string) => {
    void cadService.ductLayout(nd, fl).then((d) => {
      if (d === null) { setOffline(true); return }
      setOffline(false); setDoc(d)
      shell.setStatusMsg(`자동 배치 ✓ — 실엔진 작도(/cad/duct-layout) · ${fl} · Diffuser ${nd}개 (최단 경로·유체 흐름)`)
    })
  }, [shell])

  const onEdit = useCallback((ops: CadEditOp[]) => {
    setDoc((d) => (d ? applyCadOps(d, ops) : d))
    const k = ops[0]?.entityType
    shell.setStatusMsg(k === 'dim' ? '치수 기입 ✓ (인터랙티브 DI)' : k === 'block' ? 'Block 삽입 ✓' : `작도 ✓ — ${k}`)
  }, [shell])

  return (
    <div className="fill-col">
      <div className="qband">
        <Chip tone="err">{t('duct.scopeChip', '사업 범위 확정 대상 (보완노트 §3.3)')}</Chip>
        <label>{t('duct.floor', '층')}</label>
        <Combo width={58} value={floor} options={['1F', '2F', '3F']} onChange={(v) => { setFloor(v); if (placed) generate(diffusers, v) }} />
        <span style={{ flex: 1 }} />
        <Btn variant="run" onClick={() => generate(diffusers, floor)}>{t('duct.autoPlace', '▶ 자동 배치 (최단 경로·유체 흐름)')}</Btn>
        <Btn disabled={!placed} onClick={() => { const nd = diffusers + 1; setDiffusers(nd); generate(nd, floor) }}>{t('duct.addDiffuser', 'Diffuser 추가')}</Btn>
        <Btn disabled={!placed} variant={edit ? 'pri' : 'default'} onClick={() => setEdit((e) => !e)}>{t('duct.manualAdjust', '✎ 수동 조정 (치수·Block)')}</Btn>
        {edit ? (
          <>
            <Btn variant={tool === 'dim' ? 'pri' : 'default'} onClick={() => setTool('dim')}>{t('duct.dim', '치수 DI')}</Btn>
            <Btn variant={tool === 'block' ? 'pri' : 'default'} onClick={() => setTool('block')}>{t('duct.block', 'Block')}</Btn>
          </>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 210, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none', overflow: 'auto' }}>
          <GroupBox title={t('duct.designCond', '설계 조건')}>
            <div className="frm c2">
              <label>{t('duct.usage', '용도')}</label>
              <Combo value="급기" options={[
                { value: '급기', label: t('duct.supply', '급기') },
                { value: '배기', label: t('duct.exhaust', '배기') },
                { value: '환기', label: t('duct.vent', '환기') },
              ]} />
              <label>{t('duct.airflowBasis', '풍량 기준')}</label>
              <Combo value="환기 횟수" options={[
                { value: '환기 횟수', label: t('duct.ach', '환기 횟수') },
                { value: '인원', label: t('duct.occupancy', '인원') },
                { value: '발열', label: t('duct.heatLoad', '발열') },
              ]} />
              <label>{t('duct.airCond', '공기 조건')}</label>
              <input className="in" defaultValue="Air · 20℃ · 50%" aria-label="공기 조건" />
              <label>{t('duct.velocityBasis', '유속 기준')}</label>
              <Combo value="Std 선택" options={[
                { value: 'Std 선택', label: t('duct.stdSelect', 'Std 선택') },
                { value: '저속', label: t('duct.lowVel', '저속') },
                { value: '고속', label: t('duct.highVel', '고속') },
              ]} />
              <label>{t('duct.ceiling', '층고/보/텍스')}</label>
              <input className="in" defaultValue="4.2 / 0.6 / 2.8 m" aria-label="층고" />
            </div>
          </GroupBox>
          <GroupBox title={t('duct.startEnd', '출발–종착')}>
            <div className="frm c2">
              <label>{t('duct.equipment', '장비')}</label>
              <Combo value="AHU-3" options={['AHU-3', 'AHU-5']} />
              <label>{t('duct.room', '실')}</label>
              <Combo value="Cleanroom A" options={['Cleanroom A', 'Room B']} />
            </div>
          </GroupBox>
          <GroupBox title={t('duct.drawingCall', '도면 호출 (AI 판독)')}>
            <div style={{ fontSize: 10, color: 'var(--txt-dim)', lineHeight: 1.7 }}>
              {t('duct.aiReadHint', '건축도 AI 판독: 램프·빔·소방구역·실 구분 → 설치 불가 지역 표시 (DUCT-001)')}
            </div>
          </GroupBox>
        </div>
        <div className="fill-col">
          <GroupBox noPad style={{ flex: 1, minHeight: 320 }}
            title={t('duct.canvasTitle', 'Duct 자동 배치 — CAD 실엔진 (DXF)')}
            right={placed ? <Chip tone="ok">Diffuser {diffusers} · {floor}</Chip> : null}>
            {doc ? (
              <CadSvg doc={doc} editable={edit} onEdit={onEdit}
                activeTool={tool} onToolConsumed={() => setTool(null)} />
            ) : offline ? (
              <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>백엔드 연결 필요 — Duct 배치는 서버 작도(/cad/duct-layout)에서만 생성됩니다</div>
            ) : (
              <div style={{ padding: 16, fontSize: 11, color: 'var(--txt-mute)' }}>{t('duct.runAutoHint', '▶ 자동 배치를 실행하십시오')}</div>
            )}
          </GroupBox>
        </div>
        <div className="split-h" />
        <div className="side-scroll" style={{ width: 270, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GroupBox title={t('duct.techCalc', '기술자료 계산')} noPad>
            {placed ? (
              <table className="g">
                <thead><tr><th>{t('duct.itemCol', '항목')}</th><th>{t('duct.valueCol', '값')}</th></tr></thead>
                <tbody>
                  {DUCT_CALC.map((c) => (
                    <tr key={c.item}>
                      <td>{c.item}</td>
                      <td className="num">{c.item === '결로 위험'
                        ? <Chip tone="ok">{c.value}</Chip> : c.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 10, fontSize: 10.5, color: 'var(--txt-mute)' }}>
                {t('duct.calcHint', '배치 후 압력손실·Leak·하중 계산')}
              </div>
            )}
          </GroupBox>
          <GroupBox title={t('duct.materialDb', 'Duct 자재 DB')}>
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
              {t('duct.materialHint', '종류·손실·무게·Size별 최대길이')}<br />Pitting·Hanger·Joint·Insulation
            </div>
          </GroupBox>
          <GroupBox title={t('duct.edimLink', 'EDIM 연결')} right={
            <Btn variant="run" style={{ height: 18, fontSize: 10 }} disabled={!placed}
              onClick={() => shell.setStatusMsg('EDIM Run — Duct BOM·스크랩 최적화·구매·견적 연동 (DUCT-007)')}>
              EDIM Run
            </Btn>
          }>
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.7 }}>
              {t('duct.edimHint1', '기술: BOM/Code · 제조: 최소 스크랩')}<br />
              {t('duct.edimHint2', '자재: 구매 · 영업: 견적')}
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
