'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import { MANDATORY_APPROVAL_KINDS, ROLE_LABEL } from '@/lib/types'
import type { ApprovalLine, Role, UserAccount } from '@/lib/types'
import { setApprovalLineSteps, setUserRole, toggleApprovalRequired } from './actions'

const ROLES: Role[] = ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN']
const APPROVER_STEPS = ['부서장', '자산담당', '보안담당', 'IT기획팀장']
const ROLE_TONE: Record<Role, 'neutral' | 'info' | 'warn' | 'err'> = {
  USER: 'neutral', ASSET_MGR: 'info', SEC_MGR: 'warn', ADMIN: 'err',
}

export function UsersView(props: { users: UserAccount[]; lines: ApprovalLine[]; me: string; owned: Record<string, number> }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const adminCount = props.users.filter((u) => u.role === 'ADMIN').length

  const changeRole = (login: string, role: Role) => {
    startTransition(async () => {
      const r = await setUserRole(login, role)
      setMsg(r.message || null)
    })
  }
  const toggleReq = (id: string) => {
    startTransition(async () => {
      const r = await toggleApprovalRequired(id)
      setMsg(r.message || null)
    })
  }
  const [editLine, setEditLine] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const editable = (l: ApprovalLine) => l.steps.every((st) => st === '신청자' || APPROVER_STEPS.includes(st))
  const openLineEdit = (l: ApprovalLine) => { setEditLine(l.id); setPicked(l.steps.filter((st) => st !== '신청자')); setMsg(null) }
  const togglePick = (st: string) => setPicked((p) => (p.includes(st) ? p.filter((x) => x !== st) : [...p, st]))
  const saveLine = (id: string) => startTransition(async () => {
    const r = await setApprovalLineSteps(id, picked)
    setMsg(r.message || null)
    if (r.ok) setEditLine(null)
  })

  return (
    <>
      {msg && <div className="callout" style={{ margin: '0 0 12px' }}>{msg}</div>}

      <Card kicker="Users · Groups" title="사용자 · 권한그룹 배정" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>계정</th><th>이름</th><th>부서</th><th>사용자그룹</th><th className="c">권한그룹</th><th className="num">보유 자산</th><th className="c">MFA</th><th>최근 로그인</th></tr>
            </thead>
            <tbody>
              {props.users.map((u) => {
                // 본인 관리자 강등 방지 · 마지막 관리자 강등 방지 — 서버와 같은 규칙을 화면에도 반영
                const lastAdmin = u.role === 'ADMIN' && (u.login === props.me || adminCount <= 1)
                return (
                  <tr key={u.login}>
                    <td className="code">{u.login}</td>
                    <td className="strong">{u.name}{u.login === props.me && <span className="mut" style={{ fontSize: 10 }}> · 본인</span>}</td>
                    <td className="mute">{u.dept}</td>
                    <td>{u.group}</td>
                    <td className="c">
                      <select
                        className="select"
                        value={u.role}
                        disabled={pending}
                        onChange={(e) => changeRole(u.login, e.target.value as Role)}
                        title={lastAdmin ? '마지막 관리자 · 본인 — 강등 불가' : '권한그룹 변경'}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r} disabled={lastAdmin && r !== 'ADMIN'}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="num tnum">{props.owned[u.name] > 0
                      ? <a href={`/assets/register?q=${encodeURIComponent(u.name)}`} title={`${u.name} 보유 자산 보기`} style={{ color: 'var(--accent-deep)' }}>{props.owned[u.name]}</a>
                      : <span className="mut">0</span>}</td>
                    <td className="c">{u.mfa ? <Chip tone="ok">적용</Chip> : <Chip tone="warn">미적용</Chip>}</td>
                    <td className="tnum mute">{u.lastLogin}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="callout" style={{ margin: 14 }}>
          <b>권한그룹은 화면·기능 권한의 기준</b>입니다(STEP 3 매트릭스가 이 그룹 단위로 적용). 본인과 마지막 관리자는
          <Chip tone="err" bare>시스템관리자</Chip> 에서 내릴 수 없어 관리 화면이 잠기지 않습니다. 변경은 감사 로그에 남습니다.
        </div>
      </Card>

      <Card kicker="Approval Lines" title="화면별 기본 결재선" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>화면</th><th>결재 구분</th><th>결재선</th><th className="c">필수 여부</th></tr></thead>
            <tbody>
              {props.lines.map((l) => {
                const locked = MANDATORY_APPROVAL_KINDS.includes(l.kind)
                return (
                  <tr key={l.id}>
                    <td className="strong">{l.screen}</td>
                    <td className="mute">{l.kind}</td>
                    <td>
                      {editLine === l.id ? (
                        <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
                          <span className="fs">신청자</span>
                          {APPROVER_STEPS.map((st) => (
                            <label key={st} className="hstack" style={{ gap: 3, fontSize: 11.5, cursor: 'pointer' }}>
                              <input type="checkbox" checked={picked.includes(st)} onChange={() => togglePick(st)} /> {st}
                            </label>
                          ))}
                          <button className="btn sm pri" disabled={pending || picked.length === 0} onClick={() => saveLine(l.id)}>저장</button>
                          <button className="btn sm ghost" disabled={pending} onClick={() => setEditLine(null)}>취소</button>
                        </div>
                      ) : (
                        <span className="hstack" style={{ gap: 8 }}>
                          <span className="flow">
                            {l.steps.map((st, i) => (
                              <span key={st} style={{ display: 'contents' }}>
                                {i > 0 && <span className="ar">→</span>}
                                <span className="fs">{st}</span>
                              </span>
                            ))}
                          </span>
                          {editable(l) && <button className="btn sm ghost" disabled={pending} onClick={() => openLineEdit(l)}>편집</button>}
                        </span>
                      )}
                    </td>
                    <td className="c">
                      {locked ? (
                        <Chip tone="err">필수 결재 <span className="mut" style={{ fontSize: 10 }}>🔒</span></Chip>
                      ) : (
                        <button
                          className={`btn sm ${l.required ? 'danger' : ''}`}
                          disabled={pending}
                          onClick={() => toggleReq(l.id)}
                          title="클릭하여 필수 ↔ 선택 전환"
                        >
                          {l.required ? '필수 결재' : '선택'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="callout" style={{ margin: 14 }}>
          <b>폐기 · 격리 요청 · 편입(소유자 확인) · 차이 조정</b>은 필수 결재로 <span className="mut">🔒</span> 고정되어 해제할 수 없습니다 —
          결재 없이 대장에 반영하는 우회를 원천 차단합니다. 신청 · 반납 · 이동은 운영 정책에 따라 필수 ↔ 선택을 전환할 수 있습니다.
        </div>
      </Card>
    </>
  )
}
