import Link from 'next/link'
import { Card, Chip, ScreenHeader } from '@/components/ui'
import { requireView } from '@/lib/authz'
import { getStore } from '@/lib/store'
import type { Asset, AssetStatus } from '@/lib/types'

/** 상태별 다음 처리 안내 + 처리 화면 딥링크 — 수명주기 대기열이 표시로 끝나지 않고 실제 처리 화면으로 라우팅한다.
 *  (그동안 대여중·수리중·분실은 '다음 처리 -'로 막다른 행이었고, 폐기완료는 종결 자산인데도 대기열에 남았다.) */
function nextStep(a: Asset): { next: string; href: string } {
  switch (a.status) {
    case '검수중': return { next: '검수 체크리스트 완료 → 자산번호 채번 · 라벨(QR) 발행', href: '/assets/intake' }
    case '유휴': return { next: '재배치 우선 원칙 — 가용 재고 편성', href: '/assets/movement' }
    case '반납대기': return { next: '반납 접수 · 상태 점검 (결재 진행 중)', href: '/assets/returns' }
    case '폐기예정': return { next: '폐기 결재 상신 → 데이터 소거 · 증적 보존', href: '/assets/disposal' }
    case '수리중': return { next: '수리 진행 관리 — 완료(정상/파손) 판정', href: `/assets/register?sel=${a.assetNo}` }
    case '대여중': return { next: '반환 기한 관리 · 연체 독촉', href: '/assets/returns' }
    case '분실': return { next: '회수(실물 확보) 또는 미회수 확정 → 폐기', href: `/assets/register?sel=${a.assetNo}` }
    default: return { next: '-', href: '' }
  }
}

export const dynamic = 'force-dynamic'

/** 수명주기 5단계 — 도입·검수 → 등록 → 운영·이동 → 반납·유휴 → 폐기 (제품안내서 §03).
 *  단계는 그림이 아니라 대기열의 필터다: 누르면 그 단계에 걸린 행만 남는다.
 *
 *  대기열에 오는 상태는 하나도 빠짐없이 어느 단계엔가 속해야 한다. 그전엔 수리중·분실이 어느 단계에도 없어,
 *  전체 대기열에는 보이는데 단계를 다 눌러 봐도 나오지 않았다(시드 기준 전체 13 · 단계 합 10). 예외 경로라도
 *  갈 곳은 있다 — 수리는 운영 중 자산의 장애 대응이고(nextStep 도 대장 상세로 보낸다), 분실은 회수 실패 시
 *  폐기로 이어지는 폐기 경로의 입구다. 폐기완료는 종결이라 대기열 자체에 오지 않으므로 단계 목록에서도 뺀다
 *  (매치될 수 없는 죽은 설정이었다). 이 불변식은 스모크가 '전체 = 단계 합'으로 고정한다. */
const PHASES: { id: string; no: string; title: string; sub: string; statuses: AssetStatus[] }[] = [
  { id: 'intake', no: '1', title: '도입 · 검수', sub: '발주 연계 · 검수 등록', statuses: ['검수중'] },
  { id: 'register', no: '2', title: '등록', sub: '자산번호 · 구성정보', statuses: [] },
  { id: 'operate', no: '3', title: '운영 · 이동', sub: '불출 · 대여 · 소유자 · 위치 이력 · 장애(수리)', statuses: ['사용중', '대여중', '수리중'] },
  { id: 'return', no: '4', title: '반납 · 유휴', sub: '재배치 대기', statuses: ['유휴', '반납대기'] },
  { id: 'dispose', no: '5', title: '폐기', sub: '결재 · 데이터 소거 증적 · 분실 미회수 확정', statuses: ['폐기예정', '분실'] },
]

export default async function LifecyclePage({ searchParams }: { searchParams: Promise<{ phase?: string }> }) {
  await requireView('/assets/lifecycle', 'ASSET_MGR', 'ADMIN')
  const { phase } = await searchParams
  const s = getStore()
  // 처리 대기열 — 운영 중(사용중)·종결(폐기완료)은 대기열이 아니다. 그 외 상태만 '처리할 일'로 남긴다.
  const all = s.assets.filter((a) => a.status !== '사용중' && a.status !== '폐기완료')
  const sel = PHASES.find((p) => p.id === phase && p.statuses.length > 0)
  const queue = sel ? all.filter((a) => sel.statuses.includes(a.status)) : all
  // 건수는 대기열 기준으로 센다. 자산 전체로 세면 눌렀을 때 나오는 행 수와 어긋난다
  // (운영·이동의 '사용중'은 대기열에 오지 않으므로 21건이라 적고 2건을 보여주게 된다).
  const count = (statuses: AssetStatus[]) => all.filter((a) => statuses.includes(a.status)).length

  return (
    <>
      <ScreenHeader
        kicker="자산관리 · Lifecycle"
        title="수명주기 관리"
        desc="도입(검수·등록) · 불출/이동 · 반납 · 유휴 · 폐기(결재·증적) 처리"
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="seg">
          <Link href="/assets/lifecycle" className={sel ? '' : 'on'}>전체 <span className="n">{all.length}</span></Link>
          {PHASES.map((p) =>
            p.statuses.length === 0 ? (
              <span key={p.id} className="off" title={p.sub}><span className="step-no">{p.no}</span> {p.title}</span>
            ) : (
              <Link key={p.id} href={`/assets/lifecycle?phase=${p.id}`} className={sel?.id === p.id ? 'on' : ''} title={p.sub}>
                <span className="step-no">{p.no}</span> {p.title} <span className="n">{count(p.statuses)}</span>
              </Link>
            ),
          )}
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--dim)' }}>{sel ? sel.sub : '단계를 누르면 해당 단계의 처리 건만 봅니다'}</span>
      </div>

      <div className="callout">
        <b>변경 이력 관리.</b> 소유자·위치·구성 변경은 신청·결재로만 반영되며, Discovery 대사 시 기준 데이터로 씁니다.
        폐기는 결재 상신 → 데이터 소거·불용 처리 → 증적(사진·확인서) 보존 순으로 진행됩니다.
      </div>

      <Card kicker="Work Queue" title="수명주기 처리 대기열" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>자산번호</th><th>유형</th><th>모델</th><th className="c">상태</th><th>위치</th><th>다음 처리</th></tr>
            </thead>
            <tbody>
              {queue.map((a) => {
                const { next, href } = nextStep(a)
                const tone = a.status === '검수중' ? 'info' : a.status === '폐기예정' || a.status === '분실' ? 'err' : a.status === '반납대기' || a.status === '수리중' ? 'warn' : 'neutral'
                return (
                  <tr key={a.assetNo}>
                    <td className="code">{a.assetNo}</td>
                    <td>{a.category}</td>
                    <td className="strong">{a.model}</td>
                    <td className="c"><Chip tone={tone as 'info'}>{a.status}</Chip></td>
                    <td className="mute">{a.location}</td>
                    <td>{href ? <Link href={href} style={{ color: 'var(--accent-deep)', textDecoration: 'none' }} title="처리 화면으로 이동">{next} →</Link> : next}</td>
                  </tr>
                )
              })}
              {queue.length === 0 && <tr><td colSpan={6}><div className="empty">처리 대기 중인 자산이 없습니다</div></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
