'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import { runEasmScan } from './actions'

type Target = { domain: string; intervalDays: number; lastRunAt?: string; activeApproved: boolean; note?: string; dueIn: number | null }

export function RescanConsole({ targets }: { targets: Target[] }) {
  const [picked, setPicked] = useState<string[]>(targets.filter((t) => (t.dueIn ?? 1) <= 0).map((t) => t.domain))
  const [mode, setMode] = useState<'Passive' | 'Passive+Active'>('Passive')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const toggle = (d: string) => setPicked((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]))
  const blocked = mode === 'Passive+Active'
    ? targets.filter((t) => picked.includes(t.domain) && !t.activeApproved)
    : []

  return (
    <Card kicker="Re-discovery" title="재탐지 실행" pad={false}>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th className="c">대상</th><th>도메인</th><th className="c">주기</th><th className="c">마지막 재탐지</th><th className="c">다음 주기</th><th className="c">능동 협의</th><th>비고</th></tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.domain}>
                <td className="c">
                  <input type="checkbox" aria-label={`${t.domain} 재스캔 대상 선택`} checked={picked.includes(t.domain)} onChange={() => toggle(t.domain)} disabled={pending} />
                </td>
                <td className="strong">{t.domain}</td>
                <td className="c mute">{t.intervalDays}일</td>
                <td className="c tnum">{t.lastRunAt ?? <span className="dim">-</span>}</td>
                <td className="c">
                  {t.dueIn === null ? <span className="dim">-</span>
                    : t.dueIn <= 0 ? <Chip tone="warn">기한 경과 {-t.dueIn}일</Chip>
                    : <Chip tone="ok">D-{t.dueIn}</Chip>}
                </td>
                <td className="c">
                  {t.activeApproved ? <Chip tone="ok">협의 완료</Chip> : <Chip tone="err">미협의</Chip>}
                </td>
                <td className="dim" style={{ whiteSpace: 'normal' }}>{t.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="vstack" style={{ gap: 8, padding: 14, borderTop: '1px solid var(--line)' }}>
        <div className="hstack" style={{ gap: 8 }}>
          <select aria-label="탐지 모드" className="select" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="Passive">수동 수집만 (대상 무접촉)</option>
            <option value="Passive+Active">수동 + 능동 확인 (대상 접속)</option>
          </select>
          <input className="input" style={{ flex: 1 }} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="실행 메모 (선택)" />
          <button className="btn pri" disabled={pending || picked.length === 0 || blocked.length > 0}
            onClick={() => startTransition(async () => setMsg((await runEasmScan({ domains: picked, mode, note })).message))}>
            {pending ? '재탐지 중…' : '재탐지 실행'}
          </button>
        </div>

        {blocked.length > 0 && (
          <div className="callout warn">
            <b>능동 탐지 미협의 도메인이 선택돼 있습니다</b> — {blocked.map((t) => t.domain).join(', ')}.
            능동 탐지는 대상에 직접 접속하므로 사전 협의된 도메인에서만 실행합니다. 수동 수집만 선택하거나 대상에서 제외하세요.
          </div>
        )}
        <div className="dim" style={{ fontSize: 11.5 }}>
          수동 수집은 인터넷 공개 정보만 훑어 대상에 흔적을 남기지 않습니다. 생존·서비스·취약점은 능동 확인에서만 판정됩니다.
        </div>
        {msg && <div className="callout">{msg}</div>}
      </div>
    </Card>
  )
}
