import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireView } from '@/lib/authz'
import { today } from '@/lib/dates'
import { staleComposeTargets, staleVerifyAssets, unconfirmedComposeTargets, unconfirmedGhosts } from '@/lib/survey'
import { getStore } from '@/lib/store'
import { PlanView } from './PlanView'

export const dynamic = 'force-dynamic'

export default async function SurveyPlanPage() {
  await requireView('/inventory/survey-plan', 'ASSET_MGR', 'ADMIN')
  const s = getStore()
  const t = today()

  // 대상 범위 후보는 공통코드 LOCATION 그룹 — 미사용 처리된 코드는 신규 계획에서 제외된다
  const scopes = (s.codeGroups.find((g) => g.id === 'LOCATION')?.values ?? [])
    .filter((v) => v.active)
    .sort((a, b) => a.sort - b.sort)
    .map((v) => v.label)

  const assignees = s.users.filter((u) => u.role === 'ASSET_MGR').map((u) => u.name)

  // 편성 대상 판정은 lib/survey 단일 소스 — 화면·자동 편성 액션·대시보드 큐가 같은 집합을 본다.
  //  각자 적어 두면 '편성해도 줄지 않는 큐'가 된다(대시보드가 실제로 미실측 전량을 세고 있었다).
  const unconfirmed = unconfirmedGhosts().length
  const pendingCompose = unconfirmedComposeTargets().length
  const staleVerify = staleVerifyAssets().length
  const pendingStaleCompose = staleComposeTargets().length

  const rounds = s.inventoryRounds
  const active = rounds.filter((r) => r.status === '진행중')
  const planned = rounds.filter((r) => r.status === '계획')
  const overdue = rounds.filter((r) => r.status !== '완료' && r.dueDate < t)
  // 완료 회차 이력 — 지난 재물조사의 실적(대상·실사·차이)을 남겨 감사 추적에 쓴다. 그동안 완료 회차는 조사 화면·계획 화면 어디에도 안 보였다.
  const completed = rounds.filter((r) => r.status === '완료').sort((a, b) => b.dueDate.localeCompare(a.dueDate))

  return (
    <>
      <ScreenHeader
        kicker="재고 · 계약 — Inventory Planning"
        title="재물조사 계획"
        desc="연간 / 수시 조사 계획 · 대상 범위와 담당자 지정 · 대사 미확인 자산 자동 편성"
      />

      <div className="stat-row">
        <Stat value={active.length} label="진행 중 회차" tone={active.length ? 'accent' : undefined} />
        <Stat value={planned.length} label="계획 수립 완료 — 개시 대기" />
        <Stat value={overdue.length} label="기한 경과" tone={overdue.length ? 'err' : 'ok'} />
        <Stat
          value={pendingCompose}
          label={`대사 미확인 편성 대기 — 전체 ${unconfirmed}건`}
          tone={pendingCompose ? 'warn' : 'ok'}
          delta={{ text: '유휴·분실 후보', dir: 'flat' }}
        />
        <Stat
          value={pendingStaleCompose}
          label={`장기 미실측 편성 대기 — 전체 ${staleVerify}건`}
          tone={pendingStaleCompose ? 'warn' : 'ok'}
          delta={{ text: '실사 기반 유령 후보', dir: 'flat' }}
        />
      </div>

      <PlanView
        // 오늘 이미 독촉을 보낸 회차 — 서버가 당일 중복을 거절하므로 화면도 같은 판정을 보여 준다(눌러야 막히는 버튼 방지).
        remindedToday={s.dispatches.filter((m) => m.kind === '재물조사 독촉' && m.at.startsWith(t)).map((m) => m.ref ?? '')}
        rounds={rounds.filter((r) => r.status !== '완료')}
        scopes={scopes}
        assignees={assignees}
        unconfirmed={unconfirmed}
        pendingCompose={pendingCompose}
        staleVerify={staleVerify}
        pendingStaleCompose={pendingStaleCompose}
        today={t}
        staleVerifyDays={s.opsPolicy.staleVerifyDays}
      />

      <Card kicker="History" title={`완료 회차 이력 · ${completed.length}건`} pad={false}>
        {completed.length === 0 ? (
          <div className="empty">완료된 재물조사 회차가 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>회차</th><th className="c">구분</th><th>대상 범위</th><th className="num">대상</th><th className="num">실사</th><th className="num">차이</th><th>담당자</th><th>기준일</th></tr>
              </thead>
              <tbody>
                {completed.map((r) => (
                  <tr key={r.id}>
                    <td className="strong">{r.name}<div className="dim" style={{ fontSize: 11 }}>{r.id}</div></td>
                    <td className="c"><Chip tone="neutral" bare>{r.kind}</Chip></td>
                    <td className="dim">{r.scope}</td>
                    <td className="num tnum">{r.planned.toLocaleString()}</td>
                    <td className="num tnum">{r.scanned.toLocaleString()}</td>
                    <td className="num tnum">{r.mismatched > 0 ? <Chip tone="warn" bare>{r.mismatched}</Chip> : 0}</td>
                    <td>{r.assignee}</td>
                    <td className="tnum">{r.dueDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="callout" style={{ margin: 14 }}>
          <b>재물조사 감사 추적.</b> 완료된 회차의 대상·실사·차이 실적을 보존합니다. 회차 완료 시 결과 요약 리포트가 자동 생성되어
          담당·IT기획팀에 배포됩니다(로36). 차이는 조정 결재를 거쳐 대장에 반영된 뒤 완료됩니다.
        </div>
      </Card>
    </>
  )
}
