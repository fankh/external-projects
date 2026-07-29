import Link from 'next/link'
import { Card, Chip, RiskChip, ScreenHeader, Stat } from '@/components/ui'
import { daysUntil } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = (await getSession())!
  const s = getStore()

  const inUse = s.assets.filter((a) => a.status === '사용중').length
  const idle = s.assets.filter((a) => a.status === '유휴' || a.status === '반납대기').length
  const newFound = s.discovered.filter((d) => d.state === '미등록' && !d.action)
  const pendingApr = s.approvals.filter((a) => a.status === '대기')
  const myApr = s.approvals.filter((a) => a.requester === session.name && a.status === '대기')
  const myAssets = s.assets.filter((a) => a.owner === session.name)

  const expiring = [
    ...s.contracts.map((c) => ({ id: c.id, name: c.name, kind: c.kind === '유지보수' ? '유지보수 계약' : '구매 계약', end: c.end, d: daysUntil(c.end) })),
    ...s.licenses.map((l) => ({ id: l.id, name: l.name, kind: 'SW 라이선스', end: l.expiry, d: daysUntil(l.expiry) })),
  ]
    .filter((x) => x.d !== null && x.d <= 90)
    .sort((a, b) => (a.d ?? 0) - (b.d ?? 0))

  const round = s.inventoryRounds.find((r) => r.status === '진행중')
  const topInsights = s.insights.filter((i) => i.status === '제안').slice(0, 3)

  return (
    <>
      <ScreenHeader
        kicker="Main · Overview"
        title={`${session.name}님, 현황 요약입니다`}
        desc="자산 현황 · 미등록 자산 신규 발견 · 만료 임박 · My Work"
      />

      <div className="stat-row">
        <Stat value={s.assets.length.toLocaleString()} label="총 등록 자산" delta={{ text: `사용중 ${inUse} · 유휴/반납 ${idle}`, dir: 'flat' }} />
        <Stat value={newFound.length} label="미등록 신규 발견 (Shadow IT)" tone="err" delta={{ text: '소유자 확인·편입 필요', dir: 'up' }} />
        <Stat value={expiring.length} label="만료 임박 (계약·라이선스 90일)" tone="warn"
          delta={{ text: expiring.some((x) => (x.d ?? 0) < 0) ? `만료 ${expiring.filter((x) => (x.d ?? 0) < 0).length}건 포함` : `최단 ${expiring[0]?.d ?? '-'}일`, dir: 'flat' }} />
        <Stat value={pendingApr.length} label="결재 대기" tone="accent" delta={{ text: `내 신청 ${myApr.length}건`, dir: 'flat' }} />
        {round && (
          <Stat
            value={<>{Math.round((round.scanned / round.planned) * 100)}<small>%</small></>}
            label={`재물조사 진행률 — ${round.name.replace(' 정기 재물조사', '')}`}
            tone="ok"
            delta={{ text: `${round.scanned.toLocaleString()} / ${round.planned.toLocaleString()} 스캔`, dir: 'flat' }}
          />
        )}
      </div>

      <div className="cols main-side">
        <div className="vstack">
          <Card kicker="Discovery" title="미등록 자산 신규 발견" pad={false}
            actions={<Link className="btn sm" href="/discovery/found">전체 보기</Link>}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>발견 ID</th><th>호스트명</th><th>유형</th><th>채널</th><th>최초 발견</th><th className="c">위험도</th></tr>
                </thead>
                <tbody>
                  {newFound.map((d) => (
                    <tr key={d.id}>
                      <td className="code">{d.id}</td>
                      <td className="strong">{d.hostname}</td>
                      <td>{d.type}</td>
                      <td className="mute">{d.channel}</td>
                      <td className="tnum">{d.firstSeen}</td>
                      <td className="c"><RiskChip risk={d.risk} /></td>
                    </tr>
                  ))}
                  {newFound.length === 0 && <tr><td colSpan={6}><div className="empty">신규 발견 자산이 없습니다</div></td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card kicker="Contracts · Licenses" title="만료 임박" pad={false}
            actions={<Link className="btn sm" href="/inventory/contracts">계약 · 라이선스</Link>}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>구분</th><th>대상</th><th>만료일</th><th className="num">잔여</th><th className="c">상태</th></tr>
                </thead>
                <tbody>
                  {expiring.map((x) => (
                    <tr key={x.id}>
                      <td className="mute">{x.kind}</td>
                      <td className="strong">{x.name}</td>
                      <td className="tnum">{x.end}</td>
                      <td className="num tnum">{x.d !== null && x.d < 0 ? '경과' : `${x.d}일`}</td>
                      <td className="c">
                        {x.d !== null && x.d < 0 ? <Chip tone="err">만료됨</Chip>
                          : x.d !== null && x.d <= 35 ? <Chip tone="err">갱신 시급</Chip>
                          : <Chip tone="warn">갱신 검토</Chip>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="vstack">
          <Card kicker="My Work" title="내 작업">
            <div className="vstack" style={{ gap: 10 }}>
              {myApr.length > 0 ? myApr.map((a) => (
                <div key={a.id} className="hstack" style={{ justifyContent: 'space-between' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                  <Chip tone="info">{a.currentStep}</Chip>
                </div>
              )) : <div className="mut">진행 중인 신청이 없습니다.</div>}
              <div className="hstack" style={{ justifyContent: 'space-between' }}>
                <span className="dim">내 보유 자산</span>
                <Link href="/assets/register">{myAssets.length}대 조회 →</Link>
              </div>
            </div>
          </Card>

          <Card kicker="AI Intelligence" title="AI 제안 Top 3"
            actions={<Link className="btn sm ghost" href="/ai/insights">전체</Link>}>
            <div className="vstack" style={{ gap: 12 }}>
              {topInsights.map((i) => (
                <div key={i.id}>
                  <div className="hstack" style={{ gap: 6 }}>
                    <RiskChip risk={i.severity} />
                    <span className="kicker mute">{i.kind}</span>
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{i.title}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card kicker="Notice" title="공지 · QnA">
            <div className="vstack" style={{ gap: 8 }}>
              {s.notices.map((n) => (
                <div key={n.id} className="hstack" style={{ justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.pinned && <Chip tone="err" bare>필독</Chip>} {n.title}
                  </span>
                  <span className="mut tnum" style={{ flex: 'none' }}>{n.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
