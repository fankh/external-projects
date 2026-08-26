import Link from 'next/link'
import { Card, Chip, RiskChip, Stat } from '@/components/ui'
import { buildAnomalies } from '@/lib/anomaly'
import { canOpenRoute } from '@/components/chrome/menus'
import type { Role } from '@/lib/types'

const KIND_TONE = { '미인가 SW 설치': 'err', '유휴 자산 사용': 'warn', '서버 비정상 외부 통신': 'err', 'USB 대용량 반출': 'err' } as const

const SEVERITIES = ['높음', '중간', '낮음'] as const
const TOP_N = 12

/** 이상 자산 행위 탐지 — 프로파일 대비 이탈(설치 SW·상태·데이터 반출)(§05 AI 기능 02). 읽기 전용 합성 뷰.
 *  심각도 필터(?anom=)는 URL 로 받는다 — 서버에서 목록이 확정되어 딥링크·새로고침이 같은 집합을 연다. */
export function AnomalyDetection({ role, openable, severity }: { role: Role; openable?: string[]; severity?: string }) {
  const { items, byKind } = buildAnomalies()
  const pick = SEVERITIES.find((x) => x === severity)
  // 심각도를 고르면 그 등급 전량을 보여 준다 — 표가 상위 12건에서 끊기는데 넘어갈 길이 없어,
  //  13번째부터의 이탈은 '외 N건'으로만 알려 주고 화면 어디에서도 볼 수 없었다(취약점 우선순위와 같은 자리).
  const scoped = pick ? items.filter((a) => a.severity === pick) : items
  const top = pick ? scoped : scoped.slice(0, TOP_N)
  const high = items.filter((i) => i.severity === '높음').length
  const countOf = (sev: (typeof SEVERITIES)[number]) => items.filter((i) => i.severity === sev).length

  return (
    <Card
      kicker="AI Function 02 · Behavioral Anomaly"
      title="이상 자산 행위 탐지 — 평시 프로파일 대비 이탈"
      pad={false}
      actions={<span className="dim" style={{ fontSize: 11.5 }}>비지도 이상탐지 · {top.length} / {items.length}건</span>}
    >
      <div className="stat-row" style={{ margin: 14 }}>
        <Stat value={high} label="높음 심각도 이탈" tone={high ? 'err' : 'ok'} />
        {byKind.map((k) => (
          <Stat key={k.kind} value={k.count} label={k.kind} tone={k.count ? 'warn' : 'ok'} />
        ))}
      </div>

      <div className="hstack" style={{ gap: 8, padding: '0 14px 10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Link className={`btn sm ${pick ? 'ghost' : 'pri'}`} href="/ai/insights">전체 {items.length}</Link>
        {SEVERITIES.map((x) => (
          <Link key={x} className={`btn sm ${pick === x ? (x === '높음' ? 'err' : 'pri') : 'ghost'}`}
            href={`/ai/insights?anom=${encodeURIComponent(x)}`}
            title={`심각도 ${x} 이탈만 — 고르면 상위 ${TOP_N}건 제한 없이 전량을 보여 줍니다`}>
            {pick === x ? '✓ ' : ''}{x} {countOf(x)}
          </Link>
        ))}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="c">유형</th><th>대상</th><th>상세</th><th>이탈 근거</th>
              <th className="c">심각도</th><th className="c">조치</th>
            </tr>
          </thead>
          <tbody>
            {top.map((a) => (
              <tr key={a.id}>
                <td className="c"><Chip tone={KIND_TONE[a.kind]} bare>{a.kind}</Chip></td>
                <td className="strong">{a.target}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 320 }}>{a.detail}</td>
                <td className="dim" style={{ whiteSpace: 'normal', maxWidth: 240 }}>{a.basis}</td>
                <td className="c"><RiskChip risk={a.severity} /></td>
                {/* 조치 화면을 열 수 없는 권한그룹에는 링크를 내주지 않는다 — 눌러도 대시보드로 튕긴다(유휴 자산 사용 축은
                    재물조사 화면으로 가는데 보안담당은 그 화면 권한이 없다). 신호 자체는 그대로 보여준다. */}
                <td className="c">{canOpenRoute(a.href, role) && (openable ?? []).includes(a.href.split('?')[0])
                  ? <Link className="btn sm ghost" href={a.href}>조치</Link>
                  : <span className="mut" style={{ fontSize: 11 }}>자산담당 조치</span>}</td>
              </tr>
            ))}
            {top.length === 0 && <tr><td colSpan={6}><div className="empty">{items.length === 0 ? '평시 프로파일 대비 이탈이 없습니다' : '이 심각도에 해당하는 이탈이 없습니다 — 전체를 누르면 모두 보입니다'}</div></td></tr>}
          </tbody>
        </table>
      </div>
      {!pick && items.length > top.length && (
        <div className="dim" style={{ margin: 14, fontSize: 11.5 }}>… 외 {items.length - top.length}건 (심각도 내림차순) — 심각도를 고르면 그 등급 전량을 볼 수 있습니다</div>
      )}
      <div className="callout" style={{ margin: 14 }}>
        <b>행위 이탈 관점.</b> 취약점 우선순위(노출도)와 달리, 자산별 평시 프로파일(설치 SW·상태·외부 통신·데이터 반출 패턴) 대비
        이탈을 모읍니다 — 미인가 SW 설치, 유휴(휴면) 자산의 갑작스런 사용, 서버의 비정상 외부 통신, 이상 데이터 반출. 각 항목은 해당 조치 화면
        (발견 자산·재물조사·분석 제안)으로 연결되며, 판정·조치는 기존 폐쇄 루프를 따릅니다.
      </div>
    </Card>
  )
}
