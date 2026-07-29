import { Card, Chip, ScreenHeader } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import type { AssetStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** 수명주기 5단계 — 도입·검수 → 등록 → 운영·이동 → 반납·유휴 → 폐기 (제품안내서 §03) */
const PHASES: { key: string; title: string; sub: string; statuses: AssetStatus[] }[] = [
  { key: 'PHASE 1', title: '도입 · 검수', sub: '발주 연계 · 검수 등록', statuses: ['검수중'] },
  { key: 'PHASE 2', title: '등록', sub: '자산번호 · 구성정보', statuses: [] },
  { key: 'PHASE 3', title: '운영 · 이동', sub: '불출 · 소유자 · 위치 이력', statuses: ['사용중'] },
  { key: 'PHASE 4', title: '반납 · 유휴', sub: '재배치 대기', statuses: ['유휴', '반납대기'] },
  { key: 'PHASE 5', title: '폐기', sub: '결재 · 데이터 소거 증적', statuses: ['폐기예정', '폐기완료'] },
]

export default async function LifecyclePage() {
  await requireRole('ASSET_MGR', 'ADMIN')
  const s = getStore()
  const queue = s.assets.filter((a) => a.status !== '사용중')
  const count = (statuses: AssetStatus[]) => s.assets.filter((a) => statuses.includes(a.status)).length

  return (
    <>
      <ScreenHeader
        kicker="자산관리 · Lifecycle"
        title="수명주기 관리"
        desc="도입(검수·등록) · 불출/이동 · 반납 · 유휴 · 폐기(결재·증적) 처리"
      />

      <div className="pipe">
        {PHASES.map((p, i) => (
          <div key={p.key} style={{ display: 'contents' }}>
            {i > 0 && <span className="arrow">→</span>}
            <div className={`step ${p.title === '운영 · 이동' ? 'on' : ''}`}>
              <div className="k">{p.key}</div>
              <div className="t">{p.title}</div>
              <div className="s">{p.sub}</div>
              {p.statuses.length > 0 && <div className="n">{count(p.statuses)}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="callout">
        <b>변경 이력 관리.</b> 소유자·위치·구성의 변경은 신청·결재를 통해 반영되어 대장과 실물의 불일치를 줄이고,
        Discovery 대사 시 기준 데이터로 사용됩니다. 폐기는 결재 상신 → 데이터 소거·불용 처리 → 증적(사진·확인서) 보존 순으로 진행됩니다.
      </div>

      <Card kicker="Work Queue" title="수명주기 처리 대기열" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>자산번호</th><th>유형</th><th>모델</th><th className="c">상태</th><th>위치</th><th>다음 처리</th></tr>
            </thead>
            <tbody>
              {queue.map((a) => {
                const next =
                  a.status === '검수중' ? '검수 체크리스트 완료 → 자산번호 채번 · 라벨(QR) 발행' :
                  a.status === '유휴' ? '재배치 우선 원칙 — 가용 재고 편성' :
                  a.status === '반납대기' ? '반납 접수 · 상태 점검 (결재 진행 중)' :
                  a.status === '폐기예정' ? '폐기 결재 상신 → 데이터 소거 · 증적 보존' : '-'
                const tone = a.status === '검수중' ? 'info' : a.status === '폐기예정' ? 'err' : a.status === '반납대기' ? 'warn' : 'neutral'
                return (
                  <tr key={a.assetNo}>
                    <td className="code">{a.assetNo}</td>
                    <td>{a.category}</td>
                    <td className="strong">{a.model}</td>
                    <td className="c"><Chip tone={tone as 'info'}>{a.status}</Chip></td>
                    <td className="mute">{a.location}</td>
                    <td>{next}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
