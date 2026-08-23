import { Card, ScreenHeader, Stat } from '@/components/ui'
import { requireView } from '@/lib/authz'
import { codeUsage } from '@/lib/codes'
import { getStore } from '@/lib/store'
import { CodeGroups } from './CodeGroups'

export const dynamic = 'force-dynamic'

export default async function CodesPage() {
  await requireView('/settings/codes', 'ADMIN')
  const s = getStore()
  const total = s.codeGroups.reduce((n, g) => n + g.values.length, 0)
  const inactive = s.codeGroups.reduce((n, g) => n + g.values.filter((v) => !v.active).length, 0)
  // 코드별 참조 수 — 미사용 전환 가드·"N건 사용 중" 표기의 근거. groupId.code 키로 평탄화해 클라이언트에 전달(함수는 직렬화 불가).
  const usage: Record<string, number> = {}
  for (const g of s.codeGroups) for (const val of g.values) usage[`${g.id}.${val.code}`] = codeUsage(g.id, val.label)

  return (
    <>
      <ScreenHeader
        kicker="환경설정 · Common Codes"
        title="공통코드"
        desc="자산 유형 · 상태 · 대사 결과 · 위험도 · 데이터 등급 · 위치 — 전 화면 공통 코드 체계"
      />

      <div className="stat-row">
        <Stat value={s.codeGroups.length} label="코드 그룹" />
        <Stat value={total} label="코드 값" />
        <Stat value={inactive} label="미사용 처리" tone={inactive > 0 ? 'warn' : 'ok'} />
        <Stat value={total - inactive} label="사용 중" tone="ok" />
      </div>

      <div className="callout">
        <b>코드 미사용 처리.</b> 미사용 코드는 신규 입력 항목(위치·자산유형 등 드롭다운)에서 제외되지만 기존 자산·이력의 표시는 유지됩니다.
        단, <b>살아있는 레코드가 참조하는 코드는 미사용 전환이 차단됩니다</b> — 참조 자산을 다른 코드로 이관한 뒤에야 전환할 수 있어(사용 중 N건 표기),
        드롭다운에서 사라진 코드를 가진 자산이 재선택 불가로 방치되는 사각지대를 막습니다.
      </div>

      <CodeGroups groups={s.codeGroups} usage={usage} />
    </>
  )
}
