import Link from 'next/link'
import { Card, Chip, RiskChip, Stat } from '@/components/ui'
import { buildVulnPriority } from '@/lib/vuln-priority'

const TIER_TONE = { P1: 'err', P2: 'warn', P3: 'neutral' } as const

/** 취약점 노출 우선순위 — 자산 중요도 × 노출도 스코어링(§05 AI 기능 04). 읽기 전용 합성 뷰. */
export function VulnPriority() {
  const { items, p1, p2, p3, bySource } = buildVulnPriority()
  const top = items.slice(0, 12)

  return (
    <Card
      kicker="AI Function 04 · Exposure Scoring"
      title="취약점 노출 우선순위 — 조치 우선순위 스코어링"
      pad={false}
      actions={<span className="dim" style={{ fontSize: 11.5 }}>자산 중요도 × 노출도 · 총 {items.length}건</span>}
    >
      <div className="stat-row" style={{ margin: 14 }}>
        <Stat value={p1} label="P1 — 즉시 조치" tone={p1 ? 'err' : 'ok'} />
        <Stat value={p2} label="P2 — 우선 조치" tone={p2 ? 'warn' : 'ok'} />
        <Stat value={p3} label="P3 — 계획 조치" />
        <Stat value={items.length} label="스코어링 대상" delta={{ text: bySource.filter((x) => x.count).map((x) => `${x.source} ${x.count}`).join(' · '), dir: 'flat' }} />
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
            {items.length === 0 && <tr><td colSpan={9}><div className="empty">스코어링 대상 취약점이 없습니다</div></td></tr>}
          </tbody>
        </table>
      </div>
      {items.length > top.length && (
        <div className="dim" style={{ margin: 14, fontSize: 11.5 }}>… 외 {items.length - top.length}건 (점수 내림차순)</div>
      )}
      <div className="callout" style={{ margin: 14 }}>
        <b>자산 중요도 × 노출도.</b> 외부 노출 CVE·EOL OS 자산·미인가 SW·크리덴셜 노출을 한 축으로 모아 점수화하고
        P1(즉시)·P2(우선)·P3(계획)로 순위화합니다. 인터넷 노출·서버/네트워크·IDC 자산일수록 중요도가 높게 반영됩니다.
        각 항목은 해당 조치 화면(외부 공격표면·발견 자산·자산 대장)으로 연결됩니다.
      </div>
    </Card>
  )
}
