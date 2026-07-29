import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { AiPolicyPanel } from './AiPolicyPanel'

export const dynamic = 'force-dynamic'

export default async function AiPolicyPage() {
  await requireRole('ADMIN')
  const s = getStore()
  const p = s.aiPolicy
  // AI 거버넌스는 "제안·질의·응답 전체" 보존을 요구한다. 사용자가 던진 질의와 제안 판정도
  // AI 활동이므로 함께 모은다 — actor 가 'AI 서비스'인 건만 보면 실제 질의가 빠진다.
  const aiLogs = s.auditLogs.filter(
    (l) =>
      l.actor === 'AI 서비스' ||
      l.target === 'AI 정책' ||
      l.target === 'AI 어시스턴트' ||
      l.action.startsWith('AI 제안'),
  )

  return (
    <>
      <ScreenHeader
        kicker="환경설정 · AI Governance"
        title="AI 정책"
        desc="실행 환경 선택 · 권한 범위 필터 · 감사 로그 보존 · 모델/프롬프트 버전 관리"
        right={<Chip tone={p.deployment === '온프레미스 LLM' ? 'ok' : 'warn'}>{p.deployment}</Chip>}
      />

      <div className="stat-row">
        <Stat value={p.classifyAccuracy.toFixed(1)} label="분류 정확도 (%)" tone="ok" delta={{ text: `프롬프트 ${p.promptVersion}`, dir: 'flat' }} />
        <Stat value={p.auditRetentionDays} label="AI 감사 로그 보존 (일)" />
        <Stat value={p.scopeFilter ? 'ON' : 'OFF'} label="권한 범위 필터" tone={p.scopeFilter ? 'ok' : 'err'} />
        <Stat value={p.autoApprove ? 'ON' : 'OFF'} label="AI 제안 자동 승인" tone={p.autoApprove ? 'err' : 'ok'} delta={{ text: p.autoApprove ? '담당자 확인 생략 — 권장하지 않음' : '담당자 확인·결재 원칙 유지', dir: 'flat' }} />
      </div>

      <AiPolicyPanel policy={p} />

      <div className="cols c2">
        <Card kicker="Deployment" title="실행 환경 옵션">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>옵션</th><th>구성</th></tr></thead>
              <tbody>
                <tr><td className="strong">온프레미스 LLM</td><td style={{ whiteSpace: 'normal' }}>사내 GPU 서버에 오픈 모델 배치 — 자산 데이터 외부 반출 없음 (망분리 환경 기본안)</td></tr>
                <tr><td className="strong">외부 API 연계</td><td style={{ whiteSpace: 'normal' }}>비식별 처리 후 상용 LLM API 활용 — 보안성 검토 전제</td></tr>
                <tr><td className="strong">하이브리드</td><td style={{ whiteSpace: 'normal' }}>분류·질의는 온프레미스, 대량 배치 분석만 선별 외부 처리</td></tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card kicker="Audit" title="AI 관련 감사 로그" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>일시</th><th>수행자</th><th>동작</th><th>대상</th></tr></thead>
              <tbody>
                {aiLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="tnum">{l.at}</td>
                    <td className="strong">{l.actor}</td>
                    <td style={{ whiteSpace: 'normal' }}>{l.action}</td>
                    <td className="code">{l.target}</td>
                  </tr>
                ))}
                {aiLogs.length === 0 && <tr><td colSpan={4}><div className="empty">기록된 AI 로그가 없습니다</div></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="callout">
        <b>AI 거버넌스.</b> AI 제안·질의·응답 전체를 감사 로그로 보존하고, 모델·프롬프트 버전과 분류 정확도를
        정기 리포트로 관리합니다. 권한 밖 데이터는 질의 컨텍스트에서 원천 배제되며, 이 필터를 끄면 AI 응답이
        사용자 권한을 넘어선 자산 정보를 포함할 수 있습니다.
      </div>
    </>
  )
}
