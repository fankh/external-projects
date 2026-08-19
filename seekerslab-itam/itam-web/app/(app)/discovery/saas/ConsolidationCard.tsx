'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { SaasUsage } from '@/lib/types'
import { consolidateSaas } from './actions'

type Row = { category: string; services: SaasUsage[]; users: number; shadowN: number; sanctioned?: SaasUsage }

/** 중복 기능 SaaS 통합 후보 — 인가 표준이 있는 분류는 '통합 정리 요청'으로 미인가 중복을 표준으로 몰아 차단한다(로69).
 *  판정에만 있고 조치가 없던 §05 라이선스 최적화(기능05)의 SaaS 축을 닫는다. 표준이 없는 분류는 등재 안내만. */
export function ConsolidationCard({ rows, canDecide }: { rows: Row[]; canDecide: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (category: string) => {
    setBusy(category)
    startTransition(async () => {
      const r = await consolidateSaas(category)
      setMsg(r.message || null)
      setBusy(null)
    })
  }

  return (
    <Card kicker="License Optimization" title="중복 기능 SaaS 통합 후보" pad={false}>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>기능 분류</th><th>중복 서비스</th><th className="num">서비스</th><th className="num">사용자 합</th><th>통합 권고</th>{canDecide && <th className="c">조치</th>}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category}>
                <td className="strong">{r.category}</td>
                <td>
                  <span className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {r.services.map((x) => (
                      <Chip key={x.id} tone={x.sanctioned ? 'ok' : 'err'} bare>{x.service}{x.sanctioned ? ' ·인가' : ' ·미인가'}</Chip>
                    ))}
                  </span>
                </td>
                <td className="num tnum">{r.services.length}</td>
                <td className="num tnum">{r.users.toLocaleString()}</td>
                <td className="dim">
                  {r.sanctioned
                    ? `인가 ${r.sanctioned.service} 기준 통합 검토 — 미인가 ${r.shadowN}종 정리`
                    : `미인가 ${r.shadowN}종 중복 — 카탈로그 등재 후 1종 통합 권고`}
                </td>
                {canDecide && (
                  <td className="c" style={{ whiteSpace: 'nowrap' }}>
                    {r.sanctioned ? (
                      <button className="btn sm danger" disabled={pending}
                        title={`${r.sanctioned.service} 표준으로 통합 — 미인가 중복 ${r.shadowN}종 차단 집행`}
                        onClick={() => run(r.category)}>{busy === r.category ? '처리 중…' : '통합 정리 요청'}</button>
                    ) : (
                      <span className="mut" style={{ fontSize: 11 }}>표준 등재 후</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
