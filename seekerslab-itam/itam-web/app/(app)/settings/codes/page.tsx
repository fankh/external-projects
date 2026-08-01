import { Card, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { CodeGroups } from './CodeGroups'

export const dynamic = 'force-dynamic'

export default async function CodesPage() {
  await requireRole('ADMIN')
  const s = getStore()
  const total = s.codeGroups.reduce((n, g) => n + g.values.length, 0)
  const inactive = s.codeGroups.reduce((n, g) => n + g.values.filter((v) => !v.active).length, 0)

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
        <b>코드 미사용 처리.</b> 이미 사용 중인 데이터가 참조하는 코드는 삭제하지 않고 미사용으로 전환합니다.
        미사용 코드는 신규 입력 항목에서 제외되지만 기존 자산·이력의 표시는 유지되어 과거 데이터의 무결성이 보존됩니다.
      </div>

      <CodeGroups groups={s.codeGroups} />
    </>
  )
}
