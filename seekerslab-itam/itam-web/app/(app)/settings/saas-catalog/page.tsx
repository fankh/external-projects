import { Card, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { CatalogTable } from './CatalogTable'

export const dynamic = 'force-dynamic'

export default async function SaasCatalogPage() {
  await requireRole('ADMIN')
  const s = getStore()
  const c = s.saasCatalog

  return (
    <>
      <ScreenHeader
        kicker="환경설정 · SaaS Catalog"
        title="SaaS 카탈로그"
        desc="인가 SaaS 등재 · 미인가 서비스 판정 — 판정 결과는 Discovery의 Shadow SaaS 현황으로 환류"
      />

      <div className="stat-row">
        <Stat value={c.filter((x) => x.status === '인가').length} label="인가 등재" tone="ok" />
        <Stat value={c.filter((x) => x.status === '검토중').length} label="검토 대기" tone="warn" delta={{ text: '부서 확인 후 판정 필요', dir: 'flat' }} />
        <Stat value={c.filter((x) => x.status === '차단').length} label="차단 지정" tone="err" />
        <Stat value={c.filter((x) => x.dataGrade === '기밀').length} label="기밀 등급 취급" tone="err" delta={{ text: '데이터 등급 기준 우선 검토', dir: 'flat' }} />
      </div>

      <div className="callout">
        <b>판정이 곧 정책.</b> 여기서 <b>인가</b>로 판정하면 Discovery의 Shadow SaaS 현황에서 해당 서비스가
        인가 상태로 바뀌고 미인가 집계에서 빠집니다. <b>차단</b> 판정은 프록시 차단 정책 대상으로 분류됩니다.
        기밀 등급을 취급하는 서비스는 판정 전 데이터 반출 범위를 먼저 확인하세요.
      </div>

      <Card kicker="Catalog" title="서비스 목록 · 판정" pad={false}>
        <CatalogTable entries={c} />
      </Card>
    </>
  )
}
