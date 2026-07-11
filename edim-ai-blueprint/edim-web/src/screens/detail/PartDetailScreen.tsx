/** 부품 정보 상세 (드릴다운) — Design Editor 캔버스 Block 더블클릭으로 진입 (DWG-012).
 *  치수 바인딩 · Work Process · 조립 순서 ◆ (dwg_bom 실데이터, B17) · QC 주의사항. */
import { useEffect, useState } from 'react'
import { PART_INFO } from '../../api/mock/dataDetail'
import { DWG_DIMS, PROCESS_DEF } from '../../api/mock/data'
import { partService, type BomRow, type PartDetail } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { Cvs } from '../../components/Cvs'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

export function PartDetailScreen({ tab }: ScreenProps) {
  const shell = useShell()
  const partId = String(tab.params?.partId ?? 'brgL')
  const partName = typeof tab.params?.name === 'string' ? tab.params.name : null
  const drawing = String(tab.params?.drawing ?? 'KDCR 3-13')
  const mockInfo = PART_INFO[partId] ?? PART_INFO.casing

  // G3-b — 부품 상세 실데이터 (도면 BOM 블록 매칭 + 치수 + 공정, 불가/미매칭 시 mock)
  const [detail, setDetail] = useState<PartDetail | null>(null)
  useEffect(() => {
    void partService.detail(drawing, partName ?? mockInfo.name).then(setDetail)
  }, [drawing, partName, mockInfo.name])
  const rp = detail?.part ?? null
  const info = {
    name: rp?.name ?? mockInfo.name,
    code: rp?.partNo ?? mockInfo.code,
    material: (rp?.material && rp.material !== '-') ? rp.material : mockInfo.material,
    makeBuy: (rp?.makeBuy && rp.makeBuy !== '-') ? rp.makeBuy : mockInfo.makeBuy,
    status: rp ? (rp.isStandard ? 'APPROVED' : mockInfo.status) : mockInfo.status,
    caution: mockInfo.caution,
  }
  const dims = (detail?.dims.length ? detail.dims : DWG_DIMS.filter((d) => mockInfo.dims.includes(d.no)))
  const proc = detail?.process ?? PROCESS_DEF
  const procReal = detail?.process != null

  // 조립 순서 ◆ — dwg_bom 실데이터 (블록명 매칭, 불가 시 mock seq)
  const [bom, setBom] = useState<BomRow[] | null>(null)
  useEffect(() => { void partService.bom(drawing).then(setBom) }, [drawing])
  const wantName = (partName ?? info.name).toLowerCase()
  const bomRow = bom?.find((b) =>
    b.partName.toLowerCase().includes(wantName) || wantName.includes(b.partName.split(' ')[0].toLowerCase()))
  const seq = bomRow?.assemblySeq ?? rp?.assemblySeq ?? mockInfo.assemblySeq
  const maxSeq = bom?.length ? Math.max(...bom.map((b) => b.assemblySeq ?? 0), seq) : 5

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Block</label>
        <span style={{ fontWeight: 700 }}>{info.name}</span>
        <label>Code</label>
        <input className="in ro" style={{ width: 110, fontFamily: 'Consolas, monospace' }}
          value={info.code} readOnly aria-label="Part Code" />
        {info.status === 'APPROVED'
          ? <Chip tone="ok">APPROVED</Chip>
          : <Chip tone="warn">DRAFT — 승인 후 사용</Chip>}
        <Chip tone={info.makeBuy === 'MAKE' ? 'info' : 'ok'}>{info.makeBuy}</Chip>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => shell.openTab({
          id: `code-detail:${info.code}`, screenId: 'code-detail',
          code: '상세', title: info.code, params: { code: info.code, name: info.name },
        })}>코드 상세</Btn>
        <Btn variant="pri" onClick={() => shell.setStatusMsg(`${info.name} — Block 편집 (Design Editor)`)}>
          Block 편집
        </Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1.2, overflow: 'auto' }}>
          <GroupBox title={`Block 도면 — ${info.name}`}>
            <Cvs blocks={[{ id: 'p', name: info.name, sub: info.code, x: 70, y: 30, w: 180, h: 100 }]}
              dims={[{ x: 70, y: 12, w: 180, label: dims[0] ? `${dims[0].no} = ${dims[0].value}` : '' }]}
              style={{ height: 170 }} />
          </GroupBox>
          <GroupBox title={`치수 바인딩 — ${dims.length}건 (DWG-005/006)`} noPad
            right={detail?.dims.length ? <Chip tone="ok">dwg_dimension</Chip> : <Chip tone="warn">MOCK</Chip>}>
            <table className="g">
              <thead><tr><th>No.</th><th>값</th><th>Set-up</th><th>구분</th></tr></thead>
              <tbody>
                {dims.map((d) => (
                  <tr key={d.no}>
                    <td className="c"><b>{d.no}</b></td>
                    <td className="num code">{d.value}</td>
                    <td className="c"><Chip tone={d.binding === 'MACRO' ? 'info' : 'ok'}>{d.binding}</Chip></td>
                    <td className="c">{d.kind}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title="재질·조달">
            <div className="frm c2">
              <label>재질</label>
              <input className="in ro" value={info.material} readOnly aria-label="재질" />
              <label>제조/구매</label>
              <input className="in ro" value={info.makeBuy === 'MAKE' ? 'MAKE — 사내 제작' : 'BUY — 외주/구매'}
                readOnly aria-label="제조구매" />
            </div>
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="Work Process 연결 (DWG-021)"
            right={procReal ? <Chip tone="ok">erp_work_process</Chip> : <Chip tone="warn">MOCK</Chip>}>
            <div className="frm c2">
              <label>Process</label>
              <input className="in ro" value={proc.process} readOnly aria-label="Process" />
              <label>Work place</label>
              <input className="in ro" value={proc.workplace} readOnly aria-label="Workplace" />
              <label>인원·Skill</label>
              <input className="in ro" value={`${proc.person}명 · ${proc.skill}`} readOnly aria-label="인원" />
              <label>W. Time</label>
              <input className="in ro" value={`${proc.wtimeHr} hr`} readOnly aria-label="WTime" />
            </div>
            <div style={{ fontSize: 10, color: 'var(--txt-mute)', marginTop: 4 }}>
              제조비 = 시간 × 임율 × 장비 (CST-003 입력)
            </div>
          </GroupBox>
          <GroupBox title={`◆ 조립 순서 — ${seq}번째`}
            right={bomRow
              ? <Chip tone="ok">dwg_bom #{bomRow.itemNo}</Chip>
              : bom !== null ? <Chip tone="warn">MOCK</Chip> : null}>
            <div className="flow">
              {Array.from({ length: Math.max(maxSeq, 5) }, (_, i) => i + 1).map((n, i, arr) => (
                <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span className={`fs ${n === seq ? 'now' : n < seq ? 'done' : ''}`}>
                    ◆{n}
                  </span>
                  {i < arr.length - 1 ? <span className="ar">→</span> : null}
                </span>
              ))}
            </div>
            {bomRow?.assemblyNote ? (
              <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', marginTop: 4 }}>
                {bomRow.assemblyNote} — 수량 ×{bomRow.qty} ({bomRow.partNo})
              </div>
            ) : null}
          </GroupBox>
          <GroupBox title="주의사항 (QC/Material/Mfg)">
            <div style={{ fontSize: 11, lineHeight: 1.8 }}>
              {info.caution
                ? <><Chip tone="warn">주의</Chip> {info.caution}</>
                : <span style={{ color: 'var(--txt-mute)' }}>등록된 주의사항 없음</span>}
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
