'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Chip } from '@/components/controls'

export interface BomCompare {
  base: string; target: string; baseCount: number; targetCount: number
  added: { code: string; name: string; qty: number }[]
  removed: { code: string; name: string; qty: number }[]
  changed: { code: string; name: string; baseQty: number; targetQty: number }[]
  unchanged: number; identical: boolean
}

function DiffTable({ title, tone, children }: { title: string; tone: 'ok' | 'err' | 'warn'; children: React.ReactNode }) {
  return (
    <div className="gb" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px', display: 'flex', gap: 6, alignItems: 'center' }}>
        <Chip tone={tone}>{title}</Chip>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    </div>
  )
}

export function BomCompareView({ data, base, target }: { data: BomCompare | null; base: string; target: string }) {
  const router = useRouter()
  const sp = useSearchParams()
  const go = (b: string, t: string) => router.push(`/plm/bom-compare?base=${encodeURIComponent(b)}&target=${encodeURIComponent(t)}`)
  const onKey = (which: 'base' | 'target') => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const v = (e.target as HTMLInputElement).value
    go(which === 'base' ? v : sp.get('base') ?? base, which === 'target' ? v : sp.get('target') ?? target)
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px' }}>
        <label style={{ fontSize: 11 }}>기준(base)</label>
        <input className="in" defaultValue={base} onKeyDown={onKey('base')} style={{ height: 22, fontSize: 11, width: 130 }} />
        <label style={{ fontSize: 11 }}>대상(target)</label>
        <input className="in" defaultValue={target} onKeyDown={onKey('target')} style={{ height: 22, fontSize: 11, width: 130 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>Enter 로 비교</span>
        {data ? (
          <span style={{ marginLeft: 'auto', fontSize: 11 }}>
            {data.identical ? <Chip tone="ok">동일 BOM</Chip> : <Chip tone="warn">차이 있음</Chip>}
            {'  '}base {data.baseCount} · target {data.targetCount} · 유지 {data.unchanged}
          </span>
        ) : null}
      </div>
      {!data ? <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>비교 결과 없음 — 코드를 입력하세요</div> : (
        <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0 }}>
          <DiffTable title={`추가 ${data.added.length}`} tone="ok">
            <table className="g"><thead><tr><th>코드</th><th>이름</th><th style={{ textAlign: 'right' }}>수량</th></tr></thead>
              <tbody>{data.added.map((r) => <tr key={r.code}><td className="code">{r.code}</td><td>{r.name}</td><td className="num">{r.qty}</td></tr>)}</tbody></table>
          </DiffTable>
          <DiffTable title={`삭제 ${data.removed.length}`} tone="err">
            <table className="g"><thead><tr><th>코드</th><th>이름</th><th style={{ textAlign: 'right' }}>수량</th></tr></thead>
              <tbody>{data.removed.map((r) => <tr key={r.code}><td className="code">{r.code}</td><td>{r.name}</td><td className="num">{r.qty}</td></tr>)}</tbody></table>
          </DiffTable>
          <DiffTable title={`변경 ${data.changed.length}`} tone="warn">
            <table className="g"><thead><tr><th>코드</th><th>이름</th><th style={{ textAlign: 'right' }}>기준→대상</th></tr></thead>
              <tbody>{data.changed.map((r) => <tr key={r.code}><td className="code">{r.code}</td><td>{r.name}</td><td className="num">{r.baseQty}→{r.targetQty}</td></tr>)}</tbody></table>
          </DiffTable>
        </div>
      )}
    </div>
  )
}
