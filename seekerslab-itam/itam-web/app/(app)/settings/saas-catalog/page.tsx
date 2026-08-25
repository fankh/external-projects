import { ExportButton } from '@/components/ExportButton'
import { Card, ScreenHeader, Stat } from '@/components/ui'
import { requireView } from '@/lib/authz'
import { today } from '@/lib/dates'
import { buildSaasReview } from '@/lib/saas-review'
import { getStore } from '@/lib/store'
import { requiresApproval } from '@/lib/approval'
import { saasEscalateTargets } from '@/lib/reminders'
import { CatalogTable } from './CatalogTable'
import { SaasEscalateButton } from './SaasEscalateButton'

export const dynamic = 'force-dynamic'

export default async function SaasCatalogPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireView('/settings/saas-catalog', 'SEC_MGR', 'ADMIN')
  // status=review — 대시보드 '미판정 SaaS' 큐의 드릴다운(검토 대기만 보기로 연다).
  const { status: statusParam } = await searchParams
  const s = getStore()
  const c = s.saasCatalog
  const review = buildSaasReview()

  return (
    <>
      <ScreenHeader
        kicker="환경설정 · SaaS Catalog"
        title="SaaS 카탈로그"
        desc="인가 SaaS 등재 · 미인가 서비스 판정 — 판정 결과는 Discovery의 Shadow SaaS 현황으로 환류"
        right={<ExportButton kind="saasCatalog" role={session.role} label="SaaS 정책 대장 엑셀" />}
      />

      <div className="stat-row">
        <Stat value={c.filter((x) => x.status === '인가').length} label="인가 등재" tone="ok" />
        <Stat value={c.filter((x) => x.status === '검토중').length} label="검토 대기" tone="warn" delta={{ text: review.overdue.length ? `판정 기한(${review.slaDays}일) 경과 ${review.overdue.length}건` : '기한 내 판정 진행', dir: review.overdue.length ? 'up' : 'flat' }} />
        <Stat value={c.filter((x) => x.status === '차단').length} label="차단 지정" tone="err" />
        <Stat value={c.filter((x) => x.dataGrade === '기밀').length} label="기밀 등급 취급" tone="err" delta={{ text: '데이터 등급 기준 우선 검토', dir: 'flat' }} />
      </div>

      <div className="callout">
        <b>판정이 곧 정책.</b> 여기서 <b>인가</b>로 판정하면 Discovery의 Shadow SaaS 현황에서 해당 서비스가
        인가 상태로 바뀌고 미인가 집계에서 빠집니다. <b>차단</b> 판정은 프록시 차단 정책 대상으로 분류됩니다.
        기밀 등급을 취급하는 서비스는 판정 전 데이터 반출 범위를 먼저 확인하세요.
      </div>

      {review.overdue.length > 0 && (
        <div className="callout" style={{ borderColor: 'var(--err)' }}>
          <b>판정 기한 경과 {review.overdue.length}건 (최장 {review.oldestDays}일).</b> 검토중 SaaS 는 접수 후 {review.slaDays}일 내 인가/차단으로 판정해야 합니다.
          기한 경과분은 대시보드 에스컬레이션 큐에 노출됩니다{review.overdueSensitive > 0 ? <> — 이 중 <b>민감·기밀 등급 {review.overdueSensitive}건</b>은 데이터 반출 위험으로 우선 판정하세요</> : null}.
          {' '}대상: {review.overdue.map((e) => `${e.service}(${e.dataGrade})`).join(', ')}.
          {/* 버튼 건수는 '오늘 아직 안 보낸' 대상 수(lib/reminders · 액션과 같은 소스) — 위 문구의 경과 건수(신호)와 집합이 다르다 */}
          <SaasEscalateButton overdue={saasEscalateTargets().length} />
        </div>
      )}

      <Card kicker="Catalog" title="서비스 목록 · 판정" pad={false}>
        <CatalogTable entries={c} today={today()} slaDays={review.slaDays} approveNeedsApproval={requiresApproval('SaaS 인가')} reviewOnly={statusParam === 'review'} />
      </Card>
    </>
  )
}
