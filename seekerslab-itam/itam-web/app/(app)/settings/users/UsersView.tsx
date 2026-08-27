'use client'
import { Fragment, useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import { MANDATORY_APPROVAL_KINDS, ROLE_LABEL } from '@/lib/types'
import type { ApprovalLine, Role, UserAccount } from '@/lib/types'
import { requireMfa, setApprovalLineSteps, setUserRole, toggleApprovalRequired } from './actions'

const ROLES: Role[] = ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN']
const APPROVER_STEPS = ['부서장', '자산담당', '보안담당', 'IT기획팀장']
const ROLE_TONE: Record<Role, 'neutral' | 'info' | 'warn' | 'err'> = {
  USER: 'neutral', ASSET_MGR: 'info', SEC_MGR: 'warn', ADMIN: 'err',
}

export function UsersView(props: {
  /** 오늘 아직 MFA 등록 요구를 보내지 않은 미적용 계정 수 — 버튼 건수 = 발송 건수(lib/reminders) */
  mfaRemindCount?: number; /** 오늘 아직 안 보낸 미적용 계정 로그인 — 행 컨트롤도 같은 판정 */ mfaPending?: string[]; users: UserAccount[]; lines: ApprovalLine[]; me: string; owned: Record<string, number>; offboard?: Record<string, { inUse: number; loaned: number; seats: { lic: string; assetNo: string }[]; pendingReqs: number }> }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [obOpen, setObOpen] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const adminCount = props.users.filter((u) => u.role === 'ADMIN').length
  const mfaMissing = props.users.filter((u) => !u.mfa).length
  // 발송 대상은 '미적용'이 아니라 '미적용이면서 오늘 미발송'이다(lib/reminders 단일 소스) — 지표(미적용 N명)는 그대로 두고
  //  버튼 건수만 대상 수로 말한다. 그전에는 보낸 뒤에도 같은 건수로 남아 눌러도 아무 일이 없었다.
  const mfaTargets = props.mfaRemindCount ?? mfaMissing
  const mfaPending = new Set(props.mfaPending ?? props.users.filter((u) => !u.mfa).map((u) => u.login))
  const reqMfa = (login?: string) => startTransition(async () => setMsg((await requireMfa(login)).message || null))

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

      <Card kicker="Users · Groups" title={<>사용자 · 권한그룹 배정 <span className="mut" style={{ fontSize: 12, fontWeight: 400 }}>— 시스템 관리자 {adminCount}명{adminCount <= 1 ? ' (마지막 1명은 강등 불가)' : ''}</span></>} pad={false}
        actions={mfaMissing > 0
          ? <button className="btn sm" disabled={pending || mfaTargets === 0} onClick={() => reqMfa()}
              title={mfaTargets === 0
                ? 'MFA 미적용 계정 전원에게 오늘 이미 등록 요구를 보냈습니다 (당일 중복 발송 차단)'
                : 'MFA 미적용 사용자에게 등록 요구 통지를 발송합니다 (보안 정책 집행 · 발송 이력·감사 기록 · 오늘 발송분 제외)'}>
              🔐 MFA 미등록자 등록 요구 ({mfaTargets}명)
            </button>
          : <Chip tone="ok">MFA 전원 적용</Chip>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>계정</th><th>이름</th><th>부서</th><th>사용자그룹</th><th className="c">권한그룹</th><th className="num">보유 자산</th><th className="c">MFA</th><th>최근 로그인</th><th className="c">오프보딩</th></tr>
            </thead>
            <tbody>
              {props.users.map((u) => {
                // 본인 관리자 강등 방지 · 마지막 관리자 강등 방지 — 서버와 같은 규칙을 화면에도 반영
                const lastAdmin = u.role === 'ADMIN' && (u.login === props.me || adminCount <= 1)
                const ob = props.offboard?.[u.name]
                const obHas = !!ob && (ob.inUse > 0 || ob.loaned > 0 || ob.seats.length > 0 || ob.pendingReqs > 0)
                return (
                  <Fragment key={u.login}>
                  <tr>
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
                      ? <a href={`/assets/register?q=${encodeURIComponent(u.name)}&live=1`} title={`${u.name} 보유 자산 보기 (손 떠난 자산 제외 — 집계와 같은 집합)`} style={{ color: 'var(--accent-deep)' }}>{props.owned[u.name]}</a>
                      : <span className="mut">0</span>}</td>
                    <td className="c">
                      {u.mfa ? <Chip tone="ok">적용</Chip> : (
                        <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                          <Chip tone="warn">미적용</Chip>
                          {/* 오늘 이미 보낸 계정에는 버튼 대신 상태를 보여 준다 — 서버가 당일 중복을 거절하므로 그대로 두면 눌러야 막히는 컨트롤이다. */}
                          {mfaPending.has(u.login)
                            ? <button className="btn sm ghost" disabled={pending} onClick={() => reqMfa(u.login)}
                                title={`${u.name}에게 MFA 등록 요구 통지 발송`}>요구</button>
                            : <span className="mut" style={{ fontSize: 11 }} title="오늘 등록 요구 발송 완료 (당일 중복 발송 차단)">오늘 요구함</span>}
                        </span>
                      )}
                    </td>
                    <td className="tnum mute">{u.lastLogin}</td>
                    <td className="c">
                      {obHas
                        ? <button className="btn sm ghost" onClick={() => setObOpen((v) => (v === u.login ? null : u.login))}
                            title={`${u.name} 오프보딩 요약 — 회수·재배정 대상`}>{obOpen === u.login ? '▾ 요약' : '▸ 요약'}</button>
                        : <span className="mut" style={{ fontSize: 11 }}>—</span>}
                    </td>
                  </tr>
                  {obOpen === u.login && ob && (
                    <tr>
                      <td colSpan={9} style={{ background: 'var(--canvas)', padding: '10px 14px' }}>
                        <div className="vstack" style={{ gap: 6 }}>
                          <div className="hstack" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <span className="kicker mute">오프보딩 요약 — {u.name} ({u.dept}) · 퇴직·부서이동 시 회수·재배정 대상</span>
                            <a className="btn sm ghost" href={`/api/offboard-sheet/${encodeURIComponent(u.name)}`} target="_blank" rel="noopener"
                              title={`${u.name} 오프보딩 명세서(인수인계 체크리스트) 인쇄`}>🖨 명세서 인쇄</a>
                          </div>
                          <div className="hstack" style={{ gap: 14, flexWrap: 'wrap', fontSize: 12.5 }}>
                            <span>사용중 보유 <b>{ob.inUse}</b>대{ob.inUse > 0 && <> · <a href={`/assets/register?q=${encodeURIComponent(u.name)}&status=사용중`} style={{ color: 'var(--accent-deep)' }} title="대장에서 일괄 회수(선택 후 일괄 회수)">일괄 회수 →</a></>}</span>
                            <span>대여중 <b>{ob.loaned}</b>대{ob.loaned > 0 && <> · <a href={`/assets/register?q=${encodeURIComponent(u.name)}&status=대여중`} style={{ color: 'var(--accent-deep)' }} title="대여 반환 처리">반환 처리 →</a></>}</span>
                            <span>배정 라이선스 좌석 <b>{ob.seats.length}</b>석{ob.seats.length > 0 && <> · <a href="/inventory/contracts" style={{ color: 'var(--accent-deep)' }} title="라이선스 좌석 회수(계약·라이선스)">좌석 회수 →</a></>}</span>
                            <span>미처리 상신 결재 <b>{ob.pendingReqs}</b>건{ob.pendingReqs > 0 && <> · <a href="/workflow/approvals" style={{ color: 'var(--accent-deep)' }}>결재함 →</a></>}</span>
                          </div>
                          {ob.seats.length > 0 && (
                            <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                              <span className="mut" style={{ fontSize: 11 }}>좌석: </span>
                              {ob.seats.map((st, i) => <Chip key={i} tone="neutral" bare>{st.lic} · {st.assetNo}</Chip>)}
                            </div>
                          )}
                          <span className="mut" style={{ fontSize: 11 }}>자산 회수 시 배정 라이선스 좌석은 자동 회수됩니다(로56). 좌석만 남으면 계약·라이선스에서 직접 회수하세요.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
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
          결재 없이 대장에 반영하는 우회를 원천 차단합니다. 신청 · 반납 · 이동 · 대여는 운영 정책에 따라 필수 ↔ 선택을 전환할 수 있습니다.
        </div>
      </Card>
    </>
  )
}
