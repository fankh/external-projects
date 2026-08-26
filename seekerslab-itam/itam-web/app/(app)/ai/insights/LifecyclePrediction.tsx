import Link from 'next/link'
import { Card, Chip, Stat } from '@/components/ui'
import { ACQ_COST } from '@/lib/cost'
import { fmtAmount } from '@/lib/dates'
import { replacementCandidates } from '@/lib/reports'
import { replacementNoticeTargets } from '@/lib/reminders'
import { ReplacementNotifyButton } from './ReplacementNotifyButton'

// 교체 사유 태그별 톤 — 잦은 장애는 장애 이력 드라이버라 경고, 나머지는 노후·보증 경과.
const REASON_TONE: Record<string, 'err' | 'warn' | 'neutral'> = {
  '잦은 장애': 'err',
  '내용연수 초과': 'warn',
  '보증 경과': 'neutral',
}
function reasonTags(why: string): { label: string; tone: 'err' | 'warn' | 'neutral' }[] {
  return why.split(' · ').map((r) => {
    const key = r.startsWith('잦은 장애') ? '잦은 장애' : r
    return { label: r, tone: REASON_TONE[key] ?? 'neutral' }
  })
}

/** 교체수요·수명 예측 — 내용연수·보증 경과·장애 이력 기반 교체 대상·예산 추정(§05 AI 기능 03). 읽기 전용 합성 뷰.
 *  근거 산정은 연간 교체 계획 리포트와 동일한 replacementCandidates()를 재사용해 화면·리포트가 어긋나지 않게 한다. */
export function LifecyclePrediction({ canNotify }: { canNotify?: boolean }) {
  const { cands, budget, residualBook } = replacementCandidates()
  // 통보 버튼 건수 — 표의 교체 대상 수(전량)와 달리 '오늘 아직 안 보낸' 발송 대상 수다(lib/reminders · 액션과 같은 소스).
  const noticeN = replacementNoticeTargets().length
  // 사유별 분해 — 한 대가 복수 사유를 가질 수 있어 합계는 대수와 일치하지 않는다.
  const agedN = cands.filter((x) => x.why.includes('내용연수')).length
  const warrN = cands.filter((x) => x.why.includes('보증 경과')).length
  const failingN = cands.filter((x) => x.why.includes('잦은 장애')).length
  // 예산 큰 순 → 잔존 장부가 큰 순으로 정렬해 회계상 폐기손실이 큰 자산을 위에 노출한다.
  const rows = [...cands].sort((a, b) => (ACQ_COST[b.a.category] ?? 0) - (ACQ_COST[a.a.category] ?? 0) || b.book - a.book)
  const top = rows.slice(0, 12)

  return (
    <Card
      kicker="AI Function 03 · Lifecycle Prediction"
      title="교체수요·수명 예측 — 교체 대상·예산 추정"
      pad={false}
      actions={
        <span className="hstack" style={{ gap: 10, alignItems: 'center' }}>
          <span className="dim" style={{ fontSize: 11.5 }}>내용연수·보증·장애 이력 · 총 {cands.length}대</span>
          {canNotify && cands.length > 0 && <ReplacementNotifyButton n={noticeN} />}
        </span>
      }
    >
      <div className="stat-row" style={{ margin: 14 }}>
        <Stat value={cands.length} label="교체 대상" tone={cands.length ? 'accent' : 'ok'} />
        <Stat value={`${fmtAmount(budget)}원`} label="추정 교체 예산" delta={{ text: '유형별 표준 단가 기준', dir: 'flat' }} />
        <Stat value={failingN} label="잦은 장애 — 교체 앞당김" tone={failingN ? 'warn' : undefined} />
        <Stat value={`${fmtAmount(residualBook)}원`} label="잔여 장부가 — 폐기손실" />
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="c">순위</th><th>자산번호</th><th>모델</th><th>유형</th><th>취득일</th>
              <th>교체 사유</th><th className="num">교체 단가</th><th className="num">잔존 장부가</th>
            </tr>
          </thead>
          <tbody>
            {top.map((x, i) => (
              <tr key={x.a.assetNo}>
                <td className="c tnum">{i + 1}</td>
                <td className="code">{x.a.assetNo}</td>
                <td className="strong">{x.a.model}</td>
                <td className="mute">{x.a.category}</td>
                <td className="tnum">{x.a.purchaseDate}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 320 }}>
                  {reasonTags(x.why).map((r) => <Chip key={r.label} tone={r.tone}>{r.label}</Chip>)}
                </td>
                <td className="num tnum">{fmtAmount(ACQ_COST[x.a.category] ?? 0)}</td>
                <td className="num tnum">{fmtAmount(x.book)}</td>
              </tr>
            ))}
            {cands.length === 0 && <tr><td colSpan={8}><div className="empty">교체 대상 자산이 없습니다</div></td></tr>}
          </tbody>
        </table>
      </div>
      {cands.length > top.length && (
        // 잘림 안내에 넘어가는 길을 함께 둔다 — 아래 설명문에 대장 링크가 있긴 했지만, 잘린 사실을 본 자리에서
        //  바로 갈 수 있어야 한다(다른 분석 패널과 같은 규약).
        <div className="dim" style={{ margin: 14, fontSize: 11.5 }}>
          … 외 {cands.length - top.length}대 (교체 단가·잔존가 내림차순) — <Link href="/assets/register?replace=1">자산 대장에서 전체 보기</Link>
        </div>
      )}
      <div className="callout" style={{ margin: 14 }}>
        <b>내용연수 × 보증 × 장애 이력.</b> 도입 5년 초과·보증 경과·반복 수리(2회 이상) 신호를 결합해 교체 시점이 도래한 하드웨어를
        추립니다. 교체 예산은 유형별 표준 단가로, 잔존 장부가는 회계상 폐기손실 규모로 추정합니다.
        승인 시 <Link href="/ai/reports">연간 교체 계획 리포트</Link>가 같은 근거로 생성되며,
        <Link href="/assets/register?replace=1"> 자산 대장에서 교체 대상 전체를 조회·반출</Link>할 수 있습니다(조달 계획).
      </div>
    </Card>
  )
}
