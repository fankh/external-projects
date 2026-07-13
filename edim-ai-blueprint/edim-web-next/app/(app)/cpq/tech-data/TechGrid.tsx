'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'

export interface TechDataRow { model: string; pd: number; pt: number; rpm: number; eff: number; power: number; sound: number }

const num = (v: number, d = 0) => v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })

const cols: GridColumn<TechDataRow>[] = [
  { key: 'model', header: '모델', width: 96, code: true, render: (r) => r.model },
  { key: 'pd', header: '정압 Pd', width: 80, align: 'right', sortValue: (r) => r.pd, render: (r) => num(r.pd) },
  { key: 'pt', header: '전압 Pt', width: 80, align: 'right', sortValue: (r) => r.pt, render: (r) => num(r.pt) },
  { key: 'rpm', header: 'RPM', width: 72, align: 'right', sortValue: (r) => r.rpm, render: (r) => num(r.rpm) },
  { key: 'eff', header: '효율 %', width: 70, align: 'right', sortValue: (r) => r.eff, render: (r) => num(r.eff, 1) },
  { key: 'power', header: '동력 kW', width: 78, align: 'right', sortValue: (r) => r.power, render: (r) => num(r.power, 2) },
  { key: 'sound', header: '소음 dB', width: 76, align: 'right', sortValue: (r) => r.sound, render: (r) => num(r.sound, 1) },
]

export function TechGrid({ rows, airflow, pressure }: { rows: TechDataRow[]; airflow: number; pressure: number }) {
  const router = useRouter()
  const sp = useSearchParams()
  const go = (a: number, p: number) => router.push(`/cpq/tech-data?airflow=${a}&pressure=${p}`)
  const onKey = (key: 'airflow' | 'pressure') => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const v = Number((e.target as HTMLInputElement).value) || 0
    const a = key === 'airflow' ? v : Number(sp.get('airflow')) || airflow
    const p = key === 'pressure' ? v : Number(sp.get('pressure')) || pressure
    go(a, p)
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px' }}>
        <label style={{ fontSize: 11 }}>풍량 CMH</label>
        <input className="in" defaultValue={airflow} onKeyDown={onKey('airflow')} style={{ height: 22, fontSize: 11, width: 84 }} />
        <label style={{ fontSize: 11 }}>정압 Pa</label>
        <input className="in" defaultValue={pressure} onKeyDown={onKey('pressure')} style={{ height: 22, fontSize: 11, width: 72 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>Enter 로 재조회 · row_key_num 범위</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-techdata" colFilter columns={cols} rows={rows} rowKey={(r) => r.model} emptyText="해당 조건의 성능 데이터가 없습니다" />
      </div>
    </div>
  )
}
