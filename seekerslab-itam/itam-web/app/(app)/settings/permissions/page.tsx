import { Card, ScreenHeader } from '@/components/ui'
import { requireView } from '@/lib/authz'
import { hasPartialScope, lockReason, PARTIAL_SCOPES, PERM_ACTIONS } from '@/lib/perm'
import { getStore } from '@/lib/store'
import type { Role } from '@/lib/types'
import { MatrixEditor } from './MatrixEditor'

export const dynamic = 'force-dynamic'

/** 실제로 서버가 강제하는 (메뉴 × 기능) — 나머지 칸은 선언된 정책이며 화면 가드가 구현한다.
 *  화면에서 이 구분을 보여줘야 '켰는데 왜 안 되지'를 만들지 않는다. */


export default async function PermissionsPage() {
  await requireView('/settings/permissions', 'ADMIN')
  const store = getStore()
  const rows = store.menuPermissions
  // STEP 2(메뉴 정의)에서 파생 — 화면에 하드코딩하면 정의와 매트릭스가 갈라진다
  const defs = store.menuDefs
  const ENFORCED = defs.flatMap((d) => d.enforced.map((a) => `${d.menu}|${a}`))
  // 그 화면이 아예 제공하지 않는 기능 — 권한을 켜도 누를 버튼이 없다
  const NA = rows.flatMap((r) => {
    const def = defs.find((d) => d.menu === r.menu)
    if (!def) return []
    return PERM_ACTIONS.filter((a) => !def.actions.includes(a)).map((a) => `${r.menu}|${a}`)
  })
  const roles: Role[] = ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN']
  // '본인(부분)'을 줄 수 있는 칸 — 범위를 좁히는 구현이 있는 칸만. 나머지 칸에서 'p' 는 허용과 구분되지 않으므로
  //  순환에서 아예 건너뛴다(허용 → 불가). 구현 목록은 lib/perm.ts PARTIAL_SCOPES 하나뿐이다.
  const partial = rows.flatMap((r) =>
    roles.flatMap((role) => PERM_ACTIONS.filter((act) => hasPartialScope(r.menu, act, role)).map((act) => `${r.menu}|${act}|${role}`)),
  )
  const partialScope = Object.fromEntries(partial.map((k) => [k, PARTIAL_SCOPES[k]]))
  //  잠금 사유를 함께 넘긴다 — 화면이 문구를 따로 들고 있으면 사유가 늘 때 엉뚱한 이유를 보여 준다(lib/types lockReason 단일 출처)
  const locked: Record<string, string> = {}
  for (const r of rows) {
    for (const role of roles) {
      for (const a of PERM_ACTIONS) {
        const why = lockReason(r.menu, a, role)
        if (why) locked[`${r.menu}|${a}|${role}`] = why
      }
    }
  }
  return (
    <>
      <ScreenHeader
        kicker="환경설정 · Access Control"
        title="권한 · 정책"
        desc="메뉴기능관리 → 메뉴관리 → 메뉴권한관리 → 사용자·그룹 — 권한은 메뉴(화면) × 기능(버튼) 단위로 부여"
      />

      <div className="pipe">
        {[
          ['메뉴기능관리', '화면 기능 정의 (조회·저장·삭제·엑셀)'],
          ['메뉴관리', '카테고리·화면번호·기능 부여'],
          ['메뉴권한관리', '메뉴권한별 메뉴·기능 및 사용자 매핑'],
          ['사용자·그룹', '사용자그룹·결재선 관리'],
        ].map(([t, sub], i) => (
          <div key={t} style={{ display: 'contents' }}>
            {i > 0 && <span className="arrow">→</span>}
            <div className={`step ${i === 2 ? 'on' : ''}`}>
              <div className="k">STEP {i + 1}</div>
              <div className="t">{t}</div>
              <div className="s">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      <Card kicker="Permission Matrix" title="권한그룹 × 메뉴 · 기능 매트릭스" pad={false}>
        <MatrixEditor rows={rows} actions={PERM_ACTIONS} enforced={ENFORCED} locked={locked} na={NA} partial={partial} partialScope={partialScope} />
        <div className="callout" style={{ margin: 14 }}>
          <b>칸을 클릭해 변경합니다</b> (허용 → 불가). <u>밑줄</u> 친 칸은 서버가 직접 강제하는 권한이며,
          회수하면 버튼이 사라질 뿐 아니라 API 직접 호출도 막힙니다. 나머지 칸은 선언된 정책으로 화면 가드가 구현합니다.
          <br />
          매트릭스는 <b>필요조건</b>이라 권한을 켜도 코드의 규칙(결재 종류별 담당, 본인 자산 범위)을 넘지 못하며,
          Admin 의 권한·정책 조회/저장은 🔒 잠겨 있어 스스로를 화면 밖으로 밀어낼 수 없습니다. 변경은 감사 로그에 남습니다.
          <br />
          <b>본인 범위</b>는 실제로 범위를 좁히는 구현이 있는 {partial.length}칸에서만 선택됩니다 — 나머지 칸의 <b>본인</b> 은
          허용과 구분되지 않아(전사 조회·전사 엑셀 반출) 순환에서 제외했습니다. 칸에 마우스를 올리면 좁혀지는 범위가 보입니다.
        </div>
      </Card>
    </>
  )
}
