import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { ExportButton } from '@/components/ExportButton'
import { requireView } from '@/lib/authz'
import { nowMinute } from '@/lib/dates'
import { isScanOverdue } from '@/lib/scan-policy'
import { getStore } from '@/lib/store'
import { ScanConsole } from './ScanConsole'
import { ScanRerunButton } from './ScanRerunButton'

export const dynamic = 'force-dynamic'

/** 정책 창 판정 — 클라이언트에도 같은 규칙을 넘겨 실행 전에 경고를 띄운다 */
function inWindow(window: string, hhmm: string): boolean {
  if (window === '상시') return true
  const m = window.match(/(\d{2}):(\d{2})\s*~\s*(\d{2}):(\d{2})/)
  if (!m) return true
  const cur = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
  const from = Number(m[1]) * 60 + Number(m[2])
  const to = Number(m[3]) * 60 + Number(m[4])
  return from <= to ? cur >= from && cur <= to : cur >= from || cur <= to
}

const RUN_TONE = { 완료: 'ok', '실행 중': 'info', 중단: 'warn' } as const

export default async function ScanPage() {
  const session = await requireView('/discovery/scan', 'ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const s = getStore()
  const now = nowMinute()
  const clock = now.slice(11, 16)

  const policies = s.scanPolicies.map((p) => ({
    channel: p.channel, enabled: p.enabled, kind: p.kind, targets: p.targets,
    window: p.window, intensity: p.intensity, interval: p.interval,
    inWindow: inWindow(p.window, clock),
  }))

  // 채널별 마지막 수집 시각·관측 수 — 관측 저장소가 원천이다
  const byChannel = new Map<string, { last: string; count: number }>()
  for (const o of s.observations) {
    const cur = byChannel.get(o.channel)
    if (!cur) byChannel.set(o.channel, { last: o.seenAt, count: 1 })
    else { cur.count += 1; if (o.seenAt > cur.last) cur.last = o.seenAt }
  }

  const runs = s.scanRuns
  const last = runs[0]
  const recentNew = runs.slice(0, 7).reduce((n, r) => n + r.newFound, 0)
  const activeChannels = policies.filter((p) => p.enabled).length

  return (
    <>
      <ScreenHeader
        kicker="Discovery · Collection"
        title="스캔 실행 · 수집 현황"
        desc="6종 채널 병렬 수집 — 대역·시간대·강도 정책 통제 · 관측은 자산 지문으로 병합되어 발견 저장소에 반영"
        right={<ExportButton kind="discovered" role={session.role} label="발견 자산 엑셀" />}
      />

      <div className="stat-row">
        <Stat value={`${activeChannels}/${policies.length}`} label="활성 수집 채널" tone={activeChannels === policies.length ? 'ok' : 'warn'} />
        <Stat value={s.observations.length} label="누적 관측" delta={{ text: `발견 자산 ${s.discovered.length}건으로 병합`, dir: 'flat' }} />
        <Stat value={recentNew} label="최근 7회차 신규 발견" tone={recentNew ? 'err' : 'ok'} />
        <Stat value={last ? last.startedAt.slice(5) : '-'} label={last ? `마지막 스캔 — ${last.by}` : '스캔 이력 없음'} />
      </div>

      <ScanConsole policies={policies} clock={clock} defaultScope={s.scanPolicies[0]?.targets ?? '10.20.0.0/16'} />

      <Card kicker="Channels" title="채널별 수집 현황" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>채널</th><th className="c">방식</th><th>수집 대상</th><th className="c">허용 시간대</th>
                <th className="c">주기</th><th className="c">강도</th><th>마지막 수집</th><th className="num">관측</th><th className="c">상태</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p, i) => {
                const st = byChannel.get(p.channel)
                return (
                  <tr key={p.channel}>
                    <td className="strong">{String(i + 1).padStart(2, '0')} {p.channel}</td>
                    <td className="c mute">{p.kind}</td>
                    <td className="dim">{p.targets}</td>
                    <td className="c tnum">
                      {p.window}
                      {p.kind === '능동' && !p.inWindow && <div><Chip tone="warn">창 밖</Chip></div>}
                    </td>
                    <td className="c mute">{p.interval}</td>
                    <td className="c mute">{p.intensity}</td>
                    <td className="tnum">
                      {st?.last ?? <span className="dim">-</span>}
                      {isScanOverdue(p, st?.last, now) && <div><Chip tone="warn">재탐지 지연</Chip></div>}
                    </td>
                    <td className="num tnum">{st?.count ?? 0}</td>
                    <td className="c">
                      {p.enabled ? <Chip tone="ok">수집 중</Chip> : <Chip tone="err">중지</Chip>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card kicker="Scan History" title={`스캔 이력 ${runs.length}회차`} pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>회차</th><th>시작</th><th>종료</th><th className="num">채널</th><th>대상</th>
                <th className="c">강도</th><th className="num">관측</th><th className="num">재관측</th><th className="num">신규</th>
                <th>실행</th><th className="c">상태</th><th className="c">재실행</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="code">{r.id}</td>
                  <td className="tnum">{r.startedAt}</td>
                  <td className="tnum">{r.finishedAt ?? <span className="dim">진행 중</span>}</td>
                  <td className="num tnum">{r.channels.length}</td>
                  <td className="dim" style={{ maxWidth: 220 }}>{r.scope}</td>
                  <td className="c mute">{r.intensity}</td>
                  <td className="num tnum">{r.observed}</td>
                  <td className="num tnum">{r.reobserved}</td>
                  <td className="num tnum" style={r.newFound ? { color: 'var(--err)', fontWeight: 700 } : undefined}>{r.newFound}</td>
                  <td>
                    {r.by}
                    {r.override && <div className="dim" style={{ fontSize: 11 }}>시간대 밖 — {r.override}</div>}
                  </td>
                  <td className="c"><Chip tone={RUN_TONE[r.status]}>{r.status}</Chip></td>
                  <td className="c"><ScanRerunButton runId={r.id} /></td>
                </tr>
              ))}
              {runs.length === 0 && <tr><td colSpan={12}><div className="empty">스캔 이력이 없습니다</div></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="cols c2">
        <div className="callout">
          <b>기존 인프라 재활용 우선.</b> NAC·EDR·프록시·AD 등 이미 보유한 시스템의 API·로그를 커넥터로 수집합니다.
          에이전트 추가 배포는 필요 없습니다. 능동 스캔은 정책 협의 후 단계적으로 확대합니다.
        </div>
        <div className="callout">
          <b>스캔 안전장치.</b> 능동 스캔은 허용 시간대·대역·강도 정책 안에서만 실행되며, 창 밖 실행은
          사유가 감사 로그에 남습니다. 강도 <b>높음</b>은 창 밖에서 실행할 수 없습니다.
        </div>
      </div>
    </>
  )
}
