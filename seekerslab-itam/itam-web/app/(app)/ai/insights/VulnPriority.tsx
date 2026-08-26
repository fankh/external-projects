import Link from 'next/link'
import { Card, Chip, RiskChip, Stat } from '@/components/ui'
import { buildVulnPriority } from '@/lib/vuln-priority'

const TIER_TONE = { P1: 'err', P2: 'warn', P3: 'neutral' } as const

const TIERS = ['P1', 'P2', 'P3'] as const
const TOP_N = 12

/** 취약점 노출 우선순위 — 자산 중요도 × 노출도 스코어링(§05 AI 기능 04). 읽기 전용 합성 뷰.
 *  등급 필터(?tier=)는 URL 로 받는다 — 서버 컴포넌트로 두면 목록이 서버에서 확정되어 반출·딥링크와 같은 집합이 된다. */
export function VulnPriority({ tier }: { tier?: string }) {
  const { items, p1, p2, p3, bySource } = buildVulnPriority()
  const pick = TIERS.find((x) => x === (tier ?? '').toUpperCase())
  // 등급을 고르면 그 등급 전량을 보여 준다 — 대시보드 'P1 즉시 조치' 큐가 12건보다 많으면 그 뒤 항목은
  //  화면 어디에서도 볼 수 없었다(표는 점수 상위 12건에서 끊기고, 남은 건수만 '… 외 N건'으로 알려 줬다).
  const scoped = pick ? items.filter((v) => v.tier === pick) : items
  const top = pick ? scoped : scoped.slice(0, TOP_N)
  const tierCount = { P1: p1, P2: p2, P3: p3 }

  return (
    <Card
      kicker="AI Function 04 · Exposure Scoring"
      title="취약점 노출 우선순위 — 조치 우선순위 스코어링"
      pad={false}
      actions={<span className="dim" style={{ fontSize: 11.5 }}>자산 중요도 × 노출도 · {top.length} / {items.length}건</span>}
    >
      <div className="stat-row" style={{ margin: 14 }}>
        <Stat value={p1} label="P1 — 즉시 조치" tone={p1 ? 'err' : 'ok'} />
        <Stat value={p2} label="P2 — 우선 조치" tone={p2 ? 'warn' : 'ok'} />
        <Stat value={p3} label="P3 — 계획 조치" />
        <Stat value={items.length} label="스코어링 대상" delta={{ text: bySource.filter((x) => x.count).map((x) => `${x.source} ${x.count}`).join(' · '), dir: 'flat' }} />
      </div>

      <div className="hstack" style={{ gap: 8, padding: '0 14px 10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Link className={`btn sm ${pick ? 'ghost' : 'pri'}`} href="/ai/insights">전체 {items.length}</Link>
        {TIERS.map((x) => (
          <Link key={x} className={`btn sm ${pick === x ? (x === 'P1' ? 'err' : 'pri') : 'ghost'}`} href={`/ai/insights?tier=${x.toLowerCase()}#vuln`}
            title={`${x} 등급만 — 고르면 상위 ${TOP_N}건 제한 없이 전량을 보여 줍니다`}>
            {pick === x ? '✓ ' : ''}{x} {tierCount[x]}
          </Link>
        ))}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="c">순위</th><th className="c">등급</th><th>출처</th><th>대상</th><th>상세</th>
              <th className="c">노출도</th><th className="c">자산 중요도</th><th className="num">점수</th><th className="c">조치</th>
            </tr>
          </thead>
          <tbody>
            {top.map((v, i) => (
              <tr key={v.id}>
                <td className="c tnum">{i + 1}</td>
                <td className="c"><Chip tone={TIER_TONE[v.tier]}>{v.tier}</Chip></td>
                <td className="mute">{v.source}</td>
                <td className="strong">{v.target}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 300 }}>{v.detail}</td>
                <td className="c"><RiskChip risk={v.severity} /></td>
                <td className="c"><RiskChip risk={v.criticality} /></td>
                <td className="num tnum" style={{ fontWeight: 700 }}>{v.score}</td>
                <td className="c"><Link className="btn sm ghost" href={v.href}>조치</Link></td>
              </tr>
            ))}
            {top.length === 0 && <tr><td colSpan={9}><div className="empty">{items.length === 0 ? '스코어링 대상 취약점이 없습니다' : '이 등급에 해당하는 항목이 없습니다 — 전체를 누르면 모두 보입니다'}</div></td></tr>}
          </tbody>
        </table>
      </div>
      {!pick && items.length > top.length && (
        <div className="dim" style={{ margin: 14, fontSize: 11.5 }}>… 외 {items.length - top.length}건 (점수 내림차순) — 등급을 고르면 그 등급 전량을 볼 수 있습니다</div>
      )}
      <div className="callout" style={{ margin: 14 }}>
        <b>자산 중요도 × 노출도.</b> 외부 노출 CVE·EOL OS 자산·미인가 SW·크리덴셜 노출을 한 축으로 모아 점수화하고
        P1(즉시)·P2(우선)·P3(계획)로 순위화합니다. 인터넷 노출·서버/네트워크·IDC 자산일수록 중요도가 높게 반영됩니다.
        각 항목은 해당 조치 화면(외부 공격표면·발견 자산·자산 대장)으로 연결됩니다.
      </div>
    </Card>
  )
}
