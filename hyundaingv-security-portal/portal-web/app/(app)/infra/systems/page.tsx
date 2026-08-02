import Link from 'next/link'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'

const DISK_WARN = 85

export default async function SystemsPage() {
  await requireRole('BIZ_MGR', 'ADMIN')
  const s = getStore()

  const diskWarns = s.servers.filter((v) => v.diskUsedPct > DISK_WARN)
  const incidentsOf = (systemName: string) =>
    s.incidents.filter((i) => i.system === systemName || i.system === systemName.replace(' (개발계)', ''))

  return (
    <>
      <ScreenHeader kicker="인프라 운영" title="시스템 · 서버 현황"
        desc="랙 → H/W → 서버 → 시스템(애플리케이션) 구성 — 접속 URL·개발계/운영계·서버 매핑과 장애 이력을 잇는다." />

      <div className="stat-row">
        <Stat value={s.systems.length} label="시스템" note={`운영계 ${s.systems.filter((x) => x.env === '운영계').length}`} />
        <Stat value={s.servers.length} label="서버" note={`랙 ${new Set(s.servers.map((v) => v.rack)).size}개`} />
        <Stat value={diskWarns.length} label={`디스크 경고 (>${DISK_WARN}%)`} tone={diskWarns.length > 0 ? 'err' : undefined} />
        <Stat value={s.incidents.filter((i) => i.status === '조치중').length} label="조치중 장애" tone={s.incidents.some((i) => i.status === '조치중') ? 'warn' : undefined} />
      </div>

      <Card title="시스템 현황 — 애플리케이션" kicker="Systems" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>코드</th><th>시스템</th><th>구분</th><th>접속 URL</th><th>서버</th><th>담당</th><th className="num">장애 이력</th></tr>
            </thead>
            <tbody>
              {s.systems.map((x) => {
                const inc = incidentsOf(x.name)
                return (
                  <tr key={x.id}>
                    <td className="code">{x.id}</td>
                    <td className="strong">{x.name}</td>
                    <td>{x.env === '운영계' ? <Chip tone="info" bare>운영계</Chip> : <Chip tone="neutral" bare>개발계</Chip>}</td>
                    <td className="mono" style={{ fontSize: 11.5 }}>{x.url}</td>
                    <td>{x.serverIds.map((id) => s.servers.find((v) => v.id === id)?.hostname).join(' · ')}</td>
                    <td>{x.owner}</td>
                    <td className="num">
                      {inc.length > 0
                        ? <Link href="/infra/incidents"><Chip tone={inc.some((i) => i.status === '조치중') ? 'err' : 'neutral'} bare>{inc.length}건</Chip></Link>
                        : <span className="mut">-</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="서버 · 랙 구성" kicker="Servers" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>호스트명</th><th>IP</th><th>용도</th><th>OS</th><th>랙</th><th style={{ width: 200 }}>디스크 사용률</th></tr>
            </thead>
            <tbody>
              {s.servers.map((v) => (
                <tr key={v.id}>
                  <td className="code">{v.hostname}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{v.ip}</td>
                  <td><Chip tone="neutral" bare>{v.purpose}</Chip></td>
                  <td>{v.os}</td>
                  <td className="tnum">{v.rack}</td>
                  <td>
                    <div className="hstack" style={{ gap: 7 }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${v.diskUsedPct}%`, height: '100%', background: v.diskUsedPct > DISK_WARN ? 'var(--err)' : v.diskUsedPct > 70 ? 'var(--warn)' : 'var(--ink)' }} />
                      </div>
                      <span className="tnum" style={{ fontSize: 11.5, width: 34, textAlign: 'right', color: v.diskUsedPct > DISK_WARN ? 'var(--err)' : undefined }}>{v.diskUsedPct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="callout">
        <b>연계</b> — 장애 이력은 <b>장애관리</b>의 시스템명 기준 집계이고, 배치·인터페이스·디스크 상세는{' '}
        <b>배치 · 인터페이스 · 디스크</b> 화면에서 관리한다.
      </div>
    </>
  )
}
