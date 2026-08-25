import { Card, ScreenHeader, Stat } from '@/components/ui'
import { requireView } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { openableRoutes } from '@/lib/perm'
import { AuditLog } from './AuditLog'
import { ConnectorTable } from './ConnectorTable'
import { NotificationLog } from './NotificationLog'

export const dynamic = 'force-dynamic'

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ dispatch?: string }> }) {
  const session = await requireView('/platform/integrations', 'ASSET_MGR', 'SEC_MGR', 'ADMIN')
  // 대시보드 재발송 큐(?dispatch=failed)의 드릴다운 — 큐가 말한 실패 건만 열어 준다.
  const { dispatch: dispatchParam } = await searchParams
  const s = getStore()
  const canManage = ['SEC_MGR', 'ADMIN'].includes(session.role)
  const live = s.integrations.filter((i) => i.status !== '미연동')
  const total24h = s.integrations.reduce((n, i) => n + i.volume24h, 0)

  return (
    <>
      <ScreenHeader
        kicker="기타 (기반) · Integration"
        title="연동 · 인프라"
        desc="NAC·EDR·AD·CSP·프록시 연동, 이메일·문자 발송, SSO(SAML), 감사 로그"
      />

      <div className="stat-row">
        <Stat value={`${live.length}/${s.integrations.length}`} label="연동 커넥터" tone="ok" delta={{ text: '표준 커넥터 (REST · 로그 · DB · SAML)', dir: 'flat' }} />
        <Stat value={total24h.toLocaleString()} label="24시간 수집 건수" />
        <Stat value={s.integrations.filter((i) => i.status === '지연').length} label="지연 커넥터" tone="warn" />
        <Stat value={s.integrations.filter((i) => i.role !== '수집').length} label="조치 채널 겸용" tone="accent" delta={{ text: '발견 ↔ 조치 양방향', dir: 'flat' }} />
      </div>

      <div className="pipe">
        <div className="step">
          <div className="k">COLLECT</div>
          <div className="t">수집 — API · 로그</div>
          <div className="s">NAC · EDR · AD/Entra · 프록시 · CSP</div>
        </div>
        <span className="arrow">→</span>
        <div className="step on">
          <div className="k">PLATFORM</div>
          <div className="t">AI 자산관리 플랫폼</div>
          <div className="s">Discovery 엔진 · CMDB 대사 · AI 서비스 · 전자결재</div>
        </div>
        <span className="arrow">→</span>
        <div className="step">
          <div className="k">ACT</div>
          <div className="t">조치 — 격리 · 알림</div>
          <div className="s">NAC 격리 · 그룹웨어 결재 · ITSM 연계</div>
        </div>
      </div>

      <Card kicker="Connectors" title="연동 대상 상세" pad={false}>
        <ConnectorTable integrations={s.integrations} canManage={canManage} />
      </Card>

      <AuditLog logs={s.auditLogs} canExport={canManage} role={session.role} openable={openableRoutes(session.role)} />

      <div className="callout" style={{ marginBottom: 14 }}>
        <b>긴급 보안 에스컬레이션은 문자(SMS) 병행.</b> NAC 격리 집행·외부 노출 차단·IOC 위협 차단·침해 조사·도난 데이터 유출처럼
        시간 임계 조치는 상세 근거를 이메일로, 즉시 알림을 <span className="chip warn bare">문자</span>로 이중 발송해 야간·현장 대응 지연을 줄입니다. 두 발송 모두 발송 이력에 남습니다.
      </div>

      <NotificationLog dispatches={s.dispatches} canExport={canManage} canManage={canManage} role={session.role} openable={openableRoutes(session.role)} deliveryParam={dispatchParam} />

      <div className="cols c2">
        <div className="callout"><b>인증.</b> SAML 기반 SSO — 그룹웨어 IdP 어설션으로 로그인하며, 부여된 메뉴·기능만 렌더링됩니다.</div>
        <div className="callout"><b>알림.</b> 소유자 확인 요청·만료 임박·격리 통보는 이메일·문자로 발송되며, 발송 이력은 위 표와 감사 로그에 함께 남습니다.</div>
      </div>
    </>
  )
}
