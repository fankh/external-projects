import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { BomEditor, type BomRow } from './BomEditor'

export const dynamic = 'force-dynamic'
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
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
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
      <ScreenHeader title={`${t('detail.partTitle', '부품 상세')} — ${block} (${drawing})`} source="/parts/detail · /drawings/{no}/bom" />
      {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 6, padding: 6 }}>
          <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="gb" style={{ padding: 8, gap: 4, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{t('detail.attrs', '속성')}</div>
              <Field label={t('detail.partNo', '부품번호')} value={p?.partNo} />
              <Field label={t('detail.name', '이름')} value={p?.name} />
              <Field label={t('detail.spec', '규격')} value={p?.spec} />
              <Field label={t('detail.material', '재질')} value={p?.material} />
              <Field label={t('detail.supplier', '공급처')} value={p?.supplier} />
              <Field label={t('detail.weight', '중량')} value={p?.weight != null ? `${p.weight} kg` : '—'} />
              <Field label="Make/Buy" value={p?.makeBuy} />
              <Field label={t('detail.qty', '수량')} value={p?.qty} />
            </div>
            {detail?.process ? (
              <div className="gb" style={{ padding: 8, gap: 4, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{t('detail.process', '공정')}</div>
                <Field label={t('detail.process', '공정')} value={detail.process.process} />
                <Field label={t('detail.workplace', '작업장')} value={detail.process.workplace} />
                <Field label={t('detail.person', '인원')} value={detail.process.person} />
                <Field label={t('detail.skill', '숙련도')} value={detail.process.skill} />
                <Field label={t('detail.wtime', '공수')} value={`${detail.process.wtimeHr} h`} />
              </div>
            ) : null}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="gb" style={{ flex: 'none', maxHeight: 180, overflow: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>{t('detail.dimBinding', '치수 바인딩')} ({detail?.dims.length ?? 0})</div>
              <table className="g"><thead><tr><th>{t('detail.noCol', '번호')}</th><th>{t('detail.valCol', '값')}</th><th>{t('detail.bindCol', '바인딩')}</th><th>{t('detail.kindCol', '종류')}</th></tr></thead>
                <tbody>{(detail?.dims ?? []).map((d) => <tr key={d.no}><td className="code">{d.no}</td><td className="num">{d.value}</td><td className="c">{d.binding}</td><td className="c">{d.kind}</td></tr>)}</tbody></table>
            </div>
            <BomEditor drawing={drawing} rows={bom} />
          </div>
        </div>
      )}
    </div>
  )
}
