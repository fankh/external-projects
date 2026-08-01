'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { CodeGroup } from '@/lib/types'
import { addCodeValue, renameCodeValue, toggleCodeValue } from '../actions'

export function CodeGroups({ groups }: { groups: CodeGroup[] }) {
  const [selId, setSelId] = useState(groups[0]?.id ?? '')
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [editCode, setEditCode] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const sel = groups.find((g) => g.id === selId) ?? groups[0]

  const pick = (id: string) => { setSelId(id); setMsg(null); setEditCode(null) }

  const saveRename = (code: string) => {
    startTransition(async () => {
      const r = await renameCodeValue(sel!.id, code, editLabel)
      setMsg(r.message || null)
      if (r.ok) setEditCode(null)
    })
  }
  const submitNew = () => {
    startTransition(async () => {
      const r = await addCodeValue(sel!.id, newCode, newLabel)
      setMsg(r.message || null)
      if (r.ok) { setNewCode(''); setNewLabel('') }
    })
  }

  return (
    <div className="cols main-side" style={{ gridTemplateColumns: '280px minmax(0, 1fr)' }}>
      <Card kicker="Groups" title="코드 그룹" pad={false}>
        <div style={{ padding: 8 }}>
          {groups.map((g) => (
            <button key={g.id} onClick={() => pick(g.id)}
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
          {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>코드</th><th>명칭</th><th className="num">정렬</th><th className="c">사용</th><th className="c">관리</th></tr></thead>
              <tbody>
                {sel.values.map((v) => (
                  <tr key={v.code} style={v.active ? undefined : { opacity: 0.55 }}>
                    <td className="code">{v.code}</td>
                    <td className="strong">
                      {editCode === v.code ? (
                        <input className="input" style={{ height: 26, width: 200 }} value={editLabel} autoFocus
                          disabled={pending}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRename(v.code); if (e.key === 'Escape') setEditCode(null) }} />
                      ) : v.label}
                    </td>
                    <td className="num tnum mute">{v.sort}</td>
                    <td className="c">{v.active ? <Chip tone="ok">사용</Chip> : <Chip tone="neutral">미사용</Chip>}</td>
                    <td className="c">
                      <span style={{ display: 'inline-flex', gap: 5, justifyContent: 'center' }}>
                        {editCode === v.code ? (
                          <>
                            <button className="btn sm pri" disabled={pending} onClick={() => saveRename(v.code)}>저장</button>
                            <button className="btn sm ghost" disabled={pending} onClick={() => setEditCode(null)}>취소</button>
                          </>
                        ) : (
                          <>
                            <button className="btn sm ghost" disabled={pending}
                              onClick={() => { setEditCode(v.code); setEditLabel(v.label); setMsg(null) }}>수정</button>
                            <button className="btn sm" disabled={pending}
                              onClick={() => startTransition(async () => { await toggleCodeValue(sel.id, v.code); setMsg(null) })}>
                              {v.active ? '미사용' : '사용'}
                            </button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="addrow" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: 14, borderTop: '1px solid var(--line)' }}>
            <span className="dim" style={{ fontSize: 11.5, fontWeight: 600 }}>새 코드 추가</span>
            <input className="input mono" style={{ height: 28, width: 150, textTransform: 'uppercase' }} placeholder="코드 (예: IDC-C-01)"
              value={newCode} disabled={pending} onChange={(e) => setNewCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNew() }} />
            <input className="input" style={{ height: 28, width: 200 }} placeholder="명칭"
              value={newLabel} disabled={pending} onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNew() }} />
            <button className="btn sm pri" disabled={pending || !newCode.trim() || !newLabel.trim()} onClick={submitNew}>추가</button>
            <span className="mut" style={{ fontSize: 11 }}>추가 즉시 전 화면 드롭다운(위치·자산유형 등)에 선택지로 반영됩니다. 삭제 대신 미사용 전환만 지원합니다.</span>
          </div>
        </Card>
      )}
    </div>
  )
}
