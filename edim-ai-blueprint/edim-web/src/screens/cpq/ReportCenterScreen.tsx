/** Report Center (RPT) — 산발 리포트 생성기를 한 곳에 카탈로그화.
 *  카테고리별 리포트 개요 + PCR 수익성 보고서 PDF 생성(RPT-07). 각 카테고리는 해당 화면으로 이동. */
import { useCallback, useEffect, useState } from 'react'
import { reportService, type PcrReportRow, type ReportCatalogRow } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { SCREEN_BY_NODE } from '../../shell/menus'
import type { ScreenProps } from '../../shell/Shell'

const CAT_TONE: Record<string, 'ok' | 'warn' | 'info'> = { 원가: 'info', 영업: 'ok', 문서: 'warn', 설계: 'info', 보안: 'warn' }

export function ReportCenterScreen({ active }: ScreenProps) {
  void active
  const shell = useShell()
  const { setStatusMsg } = shell
  const [catalog, setCatalog] = useState<ReportCatalogRow[]>([])
  const [pcr, setPcr] = useState<PcrReportRow[]>([])
  const [offline, setOffline] = useState(false)

  const load = useCallback(() => {
    void reportService.catalog().then((r) => { if (r === null) setOffline(true); else { setOffline(false); setCatalog(r) } })
    void reportService.pcrList().then((r) => { if (r) setPcr(r) })
  }, [])
  useEffect(() => { load() }, [load])

  const openScreen = (nodeId: string) => {
    const def = SCREEN_BY_NODE[nodeId]
    if (def) shell.openTab({ id: nodeId, ...def })
    else setStatusMsg('해당 화면을 찾을 수 없습니다')
  }
  const pcrPdf = (id: number) => {
    void reportService.pcrPdf(id)
      .then(() => setStatusMsg(`PCR 보고서 PDF ✓ — #${id}`))
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const pcrCols: GridColumn<PcrReportRow>[] = [
    { key: 'code', header: '제품 코드', width: 120, code: true, render: (r) => r.code },
    { key: 'biz', header: '사업유형', width: 100, align: 'center', render: (r) => r.businessType },
    { key: 'direct', header: '직접비', width: 110, align: 'right', render: (r) => r.directCostTotal.toLocaleString() },
    { key: 'cm', header: '기여마진', width: 110, align: 'right', render: (r) => r.contributionMargin != null ? r.contributionMargin.toLocaleString() : '—' },
    { key: 'ebit', header: 'EBIT', width: 110, align: 'right', render: (r) => r.ebit != null ? r.ebit.toLocaleString() : '—' },
    { key: 'status', header: '상태', width: 80, align: 'center', render: (r) => <Chip tone="info">{r.status}</Chip> },
    { key: 'act', header: '보고서', width: 70, align: 'center', noSort: true, render: (r) => <Btn style={{ height: 18, fontSize: 9.5 }} onClick={() => pcrPdf(r.pcrId)}>🖶 PDF</Btn> },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>Report Center</span>
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>산발 리포트를 한 곳에서 — 카테고리 카드 · PCR 수익성 보고서 생성</span>
        <span style={{ flex: 1 }} />
        <Btn onClick={load}>조회 F8</Btn>
      </div>
      <div className="fill-col" style={{ padding: 6, gap: 6, overflow: 'hidden' }}>
        <GroupBox title="리포트 카탈로그" noPad style={{ flex: 'none' }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>백엔드 연결 필요</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8 }}>
              {catalog.map((c) => (
                <div key={c.id} style={{ width: 210, border: '1px solid var(--line)', borderRadius: 3, padding: 8, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Chip tone={CAT_TONE[c.category] ?? 'info'}>{c.category}</Chip>
                    <b style={{ fontSize: 11, color: 'var(--title-navy)' }}>{c.name}</b>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>{c.kind}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--txt-dim)', lineHeight: 1.5, minHeight: 28 }}>{c.desc}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{c.count != null ? `${c.count}건` : '—'}</span>
                    <span style={{ flex: 1 }} />
                    <Btn style={{ height: 18, fontSize: 9.5 }} onClick={() => openScreen(c.screen)}>열기 →</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GroupBox>
        <GroupBox title={`PCR 수익성 보고서 — ${pcr.length}건 (RPT-07)`} noPad style={{ flex: 1, minHeight: 0 }}>
          {pcr.length ? (
            <DenseGrid prefKey="rpt-pcr" columns={pcrCols} rows={pcr} rowKey={(r) => r.pcrId} />
          ) : (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>PCR 데이터 없음 — Run 화면에서 PCR 생성 후 표시됩니다</div>
          )}
        </GroupBox>
      </div>
    </div>
  )
}
