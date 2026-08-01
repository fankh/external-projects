import { Card, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { ShadowSaasTable } from './ShadowSaasTable'

export const dynamic = 'force-dynamic'

export default async function SaasPage() {
  const session = await requireRole('ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const s = getStore()
  const rows = [...s.saas].sort((a, b) => b.monthlyVisits - a.monthlyVisits)
  const shadow = rows.filter((x) => !x.sanctioned)
  const canDecide = ['SEC_MGR', 'ADMIN'].includes(session.role)

  return (
    <>
      <ScreenHeader
        kicker="Discovery · Shadow SaaS"
        title="Shadow SaaS 사용 현황"
        desc="DNS·프록시·방화벽 로그의 아웃바운드 도메인 분석 → SaaS 카탈로그 매칭 (부서별)"
      />

      <div className="stat-row">
        <Stat value={rows.length} label="관측 SaaS 서비스" />
        <Stat value={shadow.length} label="미인가 (Shadow SaaS)" tone="err" />
        <Stat value={shadow.reduce((n, x) => n + x.users, 0)} label="미인가 SaaS 추정 사용자" tone="warn" />
        <Stat value={rows.filter((x) => x.sanctioned).length} label="인가 카탈로그 등재" tone="ok" />
      </div>

      <Card kicker="By Department" title="부서별 SaaS 사용" pad={false}>
        <ShadowSaasTable rows={rows} canDecide={canDecide} />
      </Card>

      <div className="callout warn">
        <b>정책 연계.</b> 미인가 스토리지류(Dropbox 등)는 8/1부터 프록시 차단 정책이 시행됩니다. 미인가 AI 서비스는
        사용 부서 확인 후 인가 카탈로그 등재 또는 차단 대상으로 분류하세요 — 판정·격리 요청은 보안담당 권한입니다.
        {canDecide && ' 아래 표의 판정 버튼으로 바로 처리할 수 있으며, 판정은 SaaS 카탈로그에도 반영됩니다.'}
      </div>
    </>
  )
}
