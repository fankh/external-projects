import { Card, Chip, RiskChip, ScreenHeader } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import type { InsightKind } from '@/lib/types'

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
  await requireRole('ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const s = getStore()
  return (
    <>
      <ScreenHeader
        kicker="AI Intelligence · Analytics"
        title="분석 · 예측"
        desc="이상 자산 행위 탐지 · 교체수요·수명 예측 · 라이선스 최적화 제안 — 제안 → 담당자 확인·결재 → 대장 반영"
      />

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
        <b>제안 → 확인 → 환류 구조.</b> 분류·이상 탐지·예측·우선순위 결과는 판단 근거와 함께 제안으로 표시되고,
        담당자 확인·결재를 거쳐 반영되며, 승인·반려 결과는 재학습에 사용됩니다.
      </div>

      <Card kicker="Proposals" title="AI 제안" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>ID</th><th>기능</th><th className="c">심각도</th><th>제안</th><th>근거</th><th>일자</th><th className="c">상태</th></tr>
            </thead>
            <tbody>
              {s.insights.map((i) => (
                <tr key={i.id}>
                  <td className="code">{i.id}</td>
                  <td className="mute">{i.kind}</td>
                  <td className="c"><RiskChip risk={i.severity} /></td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 480 }}>
                    <div className="strong" style={{ whiteSpace: 'normal' }}>{i.title}</div>
                    <div className="dim" style={{ fontSize: 11.5, whiteSpace: 'normal' }}>{i.detail}</div>
                  </td>
                  <td className="mute" style={{ fontSize: 11.5 }}>{i.evidence}</td>
                  <td className="tnum">{i.createdAt.slice(5)}</td>
                  <td className="c">
                    <Chip tone={i.status === '승인' ? 'ok' : i.status === '반려' ? 'err' : 'info'}>{i.status}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
