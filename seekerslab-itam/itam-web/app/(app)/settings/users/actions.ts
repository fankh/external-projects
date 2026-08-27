'use server'
import { revalidatePath } from 'next/cache'
import { appendAdminAudit, denied } from '@/lib/audit'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { mfaRemindTargets } from '@/lib/reminders'
import { APPROVER_STEPS, MANDATORY_APPROVAL_KINDS, ROLE_LABEL } from '@/lib/types'
import type { Role } from '@/lib/types'

type Res = { ok: boolean; message: string }

/** MFA 등록 요구 — MFA 미적용 사용자에게 등록 요구 통지를 발송한다(보안 정책 집행). Admin 전용.
 *  MFA 활성화는 사용자가 IdP(그룹웨어·SSO)에서 직접 등록해야 하므로 여기서 상태를 지어내 바꾸지 않고,
 *  등록 요구를 발송·감사한다 — 감사 리포트의 MFA 적용률(보안 통제 지표)을 끌어올리는 컴플라이언스 조치.
 *  login 지정 시 해당 사용자만, 미지정 시 미적용 전원(공지 미확인 독촉과 같은 일괄/개별 패턴). */
export async function requireMfa(login?: string): Promise<Res> {
  const session = await getSession()
  if (!session) return { ok: false, message: 'MFA 등록 요구 권한이 없습니다 (Admin).' }
  if (session.role !== 'ADMIN') return denied(session.name, 'MFA 등록 요구 권한이 없습니다 (Admin).', '/settings/users')
  const s = getStore()
  // 오늘 이미 보낸 계정은 뺀다 — 화면 버튼 건수(mfaRemindTargets)와 같은 집합이어야 '눌러도 아무 일 없는' 버튼이 안 남는다.
  const pool = mfaRemindTargets()
  const targets = login ? pool.filter((u) => u.login === login) : pool
  if (targets.length === 0) {
    const known = s.users.find((u) => u.login === login)
    return {
      ok: false,
      message: login
        ? (known && !known.mfa ? `오늘 이미 MFA 등록 요구를 보냈습니다 — ${known.name}` : '해당 사용자는 이미 MFA 적용 상태입니다.')
        : 'MFA 등록 요구 대상이 없습니다 (전원 적용·오늘 발송분 제외).',
    }
  }
  for (const u of targets) {
    dispatch({ channel: '이메일', to: `${u.name} (${u.dept})`, subject: 'MFA(다단계 인증) 등록 요구 — 보안 정책 미이행', kind: 'MFA 등록 요구', ref: u.login })
  }
  appendAdminAudit(session.name, `MFA 등록 요구 발송 (${targets.length}명${login ? ` · ${login}` : ''})`, '사용자·그룹')
  revalidatePath('/', 'layout')
  return { ok: true, message: `MFA 등록 요구를 ${targets.length}명에게 발송했습니다. (발송 이력·감사 로그 기록)` }
}

/** 사용자 → 권한그룹(Role) 배정 — 사용자·그룹(STEP 4). Admin 전용.
 *
 *  잠금 방지 두 가지:
 *  1) 본인의 관리자 권한은 스스로 회수할 수 없다.
 *  2) 마지막 남은 시스템 관리자는 강등할 수 없다 — 관리 화면이 잠기는 것을 막는다. */
