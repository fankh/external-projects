import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { ConnectorTable } from './ConnectorTable'

export const dynamic = 'force-dynamic'

export default async function IntegrationsPage() {
  const session = await requireRole('ASSET_MGR', 'SEC_MGR', 'ADMIN')
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

      <Card kicker="Audit" title="감사 로그" pad={false}
        actions={<span className="hstack" style={{ gap: 8 }}>
          {canManage && <a className="btn sm" href="/api/audit-export" download>감사 로그 엑셀</a>}
          <span className="chip neutral bare">전자결재 · 자산 이력 · AI 로그 추적성</span>
        </span>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>일시</th><th>수행자</th><th>동작</th><th>대상</th><th>접근 IP</th><th className="c">결과</th></tr></thead>
            <tbody>
              {s.auditLogs.map((l) => (
                <tr key={l.id}>
                  <td className="tnum">{l.at}</td>
                  <td className="strong">{l.actor}</td>
                  <td>{l.action}</td>
                  <td className="code">{l.target}</td>
                  <td className="tnum mute">{l.ip}</td>
                  <td className="c"><Chip tone={l.result === '성공' ? 'ok' : 'err'}>{l.result}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card kicker="Notifications" title={`알림 발송 이력 ${s.dispatches.length}건`} pad={false}>
        {s.dispatches.length === 0 ? (
          <div className="empty">발송 이력이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>발송 ID</th><th className="c">채널</th><th className="c">종류</th><th>수신</th><th>제목</th><th>연결 문서</th><th>발송 시각</th></tr>
              </thead>
              <tbody>
                {s.dispatches.map((m) => (
                  <tr key={m.id}>
                    <td className="code">{m.id}</td>
                    <td className="c"><Chip tone={m.channel === '문자' ? 'warn' : 'info'}>{m.channel}</Chip></td>
                    <td className="c mute">{m.kind}</td>
                    <td>{m.to}</td>
                    <td className="strong" style={{ maxWidth: 360 }}>{m.subject}</td>
                    <td className="code">{m.ref ?? '-'}</td>
                    <td className="tnum">{m.at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="cols c2">
        <div className="callout"><b>인증.</b> SAML 기반 SSO — 그룹웨어 IdP 어설션으로 로그인하며, 부여된 메뉴·기능만 렌더링됩니다.</div>
        <div className="callout"><b>알림.</b> 소유자 확인 요청·만료 임박·격리 통보는 이메일·문자로 발송되며, 발송 이력은 위 표와 감사 로그에 함께 남습니다.</div>
      </div>
    </>
  )
}
