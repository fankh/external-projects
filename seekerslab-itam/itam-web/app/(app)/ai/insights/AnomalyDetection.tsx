import Link from 'next/link'
import { Card, Chip, RiskChip, Stat } from '@/components/ui'
import { buildAnomalies } from '@/lib/anomaly'

const KIND_TONE = { '미인가 SW 설치': 'err', '유휴 자산 사용': 'warn', '서버 비정상 외부 통신': 'err', 'USB 대용량 반출': 'err' } as const

/** 이상 자산 행위 탐지 — 프로파일 대비 이탈(설치 SW·상태·데이터 반출)(§05 AI 기능 02). 읽기 전용 합성 뷰. */
export function AnomalyDetection() {
  const { items, byKind } = buildAnomalies()
  const top = items.slice(0, 12)
  const high = items.filter((i) => i.severity === '높음').length

  return (
    <Card
      kicker="AI Function 02 · Behavioral Anomaly"
      title="이상 자산 행위 탐지 — 평시 프로파일 대비 이탈"
      pad={false}
      actions={<span className="dim" style={{ fontSize: 11.5 }}>비지도 이상탐지 · 총 {items.length}건</span>}
    >
      <div className="stat-row" style={{ margin: 14 }}>
        <Stat value={high} label="높음 심각도 이탈" tone={high ? 'err' : 'ok'} />
        {byKind.map((k) => (
          <Stat key={k.kind} value={k.count} label={k.kind} tone={k.count ? 'warn' : 'ok'} />
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
                <td className="c"><Link className="btn sm ghost" href={a.href}>조치</Link></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6}><div className="empty">평시 프로파일 대비 이탈이 없습니다</div></td></tr>}
          </tbody>
        </table>
      </div>
      {items.length > top.length && (
        <div className="dim" style={{ margin: 14, fontSize: 11.5 }}>… 외 {items.length - top.length}건 (심각도 내림차순)</div>
      )}
      <div className="callout" style={{ margin: 14 }}>
        <b>행위 이탈 관점.</b> 취약점 우선순위(노출도)와 달리, 자산별 평시 프로파일(설치 SW·상태·외부 통신·데이터 반출 패턴) 대비
        이탈을 모읍니다 — 미인가 SW 설치, 유휴(휴면) 자산의 갑작스런 사용, 서버의 비정상 외부 통신, 이상 데이터 반출. 각 항목은 해당 조치 화면
        (발견 자산·재물조사·분석 제안)으로 연결되며, 판정·조치는 기존 폐쇄 루프를 따릅니다.
      </div>
    </Card>
  )
}
