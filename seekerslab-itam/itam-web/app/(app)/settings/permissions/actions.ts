'use server'
import { revalidatePath } from 'next/cache'
import { appendAdminAudit, denied } from '@/lib/audit'
import { hasPartialScope, lockReason, PARTIAL_SCOPES, PERM_ACTIONS } from '@/lib/perm'
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
  if (!session) return { ok: false, message: '권한 변경은 Admin 만 가능합니다.' }
  if (session.role !== 'ADMIN') return denied(session.name, '권한 변경은 Admin 만 가능합니다.', '/settings/permissions')
  const locked = lockReason(menu, action, role)
  if (locked) return { ok: false, message: locked }

  const s = getStore()
  const row = s.menuPermissions.find((m) => m.menu === menu)
  if (!row) return { ok: false, message: '메뉴를 찾을 수 없습니다.' }
  const idx = PERM_ACTIONS.indexOf(action)
  if (idx < 0) return { ok: false, message: '기능을 찾을 수 없습니다.' }

  // '본인(부분)'은 범위를 좁히는 구현이 있는 칸에만 줄 수 있다 — 구현 없는 칸의 'p' 는 can() 을 그대로 통과해
  //  허용(y)과 똑같이 동작하므로, 관리자가 좁혔다고 믿는 사이 전사가 열린다(엑셀 칸은 그대로 전사 반출).
  //  화면도 순환에서 건너뛰지만 서버가 최종 판정이다 — 여기서 막지 않으면 액션 직접 호출로 넘어온다.
  if (next === 'p' && !hasPartialScope(menu, action, role)) {
    return { ok: false, message: `${menu} × ${action} · ${role} 에는 '본인 범위'를 좁히는 구현이 없습니다 — 허용/불가로만 지정하세요 (본인 범위를 쓰려면 lib/perm.ts PARTIAL_SCOPES 에 구현과 함께 등록).` }
  }
  const before = row.cells[role][idx]
  if (before === next) return { ok: true, message: '' }
  row.cells[role][idx] = next

  // 'p' 는 칸마다 범위가 다르므로 감사 로그에 그 범위까지 남긴다 — 'p' 세 글자만으로는 무엇이 좁혀졌는지 재구성할 수 없다
  const scope = next === 'p' ? ` (${PARTIAL_SCOPES[`${menu}|${action}|${role}`]})` : ''
  appendAdminAudit(session.name, `권한 변경 — ${menu} × ${action} · ${role}: ${before} → ${next}${scope}`, '권한 매트릭스')
  revalidatePath('/', 'layout')
  return { ok: true, message: `${menu} × ${action} · ${role} → ${next === 'y' ? '허용' : next === 'p' ? `본인 범위${scope}` : '불가'}` }
}
