'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { CodeGroup } from '@/lib/types'
import { toggleCodeValue } from '../actions'

export function CodeGroups({ groups }: { groups: CodeGroup[] }) {
  const [selId, setSelId] = useState(groups[0]?.id ?? '')
  const [pending, startTransition] = useTransition()
  const sel = groups.find((g) => g.id === selId) ?? groups[0]

  return (
    <div className="cols main-side" style={{ gridTemplateColumns: '280px minmax(0, 1fr)' }}>
      <Card kicker="Groups" title="코드 그룹" pad={false}>
        <div style={{ padding: 8 }}>
          {groups.map((g) => (
            <button key={g.id} onClick={() => setSelId(g.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', marginBottom: 3,
                border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                background: g.id === sel?.id ? 'var(--accent-soft)' : 'transparent',
                color: g.id === sel?.id ? 'var(--accent-deep)' : 'var(--ink-2)',
                fontWeight: g.id === sel?.id ? 600 : 500,
              }}>
              <div style={{ fontSize: 12.5 }}>{g.name}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--mute)' }}>{g.id}</div>
            </button>
          ))}
        </div>
      </Card>

      {sel && (
        <Card kicker={sel.id} title={sel.name} pad={false}
          actions={<span className="dim" style={{ fontSize: 11.5 }}>{sel.desc}</span>}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>코드</th><th>명칭</th><th className="num">정렬</th><th className="c">사용</th><th className="c">전환</th></tr></thead>
              <tbody>
                {sel.values.map((v) => (
                  <tr key={v.code} style={v.active ? undefined : { opacity: 0.55 }}>
                    <td className="code">{v.code}</td>
                    <td className="strong">{v.label}</td>
                    <td className="num tnum mute">{v.sort}</td>
                    <td className="c">{v.active ? <Chip tone="ok">사용</Chip> : <Chip tone="neutral">미사용</Chip>}</td>
                    <td className="c">
                      <button className="btn sm" disabled={pending}
                        onClick={() => startTransition(() => toggleCodeValue(sel.id, v.code))}>
                        {v.active ? '미사용' : '사용'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
