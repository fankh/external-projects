import Link from 'next/link'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { acquisitionCostOf, bookValueOf } from '@/lib/cost'
import { today } from '@/lib/dates'
import { canExport } from '@/lib/exports'
import { getStore } from '@/lib/store'
import { ASSET_CATEGORIES, type Asset } from '@/lib/types'
import { StockBreakdown, type StockRow } from './StockBreakdown'

export const dynamic = 'force-dynamic'

export default async function StockPage() {
  const session = await requireRole('ASSET_MGR', 'ADMIN')
  const s = getStore()
  // 유형·부서·위치별 보유 현황 (제품안내서 §03). 세 기준 모두 같은 집계 함수로 산출한다.
  // 유형은 미사용 공통코드로 걸러내지 않는다 — 걸러내면 합계가 총 보유 수와 어긋나 대장이 틀려 보인다.
  const aggBy = (key: (a: Asset) => string): StockRow[] => {
    const m = new Map<string, StockRow>()
    for (const a of s.assets) {
      const k = key(a) || '-'
      const cur = m.get(k) ?? { key: k, total: 0, inUse: 0, idle: 0, etc: 0 }
      cur.total += 1
      if (a.status === '사용중') cur.inUse += 1
      else if (a.status === '유휴' || a.status === '반납대기') cur.idle += 1
      else cur.etc += 1
      m.set(k, cur)
    }
    return [...m.values()].sort((x, y) => y.total - x.total)
  }
  const byCat = aggBy((a) => a.category)
  const byDept = aggBy((a) => a.dept)
  const byLoc = aggBy((a) => a.location)

  const idleTotal = s.assets.filter((a) => a.status === '유휴').length

  // 유형별 자산 가치 — 운영 자산(폐기완료 제외)의 취득가·잔존가치(정액법 감가상각). 대수 집계의 가치 측면.
  const t = today()
  const valued = s.assets.filter((a) => a.status !== '폐기완료' && acquisitionCostOf(a) > 0)
  const valueByCat = ASSET_CATEGORIES
    .map((cat) => {
      const list = valued.filter((a) => a.category === cat)
      const acq = list.reduce((n, a) => n + acquisitionCostOf(a), 0)
      const book = list.reduce((n, a) => n + bookValueOf(a, t), 0)
      return { cat, count: list.length, acq, book, dep: acq > 0 ? Math.round((1 - book / acq) * 100) : 0 }
    })
    .filter((x) => x.count > 0)
  const totalAcq = valueByCat.reduce((n, x) => n + x.acq, 0)
  const totalBook = valueByCat.reduce((n, x) => n + x.book, 0)
  const fmt = (v: number) => v.toLocaleString()

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
        <Stat value={`${fmt(Math.round(totalBook / 10_000))}만`} label="자산 잔존가치 (장부가 총액)" tone="accent" delta={{ text: `취득가 ${fmt(Math.round(totalAcq / 10_000))}만원 기준`, dir: 'flat' }} />
        <Stat value={s.inventoryRounds.filter((r) => r.status !== '완료').length} label="진행·계획 중 재물조사" tone="accent" />
      </div>

      <Card kicker="Asset Value" title="유형별 자산 가치 (취득가 · 잔존가치)" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>유형</th><th className="num">대수</th><th className="num">총 취득가</th><th className="num">총 잔존가치(장부가)</th><th className="num">감가상각률</th></tr>
            </thead>
            <tbody>
              {valueByCat.map((x) => (
                <tr key={x.cat}>
                  <td className="strong">{x.cat}</td>
                  <td className="num tnum">{x.count}</td>
                  <td className="num tnum">{fmt(x.acq)}원</td>
                  <td className="num tnum">{fmt(x.book)}원</td>
                  <td className="num tnum">{x.dep}%</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--line)', fontWeight: 700 }}>
                <td>합계</td>
                <td className="num tnum">{valueByCat.reduce((n, x) => n + x.count, 0)}</td>
                <td className="num tnum">{fmt(totalAcq)}원</td>
                <td className="num tnum">{fmt(totalBook)}원</td>
                <td className="num tnum">{totalAcq > 0 ? Math.round((1 - totalBook / totalAcq) * 100) : 0}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="callout" style={{ margin: 14 }}>
          <b>정액법 감가상각.</b> 내용연수 5년 기준 잔존가치(장부가)이며, 취득가 미입력 자산은 유형 표준 단가를 적용합니다.
          SW·가상자원(구독·사용량 과금)은 자산 단위 취득가가 없어 제외됩니다.
        </div>
      </Card>

      <div className="cols c2">
        <StockBreakdown byCat={byCat} byDept={byDept} byLoc={byLoc} total={s.assets.length} canExportStock={canExport('stock', session.role)} />

        <Card kicker="Physical Inventory" title="재물조사 계획 · 수행" pad={false}
          actions={<Link className="btn sm pri" href="/inventory/survey-plan">조사 계획 등록</Link>}>
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
