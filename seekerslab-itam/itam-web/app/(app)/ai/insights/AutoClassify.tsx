import Link from 'next/link'
import { Card, Chip, RiskChip, Stat } from '@/components/ui'
import { buildAutoClassify } from '@/lib/auto-classify'

/** 자동분류 제안(§05 AI 기능 01) — 발견 자산의 관측 유형을 표준 유형으로 매핑, 신뢰도·근거와 함께 제시.
 *  읽기 전용 합성 뷰. 편입(대장 반영)은 발견 자산 화면으로 연결한다. */
export function AutoClassify() {
  const { rows, total, high, low, avgConfidence, byCategory } = buildAutoClassify()
  const top = rows.slice(0, 12)

  return (
    <Card
      kicker="AI Function 01 · Auto-Classification"
      title="자동분류 제안 — 관측 유형 → 표준 자산 유형"
      pad={false}
      actions={<span className="dim" style={{ fontSize: 11.5 }}>LLM 분류 · 규칙 하이브리드 · {top.length} / {total}건</span>}
    >
      <div className="stat-row" style={{ margin: 14 }}>
        <Stat value={total} label="분류 대상 (미등록·미확인)" tone={total ? 'accent' : 'ok'} />
        <Stat value={high} label="고신뢰 (≥90%)" tone="ok" />
        <Stat value={low} label="확인 권장 (<90%)" tone={low ? 'warn' : 'ok'} />
        <Stat value={total ? `${avgConfidence}%` : '-'} label="평균 신뢰도" delta={{ text: byCategory.map((c) => `${c.category} ${c.n}`).join(' · ') || '대상 없음', dir: 'flat' }} />
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>호스트</th><th>채널</th><th>관측 유형</th><th className="c">표준 유형</th>
              <th>모델 힌트</th><th className="num">신뢰도</th><th>근거</th><th className="c">위험도</th><th className="c">편입</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.id}>
                <td className="strong">{r.hostname}</td>
                <td className="mute">{r.channel}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 220 }}>{r.rawType}</td>
                <td className="c"><Chip tone={r.confidence >= 0.9 ? 'ok' : 'warn'}>{r.category}</Chip></td>
                <td className="mute">{r.model}</td>
                <td className="num tnum" style={{ fontWeight: 700 }}>{Math.round(r.confidence * 100)}%</td>
                <td className="dim" style={{ whiteSpace: 'normal', maxWidth: 200, fontSize: 11.5 }}>{r.basis}</td>
                <td className="c"><RiskChip risk={r.risk} /></td>
                <td className="c"><Link className="btn sm ghost" href={`/discovery/found?sel=${encodeURIComponent(r.id)}`}>편입</Link></td>
              </tr>
            ))}
            {total === 0 && <tr><td colSpan={9}><div className="empty">자동분류 대상(미등록·미확인) 발견 자산이 없습니다</div></td></tr>}
          </tbody>
        </table>
      </div>
      {total > top.length && (
        // 잘린 건을 볼 길을 함께 준다 — 이 표의 모집단은 발견 자산의 미등록·미확인 건이므로 그 화면이 전체 목록이다.
        //  그전엔 남은 건수만 적고 넘어갈 경로가 없어, 13번째부터의 분류 제안은 화면 어디에서도 볼 수 없었다.
        <div className="dim" style={{ margin: 14, fontSize: 11.5 }}>
          … 외 {total - top.length}건 (신뢰도 내림차순) — <Link href={`/discovery/found?state=${encodeURIComponent('미등록')}`}>발견 자산에서 전체 보기</Link>
        </div>
      )}
      <div className="callout" style={{ margin: 14 }}>
        <b>수기 분류 제거.</b> 스캔 배너·설치 SW·모델명 문자열을 규칙 하이브리드로 표준 자산 유형에 매핑하고,
        신뢰도와 판단 근거를 함께 제시합니다. 고신뢰 건은 바로 편입, 저신뢰 건은 담당자 확인 후 편입하도록
        발견 자산 화면으로 연결됩니다. 편입 시 이 표준 유형이 대장 분류로 반영됩니다.
      </div>
    </Card>
  )
}
