import Link from 'next/link'
import { Card, Chip, ScreenHeader } from '@/components/ui'
import { requireView } from '@/lib/authz'
import { getStore } from '@/lib/store'
import type { ReconcileState } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** CMDB 대사 결과 4상태와 상태별 후속 처리 (제품안내서 §04) */
const OUTCOMES: { state: ReconcileState; meaning: string; handle: string; tone: 'ok' | 'warn' | 'err' | 'neutral' }[] = [
  { state: '등록·일치', meaning: '대장에 있고 실측 정보 일치', handle: '최종 확인 일시 갱신 (생존 신호)', tone: 'ok' },
  { state: '등록·불일치', meaning: '대장에 있으나 위치·소유자·구성 상이', handle: '차이 항목 표시 → 자산담당 확인 · 대장 보정', tone: 'warn' },
  { state: '미등록', meaning: '실측되나 대장에 없음 (Shadow IT)', handle: '소유자 확인 요청 → 편입(결재) 또는 격리 요청', tone: 'err' },
  { state: '미확인', meaning: '대장에 있으나 일정 기간 실측 없음 (유령 자산)', handle: '유휴·분실 후보 → 재물조사 대상 자동 편성', tone: 'neutral' },
]

export default async function ReconcilePage() {
  const session = await requireView('/discovery/reconcile', 'ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const s = getStore()
  const count = (st: ReconcileState) => s.discovered.filter((d) => d.state === st).length
  // 재물조사 계획은 자산담당 화면이므로, 보안담당에게는 링크를 노출하지 않는다 (권한 밖 이동 방지)
  const canPlan = session.role === 'ASSET_MGR' || session.role === 'ADMIN'

  return (
    <>
      <ScreenHeader
        kicker="Discovery · Reconciliation"
        title="CMDB 대사"
        desc="발견 → 편입 폐쇄 루프 — 정규화·병합 → CMDB 대사 → 분류·위험도 → 소유자 확인 → 편입/격리"
      />

      <div className="pipe">
        {['정규화 · 병합', 'CMDB 대사', '분류 · 위험도', '소유자 확인', '편입 / 격리'].map((t, i) => (
          <div key={t} style={{ display: 'contents' }}>
            {i > 0 && <span className="arrow">→</span>}
            <div className={`step ${i === 1 || i === 4 ? 'on' : ''}`}>
              <div className="k">STEP {i + 1}</div>
              <div className="t">{t}</div>
              <div className="s">
                {['자산 지문 MAC·호스트명', '등록 / 미등록 / 불일치', '유형·노출 서비스·등급', '부서 확인 요청 메일', '결재 편입 · 격리 요청'][i]}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Card kicker="Reconciliation Outcomes" title="대사 결과별 처리" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>대사 결과</th><th className="num">건수</th><th>의미</th><th>처리</th></tr>
            </thead>
            <tbody>
              {OUTCOMES.map((o) => (
                <tr key={o.state}>
                  <td><Chip tone={o.tone}>{o.state}</Chip></td>
                  <td className="num tnum" style={{ fontWeight: 700 }}>{count(o.state)}</td>
                  <td>{o.meaning}</td>
                  <td className="dim">
                    {o.handle}
                    {o.state === '미등록' && count('미등록') > 0 && (
                      <> <Link className="btn sm ghost" href={`/discovery/found?state=${encodeURIComponent('미등록')}`} title="발견 자산 처리 화면 — 소유자 확인·편입·격리">발견 처리</Link></>
                    )}
                    {o.state === '등록·불일치' && count('등록·불일치') > 0 && (
                      <> <Link className="btn sm ghost" href={`/discovery/found?state=${encodeURIComponent('등록·불일치')}`} title="불일치 발견 자산 목록 — 차이 확인·대장 보정">불일치 확인</Link></>
                    )}
                    {o.state === '미확인' && canPlan && count('미확인') > 0 && (
                      <> <Link className="btn sm ghost" href="/inventory/survey-plan">조사 편성</Link></>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="cols c2">
        <div className="callout">
          <b>미확인 소유자 정책.</b> 확인 요청에 기한 내 응답이 없는 발견 자산은 정책에 따라
          보안담당 검토 → NAC 격리 요청으로 자동 에스컬레이션됩니다.
        </div>
        <div className="callout">
          <b>편입도 결재로.</b> 발견 자산의 대장 편입은 자산 등록 결재를 통과해야 하며, 편입 시
          발견 이력(최초 발견 채널·일시)이 자산 이력에 승계됩니다.
        </div>
      </div>
    </>
  )
}