export async function setUserRole(login: string, role: Role): Promise<Res> {
  const session = await getSession()
  if (!session) return { ok: false, message: '권한그룹 변경은 Admin 만 가능합니다.' }
  if (session.role !== 'ADMIN') return denied(session.name, '권한그룹 변경은 Admin 만 가능합니다.', '/settings/users')

  const s = getStore()
  const user = s.users.find((u) => u.login === login)
  if (!user) return { ok: false, message: '사용자를 찾을 수 없습니다.' }
  if (user.role === role) return { ok: true, message: '' }

  const demotingAdmin = user.role === 'ADMIN' && role !== 'ADMIN'
  if (demotingAdmin) {
    if (user.login === session.login) {
      return { ok: false, message: '본인의 관리자 권한은 스스로 회수할 수 없습니다 (잠금 방지).' }
    }
    const admins = s.users.filter((u) => u.role === 'ADMIN').length
    if (admins <= 1) {
      return { ok: false, message: '최소 1명의 시스템 관리자가 필요합니다 — 마지막 관리자는 강등할 수 없습니다.' }
    }
  }

  const before = user.role
  user.role = role
  appendAdminAudit(session.name, `권한그룹 변경 — ${user.name}(${login}): ${ROLE_LABEL[before]} → ${ROLE_LABEL[role]}`, '사용자·그룹')
  revalidatePath('/', 'layout')
  return { ok: true, message: `${user.name} → ${ROLE_LABEL[role]}` }
}

/** 결재선 결재자 단계 편집 — 화면별 기본 결재선(STEP 4). Admin 전용.
 *  역할에 매핑되는 결재자 단계만 허용해 결재 라우팅이 항상 유효하도록 한다(부서장·자산담당·보안담당·IT기획팀장).
 *  신청자는 첫 단계로 고정, 결재자 단계는 최소 1개. 시스템 결재선(Discovery 엔진 등)은 편집 대상 아님. */
export async function setApprovalLineSteps(id: string, approvers: string[]): Promise<Res> {
  const session = await getSession()
  if (!session) return { ok: false, message: '결재선 변경은 Admin 만 가능합니다.' }
  if (session.role !== 'ADMIN') return denied(session.name, '결재선 변경은 Admin 만 가능합니다.', '/settings/users')
  const VALID = APPROVER_STEPS // 화면 체크박스 목록과 같은 정의(lib/types)

  const s = getStore()
  const line = s.approvalLines.find((l) => l.id === id)
  if (!line) return { ok: false, message: '결재선을 찾을 수 없습니다.' }
  if (line.steps.some((st) => st !== '신청자' && !VALID.includes(st))) {
    return { ok: false, message: '시스템 결재선은 편집할 수 없습니다.' }
  }
  const picked = VALID.filter((st) => approvers.includes(st))
  if (picked.length === 0) return { ok: false, message: '결재자 단계를 1개 이상 지정하세요.' }

  line.steps = ['신청자', ...picked]
  appendAdminAudit(session.name, `결재선 단계 변경 — ${line.screen}(${line.kind}): ${line.steps.join(' → ')}`, '결재선')
  revalidatePath('/', 'layout')
  return { ok: true, message: `${line.screen} 결재선 변경 — ${picked.join(' → ')}` }
}

/** 결재선 필수 여부 토글 — 화면별 기본 결재선(STEP 4). Admin 전용.
 *  폐기·격리·편입·차이 조정은 필수 결재로 고정되어 해제할 수 없다(통제 우회 방지). */
export async function toggleApprovalRequired(id: string): Promise<Res> {
  const session = await getSession()
  if (!session) return { ok: false, message: '결재선 변경은 Admin 만 가능합니다.' }
  if (session.role !== 'ADMIN') return denied(session.name, '결재선 변경은 Admin 만 가능합니다.', '/settings/users')

  const s = getStore()
  const line = s.approvalLines.find((l) => l.id === id)
  if (!line) return { ok: false, message: '결재선을 찾을 수 없습니다.' }

  if (MANDATORY_APPROVAL_KINDS.includes(line.kind)) {
    return { ok: false, message: `${line.kind}은(는) 필수 결재로 고정되어 해제할 수 없습니다.` }
  }

  line.required = !line.required
  appendAdminAudit(session.name, `결재선 필수 여부 — ${line.screen}: ${line.required ? '선택 → 필수' : '필수 → 선택'}`, '결재선')
  revalidatePath('/', 'layout')
  return { ok: true, message: `${line.screen} → ${line.required ? '필수 결재' : '선택'}` }
}
