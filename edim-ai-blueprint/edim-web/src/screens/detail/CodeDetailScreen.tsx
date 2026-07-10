/** 코드 상세 (드릴다운) — BOM·Child Group·발주·단가 그리드 더블클릭으로 진입.
 *  코드 자산(도면·단가 이력·Referencers·승인 이력)을 한 탭에 집약. */
import { useEffect, useState } from 'react'
import { CODE_APPROVAL_HIST, WHERE_USED, type ApprovalHistRow } from '../../api/mock/dataDetail'
import { PRICES } from '../../api/mock/dataErp'
import { drawingLedgerService, referencerService } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { Cvs } from '../../components/Cvs'
import { DenseGrid } from '../../components/DenseGrid'
import { SCREEN_BY_NODE } from '../../shell/menus'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

export function CodeDetailScreen({ tab }: ScreenProps) {
  const shell = useShell()
  const code = String(tab.params?.code ?? 'KDCR 3-13')
  const name = String(tab.params?.name ?? '')
  // 단가·Referencers 는 base code (resolved 접미 제거) 로 조회
  const base = Object.keys(WHERE_USED).find((k) => code.startsWith(k))
    ?? code.split('-').slice(0, 2).join('-')
  const prices = PRICES.filter((p) => code.startsWith(p.code))
  const [used, setUsed] = useState(WHERE_USED[base] ?? [])
  // 승인 이력 — null = 백엔드 불가 (mock 표시), [] = 라이브인데 이력 없음 (정직 표기)
  const [hist, setHist] = useState<ApprovalHistRow[] | null>(null)

  // Where-Used 실데이터 — code_relationship 역참조 (백엔드 불가·무결과 시 mock 유지)
  useEffect(() => {
    void referencerService.list(base).then((rows) => {
      if (rows && rows.length) {
        setUsed(rows.map((r) => ({
          mother: r.code, desc: r.name, qty: r.qty, level: r.status,
        })))
      }
    })
  }, [base])

  // 승인 이력 실조회 — sys_approval_request (B7, CODE_APPROVAL_HIST mock 대체; base code 기준)
  useEffect(() => {
    void drawingLedgerService.approvalHistory(base).then(setHist)
  }, [base])

  // 도면 열기 — dwg_drawing 연결 DXF 를 CAD 뷰어로 (B7, 도면번호 = base code)
  const openDrawing = () => {
    void drawingLedgerService.list(base).then((rows) => {
      const d = rows[0]
      if (d?.fileId) {
        shell.openTab({
          id: `cad-viewer:${d.fileId}`, screenId: 'cad-viewer',
          code: 'CAD', title: (d.fileName ?? d.drawingNo).slice(0, 16),
          params: { fileId: d.fileId, name: d.fileName ?? d.drawingNo, from: tab.id },
        })
      } else if (d) {
        shell.openTab({
          ...SCREEN_BY_NODE['plm-drawings'], id: 'plm-drawings', params: { select: d.drawingNo },
        })
        shell.setStatusMsg(<span style={{ color: 'var(--warn)' }}>
          {d.drawingNo} — 연결된 DXF 없음 (Run 산출물 생성 시 자동 연결)</span>)
      } else {
        shell.setStatusMsg(<span style={{ color: 'var(--warn)' }}>
          {code} — 등록 도면 없음 (도면 대장 M-4-1 에서 등록)</span>)
      }
    })
  }

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Main Code</label>
        <input className="in ro" style={{ width: 150, fontFamily: 'Consolas, monospace' }}
          value={code} readOnly aria-label="Main Code" />
        {name ? <span style={{ fontWeight: 700 }}>{name}</span> : null}
        <Chip tone="ok">APPROVED</Chip>
        <Chip tone="info">Grade B</Chip>
        <span style={{ flex: 1 }} />
        <Btn>Variants</Btn>
        <Btn>Referencers</Btn>
        <Btn onClick={() => {
          shell.openTab(SCREEN_BY_NODE['plm-drawings'])
          shell.setStatusMsg('Supersedure — 도면 대장(M-4-1) 우측 대체 이력 (dwg_supersedure)')
        }}>Supersedure</Btn>
        <Btn variant="pri" onClick={openDrawing}>도면 열기</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1.2, overflow: 'auto' }}>
          <GroupBox title="대표 도면 (Block)" right={<Chip tone="info">3D ☑ 2D ☐</Chip>}>
            <Cvs blocks={[
              { id: 'b', name: name || 'Block', sub: code, x: 60, y: 24, w: 170, h: 90 },
            ]}
              dims={[{ x: 60, y: 8, w: 170, label: '670' }]}
              style={{ height: 150 }} />
          </GroupBox>
          <GroupBox title={`단가 이력 — ${prices.length}건 (cst_price)`} noPad>
            {prices.length ? (
              <table className="g">
                <thead>
                  <tr><th>Supplier</th><th>Price</th><th>소스</th><th>적용 시작</th><th>종료</th><th>상태</th></tr>
                </thead>
                <tbody>
                  {prices.map((p, i) => (
                    <tr key={i}>
                      <td className="c">{p.supplier}</td>
                      <td className="num">{p.price.toLocaleString()}</td>
                      <td className="c"><Chip tone="info">{p.source}</Chip></td>
                      <td className="c">{p.from}</td>
                      <td className="c">{p.to ?? '-'}</td>
                      <td className="c">{p.active ? <Chip tone="ok">적용중</Chip> : <Chip tone="warn">만료</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
                등록 단가 없음 — Pricing Run 시 warn 대상 (단가 관리 M-12-5 에서 등록)
              </div>
            )}
          </GroupBox>
          <GroupBox title={`Referencers (Where-Used) — ${used.length}건`} noPad
            right={<span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>이 코드를 사용하는 Mother</span>}>
            {used.length ? (
              <DenseGrid rows={used} rowKey={(r) => r.mother}
                columns={[
                  { key: 'm', header: 'Mother', width: 110, code: true, render: (r) => r.mother },
                  { key: 'd', header: 'Desc.', render: (r) => r.desc },
                  { key: 'q', header: "Q'ty", width: 36, align: 'right', render: (r) => r.qty },
                  { key: 'l', header: '구분', width: 80, align: 'center', render: (r) => r.level },
                ]} />
            ) : (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
                상위 참조 없음 — 최상위 또는 미연결 코드
              </div>
            )}
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="코드 정보">
            <div className="frm c2">
              <label>유형</label>
              <input className="in ro" value={code.startsWith('KDCR') ? 'PRODUCT' : 'SUB'} readOnly aria-label="유형" />
              <label>Hierarchy</label>
              <input className="in ro" value={`/C/ENG/FAN/${base}`} readOnly
                style={{ fontFamily: 'Consolas, monospace' }} aria-label="Hierarchy" />
              <label>등록자</label>
              <input className="in ro" value="YS.Gang" readOnly aria-label="등록자" />
              <label>Remarks</label>
              <input className="in" defaultValue="" aria-label="Remarks" />
            </div>
          </GroupBox>
          <GroupBox title="연결 자산">
            <div style={{ fontSize: 11, lineHeight: 2 }}>
              <b style={{ color: 'var(--title-navy)' }}>Table</b> {base} (Variant)
              <span className="b" style={{ float: 'right', height: 18, fontSize: 10 }}
                onClick={() => shell.openTab({ id: 'code-datatable', screenId: 'code-datatable', code: 'M-3-7', title: '데이터 Table' })}>열기</span><br />
              <b style={{ color: 'var(--title-navy)' }}>Macro</b> 치수 2식 · 검증 1식<br />
              <b style={{ color: 'var(--title-navy)' }}>기술자료</b> Fan 성능 Variant
            </div>
          </GroupBox>
          <GroupBox title="승인 이력 (sys_approval_request)" noPad
            right={hist === null
              ? <Chip tone="warn">MOCK</Chip>
              : <span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>{hist.length}건</span>}>
            {(hist ?? CODE_APPROVAL_HIST).length ? (
              <table className="g">
                <thead><tr><th>일자</th><th>행위</th><th>처리자</th></tr></thead>
                <tbody>
                  {(hist ?? CODE_APPROVAL_HIST).map((h, i) => (
                    <tr key={i} title={h.note}>
                      <td className="c">{h.date}</td>
                      <td>{h.action}</td>
                      <td className="c">{h.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
                승인 이력 없음 — 이 코드를 대상으로 한 승인 요청이 아직 없습니다
              </div>
            )}
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
