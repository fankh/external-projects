import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

const STATUS_TONE = { 정상: 'ok', 지연: 'warn', 오류: 'err', 미연동: 'neutral' } as const

export default async function IntegrationsPage() {
  await requireRole('ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const s = getStore()
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
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>연동 대상</th><th>방식</th><th>용도</th><th className="c">역할</th><th className="c">상태</th><th>최근 수집</th><th className="num">24h 건수</th></tr>
            </thead>
            <tbody>
              {s.integrations.map((i) => (
                <tr key={i.id}>
                  <td className="strong">{i.system}</td>
                  <td className="mute">{i.method}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 420 }}>{i.purpose}</td>
                  <td className="c"><Chip tone={i.role === '수집' ? 'neutral' : 'info'} bare>{i.role}</Chip></td>
                  <td className="c"><Chip tone={STATUS_TONE[i.status]}>{i.status}</Chip></td>
                  <td className="tnum mute">{i.lastSync}</td>
                  <td className="num tnum">{i.volume24h.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="callout" style={{ margin: 14 }}>
          <b>발견과 조치의 양방향 연동.</b> NAC에서 자산 정보를 수집하고, 판정 결과를 다시 NAC 격리로 되돌려
          보내는 폐쇄 루프로 연동합니다. 신규 에이전트 배포 없이 이미 보유한 시스템의 API·로그를 커넥터로 연결해
          도입 초기부터 발견과 조치를 함께 운영할 수 있습니다.
        </div>
      </Card>

      <Card kicker="Audit" title="감사 로그" pad={false}
        actions={<span className="chip neutral bare">전자결재 · 자산 이력 · AI 로그 추적성</span>}>
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

      <div className="cols c2">
        <div className="callout"><b>인증.</b> SAML 기반 SSO — 그룹웨어 IdP 어설션으로 로그인하며, 부여된 메뉴·기능만 렌더링됩니다.</div>
        <div className="callout"><b>알림.</b> 소유자 확인 요청·만료 임박·격리 통보는 이메일·문자로 발송되며, 발송 이력은 감사 로그에 남습니다.</div>
      </div>
    </>
  )
}
