import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'

export const dynamic = 'force-dynamic'

interface BomRow { bomId: number; itemNo: number; partNo: string; partName: string; qty: number; assemblySeq: number | null; assemblyNote: string; unit: string; isStandard: boolean }
interface PartDetail {
  drawing: string; block: string
  part: { partNo: string; name: string; spec: string; material: string; supplier: string; weight: number | null; isStandard: boolean; makeBuy: string; assemblySeq: number | null; assemblyNote: string; qty: number; itemNo: number } | null
  dims: { no: string; value: string; binding: 'MACRO' | 'VARIANT'; kind: string }[]
  process: { process: string; workplace: string; person: number; skill: string; wtimeHr: number; makeBuy: string } | null
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 6, fontSize: 11 }}><span style={{ color: 'var(--txt-mute)', width: 68, flexShrink: 0 }}>{label}</span><span>{value ?? '—'}</span></div>
}

export default async function PartDetailPage({ searchParams }: { searchParams: Promise<{ drawing?: string; block?: string }> }) {
  const sp = await searchParams
  const drawing = (sp.drawing ?? 'KDCR 3-13').trim()
  const block = (sp.block ?? 'brgL').trim()
  let detail: PartDetail | null = null
  let bom: BomRow[] = []
  let err: string | null = null
  try {
    const [d, b] = await Promise.all([
      apiServer<PartDetail>(`/parts/detail?drawing=${encodeURIComponent(drawing)}&block=${encodeURIComponent(block)}`),
      apiServer<BomRow[]>(`/drawings/${encodeURIComponent(drawing)}/bom`),
    ])
    detail = d; bom = b
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  const p = detail?.part
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`부품 상세 — ${block} (${drawing})`} source="/parts/detail · /drawings/{no}/bom" />
      {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 6, padding: 6 }}>
          <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="gb" style={{ padding: 8, gap: 4, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>속성</div>
              <Field label="부품번호" value={p?.partNo} />
              <Field label="이름" value={p?.name} />
              <Field label="규격" value={p?.spec} />
              <Field label="재질" value={p?.material} />
              <Field label="공급처" value={p?.supplier} />
              <Field label="중량" value={p?.weight != null ? `${p.weight} kg` : '—'} />
              <Field label="Make/Buy" value={p?.makeBuy} />
              <Field label="수량" value={p?.qty} />
            </div>
            {detail?.process ? (
              <div className="gb" style={{ padding: 8, gap: 4, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>공정</div>
                <Field label="공정" value={detail.process.process} />
                <Field label="작업장" value={detail.process.workplace} />
                <Field label="인원" value={detail.process.person} />
                <Field label="숙련도" value={detail.process.skill} />
                <Field label="공수" value={`${detail.process.wtimeHr} h`} />
              </div>
            ) : null}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="gb" style={{ flex: 'none', maxHeight: 180, overflow: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>치수 바인딩 ({detail?.dims.length ?? 0})</div>
              <table className="g"><thead><tr><th>번호</th><th>값</th><th>바인딩</th><th>종류</th></tr></thead>
                <tbody>{(detail?.dims ?? []).map((d) => <tr key={d.no}><td className="code">{d.no}</td><td className="num">{d.value}</td><td className="c">{d.binding}</td><td className="c">{d.kind}</td></tr>)}</tbody></table>
            </div>
            <div className="gb" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>도면 BOM ({bom.length})</div>
              <table className="g"><thead><tr><th>No</th><th>부품번호</th><th>이름</th><th style={{ textAlign: 'right' }}>수량</th><th>단위</th><th>조립순서</th></tr></thead>
                <tbody>{bom.map((r) => <tr key={r.bomId}><td className="c">{r.itemNo}</td><td className="code">{r.partNo}</td><td>{r.partName}</td><td className="num">{r.qty}</td><td className="c">{r.unit}</td><td className="c">{r.assemblySeq ?? '—'}</td></tr>)}</tbody></table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
