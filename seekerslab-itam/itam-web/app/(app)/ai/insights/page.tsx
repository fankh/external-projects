import { Card, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import type { InsightKind } from '@/lib/types'
import { AutoClassify } from './AutoClassify'
import { AnomalyDetection } from './AnomalyDetection'
import { LicenseOptimization } from './LicenseOptimization'
import { LifecyclePrediction } from './LifecyclePrediction'
import { ProposalList } from './ProposalList'
import { RiskPolicyPanel } from './RiskPolicyPanel'
import { VulnPriority } from './VulnPriority'

export const dynamic = 'force-dynamic'

/** AI 5대 기능 (제품안내서 §05) */
const FUNCTIONS: { kind: InsightKind; tech: string; desc: string }[] = [
  { kind: '자동분류', tech: 'LLM 분류 · 규칙 하이브리드', desc: '스캔 배너·설치 SW·모델명을 표준 자산 유형·제조사·모델로 자동 매핑' },
  { kind: '이상탐지', tech: '비지도 이상탐지 (프로파일 기반)', desc: '자산별 평시 프로파일 대비 이탈 탐지 — 미인가 SW, 휴면 자산의 갑작스런 활동' },
  { kind: '수명예측', tech: '생존 분석 · 회귀 모델', desc: '장애 이력·사용 연한·성능 기반 교체 시점 예측, 연간 교체수요·예산 추정' },
  { kind: '취약점 우선순위', tech: '스코어링 (중요도 × 노출도)', desc: '노출 서비스·EOL OS·미패치 SW를 자산 중요도와 결합해 조치 우선순위 산출' },
  { kind: '라이선스 최적화', tech: '사용 패턴 분석', desc: '장기 미사용 회수 후보, 중복 기능 SaaS 통합 후보, 갱신 협상 근거 데이터' },
]

export default async function InsightsPage() {
  const session = await requireRole('ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const s = getStore()
  // 위험도 기준 관리는 보안담당 책무(제품안내서 §01) — 자산담당은 조회만
  const canEditRisk = ['SEC_MGR', 'ADMIN'].includes(session.role)

  // 환류 지표 — 승인·반려 판정이 쌓여야 채택률이 의미를 갖는다. 미판정은 분모에서 제외한다.
  const pendingN = s.insights.filter((i) => i.status === '제안').length
  const approved = s.insights.filter((i) => i.status === '승인').length
  const rejected = s.insights.filter((i) => i.status === '반려').length
  const judged = approved + rejected
  const adoption = judged ? Math.round((approved / judged) * 100) : null

  const byKind = FUNCTIONS.map((f) => {
    const rows = s.insights.filter((i) => i.kind === f.kind)
    const ok = rows.filter((i) => i.status === '승인').length
    const no = rows.filter((i) => i.status === '반려').length
    return { kind: f.kind, total: rows.length, ok, no, rate: ok + no ? Math.round((ok / (ok + no)) * 100) : null }
  })

  return (
    <>
      <ScreenHeader
        kicker="AI Intelligence · Analytics"
        title="분석 · 예측"
        desc="이상 자산 행위 탐지 · 교체수요·수명 예측 · 라이선스 최적화 제안 — 제안 → 담당자 확인·결재 → 대장 반영"
      />

      <div className="stat-row">
        <Stat value={pendingN} label="판정 대기 제안" tone={pendingN ? 'accent' : 'ok'} />
        <Stat value={approved} label="승인 — 조치 연결" tone="ok" />
        <Stat value={rejected} label="반려 — 오탐 신호" tone={rejected ? 'warn' : undefined} />
        <Stat
          value={adoption === null ? '-' : `${adoption}%`}
          label={`채택률 — 판정 ${judged}건 기준`}
          delta={{ text: '판정 결과가 재학습에 환류', dir: 'flat' }}
        />
      </div>

      <div className="cols c3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {FUNCTIONS.map((f, i) => (
          <div key={f.kind} className="card" style={{ padding: '13px 15px' }}>
            <div className="kicker">{String(i + 1).padStart(2, '0')} · {f.tech}</div>
            <div style={{ fontWeight: 700, fontSize: 13.5, margin: '4px 0 3px' }}>{f.kind}</div>
            <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.55 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      <div className="callout">
        <b>제안 → 확인 → 환류 구조.</b> 분류·이상 탐지·예측·우선순위 결과는 근거와 함께 제안으로만 표시됩니다.
        담당자 확인·결재를 거쳐야 반영되고, 승인·반려는 재학습에 환류됩니다.
      </div>

      <ProposalList insights={s.insights} />

      <RiskPolicyPanel policy={s.riskPolicy} canEdit={canEditRisk} />

      <AutoClassify />

      <AnomalyDetection />

      <LifecyclePrediction canNotify={['ASSET_MGR', 'ADMIN'].includes(session.role)} />

      <VulnPriority />

      <LicenseOptimization />

      <Card kicker="Feedback Loop" title="기능별 판정 현황 — 재학습 신호" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>기능</th><th className="num">제안</th><th className="num">승인</th><th className="num">반려</th><th className="num">채택률</th></tr>
            </thead>
            <tbody>
              {byKind.map((k) => (
                <tr key={k.kind}>
                  <td>{k.kind}</td>
                  <td className="num tnum">{k.total}</td>
                  <td className="num tnum">{k.ok}</td>
                  <td className="num tnum">{k.no}</td>
                  <td className="num tnum">{k.rate === null ? <span className="dim">판정 전</span> : `${k.rate}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
