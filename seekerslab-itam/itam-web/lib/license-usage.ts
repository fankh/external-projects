/** 라이선스 사용 수집·대사(§03 컴플라이언스 STEP2) — EDR 설치 SW 인벤토리(swInstalls)를 배정 좌석(seats)과
 *  대사해 배정 밖 설치(무단 사용)·미설치 좌석(회수 후보)을 식별한다. 그동안 사용량(used)은 시드 고정값이고
 *  수집 경로가 없었다(4단계 흐름 중 STEP2 표시 전용). 읽기 전용 합성 뷰 — 화면과 대장이 같은 산출을 쓴다. */
import { getStore } from './store'

export interface LicenseUsageRow {
  id: string
  name: string
  vendor: string
  purchased: number
  used: number
  seatCount: number
  installCount: number
  /** 좌석 ∩ 설치 */
  matched: number
  /** 배정 밖 설치 — 설치는 관측됐으나 배정 좌석이 없는 자산(무단 사용) */
  offSeat: { assetNo: string; host: string; user: string; dept: string; status?: string }[]
  /** 미설치 좌석 — 좌석은 배정됐으나 설치가 관측되지 않은 자산(회수 후보) */
  unusedSeat: { assetNo: string; user: string; dept: string }[]
  collectedAt?: string
}

export function buildLicenseUsage(): {
  rows: LicenseUsageRow[]
  totalInstalls: number
  totalOffSeat: number
  totalUnusedSeat: number
  collectedLicenses: number
  lastCollectedAt?: string
} {
  const s = getStore()
  const installs = s.swInstalls ?? []
  const rows: LicenseUsageRow[] = s.licenses
    .filter((l) => l.status !== '해지')
    .map((l) => {
      const seats = l.seats ?? []
      const seatSet = new Set(seats.map((x) => x.assetNo))
      const lInstalls = installs.filter((i) => i.licenseId === l.id)
      const installSet = new Set(lInstalls.map((i) => i.assetNo))
      return {
        id: l.id,
        name: l.name,
        vendor: l.vendor,
        purchased: l.purchased,
        used: l.used,
        seatCount: seats.length,
        installCount: lInstalls.length,
        matched: seats.filter((x) => installSet.has(x.assetNo)).length,
        // 자산 상태를 함께 싣는다 — 종료 상태(분실·폐기완료) 자산에는 좌석을 배정할 수 없어(assignLicenseSeat 가 거부)
        //  화면이 '좌석 배정' 버튼을 내주면 눌러야 거부되는 막다른 길이 된다. 행 자체는 남긴다(설치가 남아 있는 것은 SAM 리스크다).
        offSeat: lInstalls.filter((i) => !seatSet.has(i.assetNo)).map((i) => ({
          assetNo: i.assetNo, host: i.host, user: i.user, dept: i.dept,
          status: s.assets.find((a) => a.assetNo === i.assetNo)?.status,
        })),
        unusedSeat: seats.filter((x) => !installSet.has(x.assetNo)).map((x) => ({ assetNo: x.assetNo, user: x.user, dept: x.dept })),
        collectedAt: l.usageCollectedAt,
      }
    })
    // 좌석 또는 설치 데이터가 있는 라이선스만 대사 대상(전체 나열 방지) — 배정 밖 설치 우선 정렬
    .filter((r) => r.seatCount > 0 || r.installCount > 0)
    .sort((a, b) => b.offSeat.length + b.unusedSeat.length - (a.offSeat.length + a.unusedSeat.length))
  const collected = rows.map((r) => r.collectedAt).filter(Boolean).sort()
  return {
    rows,
    totalInstalls: rows.reduce((n, r) => n + r.installCount, 0),
    totalOffSeat: rows.reduce((n, r) => n + r.offSeat.length, 0),
    totalUnusedSeat: rows.reduce((n, r) => n + r.unusedSeat.length, 0),
    collectedLicenses: rows.filter((r) => r.collectedAt).length,
    lastCollectedAt: collected.length ? collected[collected.length - 1] : undefined,
  }
}
