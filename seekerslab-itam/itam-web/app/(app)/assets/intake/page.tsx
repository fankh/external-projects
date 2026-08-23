import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { isIntakeOverdue, today } from '@/lib/dates'
import { barcodeSvg, qrSvg } from '@/lib/label'
import { getStore } from '@/lib/store'
import { intakeRemindTargets } from '@/lib/reminders'
import { IntakeView } from './IntakeView'

export const dynamic = 'force-dynamic'

export default async function IntakePage() {
  await requireRole('ASSET_MGR', 'ADMIN')
  const s = getStore()
  const lots = s.intakeLots
  // 입고 등록 시 연계할 구매 계약 — 발주 계약에 입고를 묶는다
  const purchaseContracts = s.contracts
    .filter((c) => c.kind === '구매')
    .map((c) => ({ id: c.id, name: c.name, vendor: c.vendor }))

  // 채번된 자산의 라벨(QR·바코드)을 서버에서 SVG로 미리 생성
  const issued = lots.flatMap((l) => l.issued)
  const labels = await Promise.all(
    issued.map(async (no) => {
      const asset = s.assets.find((a) => a.assetNo === no)
      return {
        assetNo: no,
        model: asset?.model ?? '-',
        qr: await qrSvg(no, 88),
        barcode: barcodeSvg(no),
      }
    }),
  )

  return (
    <>
      <ScreenHeader
        kicker="자산관리 · Intake & Inspection"
        title="도입 · 검수"
        desc="발주 연계 입고 등록 · 검수 체크리스트 · 자산번호 채번 · 라벨(바코드/QR) 발행"
      />

      <div className="stat-row">
        <Stat value={lots.filter((l) => l.status === '도입 예정').length} label="도입 예정 (ITSM 발주)" tone={lots.filter(isIntakeOverdue).length ? 'err' : lots.some((l) => l.status === '도입 예정') ? 'accent' : 'ok'} delta={lots.filter(isIntakeOverdue).length ? { text: `입고 지연 ${lots.filter(isIntakeOverdue).length}건 (발주처 독촉)`, dir: 'up' } : undefined} />
        <Stat value={lots.filter((l) => l.status === '입고 대기').length} label="입고 대기 (검수 전)" />
        <Stat value={lots.filter((l) => l.status === '검수 중').length} label="검수 진행" tone="warn" />
        <Stat value={lots.filter((l) => l.status === '검수 완료').length} label="검수 완료 — 채번 가능" tone="ok" />
        <Stat value={issued.length} label="채번·라벨 발행" tone="accent" />
      </div>

      <div className="callout">
        <b>검수 → 채번 → 라벨.</b> 검수 체크리스트를 모두 완료해야 자산번호를 채번할 수 있고, 채번 즉시 대장에
        <b> 검수중</b> 상태로 등록되며 발주 계약이 연계됩니다. 발행된 라벨의 QR·바코드는 재물조사 스캔 실사에서
        그대로 사용됩니다.
      </div>

      <IntakeView lots={lots} labels={labels} contracts={purchaseContracts} today={today()} remindCount={intakeRemindTargets().length} />
    </>
  )
}
