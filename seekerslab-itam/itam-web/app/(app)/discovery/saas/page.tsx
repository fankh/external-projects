import { Card, Chip, RiskChip, ScreenHeader, Stat } from '@/components/ui'
import { requireView } from '@/lib/authz'
import { canExport } from '@/lib/exports'
import { saasConsolidationCandidates } from '@/lib/reports'
import { getStore } from '@/lib/store'
import { ConsolidationCard } from './ConsolidationCard'
import { ShadowSaasTable } from './ShadowSaasTable'

export const dynamic = 'force-dynamic'

const RISK_RANK: Record<string, number> = { 높음: 3, 중간: 2, 낮음: 1 }

export default async function SaasPage() {
  const session = await requireView('/discovery/saas', 'ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const s = getStore()
  const rows = [...s.saas].sort((a, b) => b.monthlyVisits - a.monthlyVisits)
  // 차단 판정이 끝난 서비스는 판정 대기 갭이 아니다 — sanctioned 는 인가/미인가 두 값뿐이라 차단을 담지 못한다.
  //  KPI·부서별 노출 요약은 '아직 판정이 필요한' 미인가만 센다(주간 브리핑·통합 후보 산정과 같은 기준).
  //  표에는 차단 건도 남기되 인가 여부 칸에 '차단 판정'으로 구분해 보여준다.
  const blockedServices = s.saasCatalog.filter((c) => c.status === '차단').map((c) => c.service)
  const blockedSet = new Set(blockedServices)
  const shadow = rows.filter((x) => !x.sanctioned && !blockedSet.has(x.service))
  const canDecide = ['SEC_MGR', 'ADMIN'].includes(session.role)

  // 부서별 미인가 SaaS 노출 요약 — 어느 부서가 Shadow SaaS 위험이 큰지 우선순위화(제품안내서: 미인가 SaaS 사용 현황 부서별).
  // 미인가 추정 사용자 합이 큰 부서 순. 보안담당이 정책·통보 대상 부서를 바로 고른다.
  const deptRollup = Object.values(
    shadow.reduce<Record<string, { dept: string; count: number; users: number; risk: string }>>((acc, x) => {
      const r = (acc[x.dept] ??= { dept: x.dept, count: 0, users: 0, risk: '낮음' })
      r.count += 1
      r.users += x.users
      if (RISK_RANK[x.risk] > RISK_RANK[r.risk]) r.risk = x.risk
      return acc
    }, {}),
  ).sort((a, b) => b.users - a.users)

  // 중복 기능 SaaS 통합 후보 — 같은 기능 분류에 서로 다른 서비스가 2종 이상이면 통합 검토 대상. 부서별 노출(위험 관점)과
  // 짝이 되는 비용·통합 관점. 라이선스 컴플라이언스 리포트와 같은 산출(lib/reports)을 써 화면·리포트가 어긋나지 않게 한다.
  const consolidation = saasConsolidationCandidates()

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
        <Stat value={consolidation.length} label="통합 후보 (중복 기능)" tone={consolidation.length ? 'warn' : 'ok'} />
      </div>

      <Card kicker="By Department" title="부서별 미인가 SaaS 노출" pad={false}>
        {deptRollup.length === 0 ? (
          <div className="empty">미인가 SaaS 노출이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>부서</th><th className="num">미인가 서비스</th><th className="num">추정 사용자</th><th className="c">최고 위험도</th></tr>
              </thead>
              <tbody>
                {deptRollup.map((r) => (
                  <tr key={r.dept}>
                    <td className="strong">{r.dept}</td>
                    <td className="num tnum"><Chip tone="err" bare>{r.count}</Chip></td>
                    <td className="num tnum">{r.users.toLocaleString()}</td>
                    <td className="c"><RiskChip risk={r.risk as '높음' | '중간' | '낮음'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {consolidation.length > 0 && <ConsolidationCard rows={consolidation} canDecide={canDecide} />}

      <Card kicker="Services" title="SaaS 서비스별 사용·판정" pad={false}>
        <ShadowSaasTable rows={rows} canDecide={canDecide} depts={[...new Set(rows.map((x) => x.dept))].sort()} blockedServices={blockedServices} canExport={canExport('saas', session.role)} />
      </Card>

      <div className="callout warn">
        <b>정책 연계.</b> 미인가 스토리지류(Dropbox 등)는 8/1부터 프록시 차단 정책이 시행됩니다. 미인가 AI 서비스는
        사용 부서 확인 후 인가 카탈로그 등재 또는 차단 대상으로 분류하세요 — 판정·격리 요청은 보안담당 권한입니다.
        {canDecide && ' 아래 표의 판정 버튼으로 바로 처리할 수 있으며, 판정은 SaaS 카탈로그에도 반영됩니다.'}
      </div>
    </>
  )
}
