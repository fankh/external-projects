'use server'
import { revalidatePath } from 'next/cache'
import { appendAdminAudit } from '@/lib/audit'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { MANDATORY_APPROVAL_KINDS, ROLE_LABEL } from '@/lib/types'
import type { Role } from '@/lib/types'

type Res = { ok: boolean; message: string }

/** 사용자 → 권한그룹(Role) 배정 — 사용자·그룹(STEP 4). Admin 전용.
 *
 *  잠금 방지 두 가지:
 *  1) 본인의 관리자 권한은 스스로 회수할 수 없다.
 *  2) 마지막 남은 시스템 관리자는 강등할 수 없다 — 관리 화면이 잠기는 것을 막는다. */
export async function setUserRole(login: string, role: Role): Promise<Res> {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return { ok: false, message: '권한그룹 변경은 Admin 만 가능합니다.' }

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

/** 결재선 필수 여부 토글 — 화면별 기본 결재선(STEP 4). Admin 전용.
 *  폐기·격리·편입·차이 조정은 필수 결재로 고정되어 해제할 수 없다(통제 우회 방지). */
export async function toggleApprovalRequired(id: string): Promise<Res> {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return { ok: false, message: '결재선 변경은 Admin 만 가능합니다.' }

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
