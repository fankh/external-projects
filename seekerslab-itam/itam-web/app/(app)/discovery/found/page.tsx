import { Card, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { canExport } from '@/lib/exports'
import { daysUntil } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { CHANNELS, RECONCILE_STATES, type ReconcileState } from '@/lib/types'
import { AccountTable } from './AccountTable'
import { CloudTable } from './CloudTable'
import { EscalateBar } from './EscalateBar'
import { FoundView } from './FoundView'
import { LocalVmTable } from './LocalVmTable'
import { SwAllowlistPanel } from './SwAllowlistPanel'
import { UnauthorizedSwTable } from './UnauthorizedSwTable'
import { UsbTable } from './UsbTable'

export const dynamic = 'force-dynamic'

export default async function FoundPage({ searchParams }: { searchParams: Promise<{ state?: string; sel?: string }> }) {
  const session = await requireRole('ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const { state, sel } = await searchParams
  // CMDB 대사 화면에서 상태별 드릴다운(?state=)으로 진입 — 유효한 대사 상태만 초기 필터로 반영
  const initialState = RECONCILE_STATES.includes(state as ReconcileState) ? (state as ReconcileState) : undefined
  const s = getStore()
  const d = s.discovered
  // 전역 검색·딥링크(?sel=DSC-…)로 특정 발견 자산 상세를 바로 연다(대장·계약·게시판 딥링크와 동형)
  const initialSel = sel && d.some((x) => x.id === sel) ? sel : undefined
  const unreg = d.filter((x) => x.state === '미등록' && !x.action)

  // 지문이 다른데 호스트명·IP 가 겹치는 쌍 = 자동 병합이 잡지 못한 중복 후보.
  // 자동 병합은 지문 일치에만 적용되므로(MAC 교체·클라우드 리소스 등) 담당자 확인이 필요하다.
  const mergeCandidates: { primary: typeof d[number]; duplicate: typeof d[number]; reason: string }[] = []
  for (let i = 0; i < d.length; i += 1) {
    for (let j = i + 1; j < d.length; j += 1) {
      const a = d[i]
      const b = d[j]
      if (a.fingerprint && b.fingerprint && a.fingerprint === b.fingerprint) continue
      if (a.action || b.action) continue
      const sameHost = a.hostname !== '-' && a.hostname.toLowerCase() === b.hostname.toLowerCase()
      const sameIp = a.ip !== '-' && a.ip === b.ip
      if (!sameHost && !sameIp) continue
      // 관측이 더 많은 쪽을 대표로 삼는다 — 근거가 많은 건에 합치는 편이 이력 손실이 적다
      const cnt = (x: string) => s.observations.filter((o) => o.discoveredId === x).length
      const [primary, duplicate] = cnt(a.id) >= cnt(b.id) ? [a, b] : [b, a]
      mergeCandidates.push({
        primary,
        duplicate,
        reason: sameHost
          ? `호스트명 동일(${a.hostname}) · MAC 상이 — NIC 교체 또는 별도 장비`
          : `IP 동일(${a.ip}) · 지문 상이 — DHCP 재할당 가능성`,
      })
    }
  }

  const awaiting = d.filter((x) => x.action === '확인요청')
  const overdue = awaiting.filter(
    (x) => x.confirmRequestedAt && -(daysUntil(x.confirmRequestedAt) ?? 0) >= s.opsPolicy.confirmDeadlineDays,
  )
  // 휴면 계정(채널 06 AD/IdP·SSO) · 미인가 SW(채널 04 EDR) — 계정·SW 위생은 보안 업무이므로 보안담당·Admin 만 조치, 자산담당은 조회만
  const canAccount = ['SEC_MGR', 'ADMIN'].includes(session.role)
  const accountsOpen = s.accounts.filter((a) => !a.action).length
  const unauthSwOpen = s.unauthorizedSw.filter((w) => !w.action).length
  const usbOpen = s.usbFindings.filter((u) => !u.action).length
  const vmOpen = s.localVms.filter((v) => !v.action).length
  const cloudOpen = s.cloudFindings.filter((c) => !c.action).length

  return (
    <>
      <ScreenHeader
        kicker="Discovery · 6 Channels"
        title="발견 자산"
        desc="신규 발견 목록(채널별) · 자산 지문·중복 병합 · 위험도 분류"
      />

      <div className="stat-row">
        <Stat
          value={d.length}
          label={`발견 자산 (지문 병합 후) — 원시 관측 ${s.observations.length}건`}
          delta={{ text: `중복 ${Math.max(0, s.observations.length - d.length)}건 제거`, dir: 'down' }}
        />
        <Stat value={unreg.length} label="미등록 — 처리 필요" tone="err" />
        <Stat value={d.filter((x) => x.state === '등록·불일치').length} label="등록 · 불일치" tone="warn" />
        <Stat value={CHANNELS.length} label="병렬 수집 채널" tone="accent" delta={{ text: '스캔·로그·API 상시 수집', dir: 'flat' }} />
        {/* 엔드포인트·계정·클라우드 위생 5종(휴면계정·미인가SW·USB·로컬VM·클라우드)을 한 지표로 요약 — 상세는 아래 각 섹션. 스탯 로우 과밀 해소 */}
        <Stat
          value={accountsOpen + unauthSwOpen + usbOpen + vmOpen + cloudOpen}
          label="엔드포인트·계정·클라우드 위생 — 미조치"
          tone={accountsOpen + unauthSwOpen + usbOpen + vmOpen + cloudOpen ? 'err' : 'ok'}
          delta={{ text: `휴면계정 ${accountsOpen} · SW ${unauthSwOpen} · USB ${usbOpen} · VM ${vmOpen} · 클라우드 ${cloudOpen}`, dir: 'flat' }}
        />
      </div>

      <div className="callout">
        <b>발견에서 편입까지.</b> 여섯 채널로 수집한 자산은 자산 지문(MAC·호스트명)으로 병합된 뒤 자산 대장과 대사되고,
        소유자 확인·결재를 거친 편입 결과가 다시 대장으로 환류됩니다. 확인되지 않은 자산은 NAC 격리 요청으로 이어집니다.
      </div>

      <EscalateBar waiting={awaiting.length} overdue={overdue.length} deadlineDays={s.opsPolicy.confirmDeadlineDays} />

      <Card pad={false}>
        <FoundView items={d} observations={s.observations} mergeCandidates={mergeCandidates} canExport={canExport('discovered', session.role)} initialState={initialState} initialSel={initialSel} />
      </Card>

      <Card kicker="Account Hygiene · Channel 06" title="휴면 계정 — AD/IdP·SSO 계정 위생" pad={false}>
        <AccountTable accounts={s.accounts} canAct={canAccount} />
      </Card>

      <Card kicker="Unauthorized Software · Channel 04 (EDR)" title="미인가 SW — 설치 SW 정책 위반" pad={false}>
        <UnauthorizedSwTable items={s.unauthorizedSw} canAct={canAccount} />
      </Card>

      <Card kicker="SW Policy · Allowlist" title={`SW 예외 승인 목록 (화이트리스트) — ${s.swAllowlist.length}종`} pad={false}>
        <SwAllowlistPanel entries={s.swAllowlist} canManage={canAccount} />
      </Card>

      <Card kicker="Removable Media · Channel 04 (EDR)" title="USB 저장매체 — 이동식 매체 정책 위반(DLP)" pad={false}>
        <UsbTable items={s.usbFindings} canAct={canAccount} />
      </Card>

      <Card kicker="Local VM · Channel 04 (EDR)" title="로컬 가상머신 — 엔드포인트 VM 정책 위반" pad={false}>
        <LocalVmTable items={s.localVms} canAct={canAccount} />
      </Card>

      <Card kicker="Cloud Governance · Channel 05 (CSP API)" title="미관리 클라우드 리소스 — 태그·소유·통제 위반" pad={false}>
        <CloudTable items={s.cloudFindings} canAct={canAccount} />
      </Card>
    </>
  )
}
