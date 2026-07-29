import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import type { AssetCategory } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** 보유 현황 집계 대상 유형 — 실제 보유 자산이 있는 유형만 표시하되(아래 filter), 공통코드의
 *  미사용 여부로 걸러내지는 않는다. 걸러내면 합계가 총 보유 수와 어긋나 대장이 틀려 보인다. */
const CATS: AssetCategory[] = ['단말', '서버', '네트워크', '주변기기', 'SW', '가상자원']

export default async function StockPage() {
  await requireRole('ASSET_MGR', 'ADMIN')
  const s = getStore()
  const byCat = CATS.map((c) => {
    const list = s.assets.filter((a) => a.category === c)
    return {
      cat: c,
      total: list.length,
      inUse: list.filter((a) => a.status === '사용중').length,
      idle: list.filter((a) => a.status === '유휴' || a.status === '반납대기').length,
      etc: list.filter((a) => !['사용중', '유휴', '반납대기'].includes(a.status)).length,
    }
  }).filter((r) => r.total > 0)

  const idleTotal = s.assets.filter((a) => a.status === '유휴').length

  return (
    <>
      <ScreenHeader
        kicker="재고 · 계약 — Inventory"
        title="재고 · 재물조사"
        desc="유형·부서·위치별 보유 현황과 유휴/가용 재고 · 재물조사 계획·수행(바코드/QR)·차이 조정"
      />

      <div className="stat-row">
        <Stat value={s.assets.length} label="총 보유 자산" />
        <Stat value={idleTotal} label="유휴 · 가용 재고" tone="ok" delta={{ text: '재배치 우선 원칙', dir: 'flat' }} />
        <Stat value={s.inventoryRounds.filter((r) => r.status !== '완료').length} label="진행·계획 중 재물조사" tone="accent" />
        <Stat value={s.inventoryRounds.reduce((n, r) => n + r.mismatched, 0)} label="누적 차이 항목" tone="warn" delta={{ text: '차이 조정 결재 연계', dir: 'flat' }} />
      </div>

      <div className="cols c2">
        <Card kicker="Stock" title="유형별 보유 현황" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>유형</th><th className="num">보유</th><th className="num">사용중</th><th className="num">유휴·반납</th><th className="num">기타</th></tr>
              </thead>
              <tbody>
                {byCat.map((r) => (
                  <tr key={r.cat}>
                    <td className="strong">{r.cat}</td>
                    <td className="num">{r.total}</td>
                    <td className="num">{r.inUse}</td>
                    <td className="num">{r.idle}</td>
                    <td className="num mute">{r.etc}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>합계</td>
                  <td className="num">{s.assets.length}</td>
                  <td className="num">{byCat.reduce((n, r) => n + r.inUse, 0)}</td>
                  <td className="num">{byCat.reduce((n, r) => n + r.idle, 0)}</td>
                  <td className="num">{byCat.reduce((n, r) => n + r.etc, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <Card kicker="Physical Inventory" title="재물조사 계획 · 수행" pad={false}
          actions={<button className="btn sm pri">조사 계획 등록</button>}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>회차</th><th>범위</th><th className="num">진행</th><th className="num">차이</th><th>기한</th><th className="c">상태</th></tr>
              </thead>
              <tbody>
                {s.inventoryRounds.map((r) => (
                  <tr key={r.id}>
                    <td className="strong">{r.name}</td>
                    <td className="mute">{r.scope}</td>
                    <td className="num tnum">{r.scanned.toLocaleString()}/{r.planned.toLocaleString()}</td>
                    <td className="num tnum">{r.mismatched}</td>
                    <td className="tnum">{r.dueDate}</td>
                    <td className="c">
                      <Chip tone={r.status === '완료' ? 'ok' : r.status === '진행중' ? 'info' : 'neutral'}>{r.status}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="callout" style={{ margin: 14 }}>
            <b>모바일 실사.</b> 바코드/QR 스캔 실사와 모바일 웹을 지원합니다. 대장 대비 과부족 확인 → 조정 결재 → 반영 순으로
            차이를 처리하며, 미확인(유령) 자산은 재물조사 대상으로 자동 편성됩니다.
          </div>
        </Card>
      </div>
    </>
  )
}
