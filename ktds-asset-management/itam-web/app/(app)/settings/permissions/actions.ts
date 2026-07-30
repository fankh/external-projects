'use server'
import { revalidatePath } from 'next/cache'
import { appendAdminAudit } from '@/lib/audit'
import { isLocked, PERM_ACTIONS } from '@/lib/perm'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import type { PermAction, PermCell, PermMenu, Role } from '@/lib/types'

/** 권한 칸 변경 — 메뉴권한관리(STEP 3). Admin 전용.
 *
 *  안전장치 두 가지:
 *  1) Admin 의 '권한 · 정책 × 조회/저장'은 잠겨 있다 — 스스로를 화면 밖으로 밀어내지 못한다.
 *  2) 매트릭스는 **필요조건**이라 켠다고 코드 규칙을 넘지 못한다(lib/perm.ts 참고).
 *     따라서 편집으로 권한이 상승하는 경로가 없다. */
export async function setPermission(menu: PermMenu, action: PermAction, role: Role, next: PermCell) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return { ok: false, message: '권한 변경은 Admin 만 가능합니다.' }
  if (isLocked(menu, action, role)) {
    return { ok: false, message: 'Admin 의 권한·정책 조회/저장 권한은 회수할 수 없습니다 (잠금 방지).' }
  }

  const s = getStore()
  const row = s.menuPermissions.find((m) => m.menu === menu)
  if (!row) return { ok: false, message: '메뉴를 찾을 수 없습니다.' }
  const idx = PERM_ACTIONS.indexOf(action)
  if (idx < 0) return { ok: false, message: '기능을 찾을 수 없습니다.' }

  const before = row.cells[role][idx]
  if (before === next) return { ok: true, message: '' }
  row.cells[role][idx] = next

  appendAdminAudit(session.name, `권한 변경 — ${menu} × ${action} · ${role}: ${before} → ${next}`, '권한 매트릭스')
  revalidatePath('/', 'layout')
  return { ok: true, message: `${menu} × ${action} · ${role} → ${next === 'y' ? '허용' : next === 'p' ? '부분' : '불가'}` }
}
