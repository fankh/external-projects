import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { draftApproval } from '@/lib/approvals'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { currentYear, nowStamp, today } from '@/lib/dates'
import { sendVia } from '@/lib/integrations/registry'
import { getStore, recordBatch } from '@/lib/store'


async function remindUnsigned(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/pledge/dept', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const dept = String(formData.get('dept') ?? '')
  if (me.role === 'DEPT_MGR' && dept !== me.dept) return

  const s = getStore()
  const revisedAt = s.pledgeForms.find((f) => f.kind === '일반')?.revisedAt ?? '0000-00-00'
  const signedNames = new Set(s.pledges.filter((p) => p.year === currentYear() && p.kind === '일반' && p.signedAt >= revisedAt).map((p) => p.name))
  const targets = s.people.filter((p) => p.dept === dept && !signedNames.has(p.name))
  if (targets.length === 0) return

  // 폐쇄 루프 — 그룹웨어 메일 어댑터 경유 발송. 채널이 중지 상태면 실패가 배치 이력으로 드러난다.
  const r = await sendVia('groupware-mail', targets.map((t) => t.name), `[보안서약서] ${currentYear()}년 미서약 안내`)
  recordBatch(`미서약 안내메일 발송 (${dept} ${targets.length}명)`, nowStamp(), r.ok ? '성공' : '실패')
  revalidatePath('/', 'layout')
}

/** 부서 서약 현황 결재상신 (결재 시트 11번) — 조회된 부서 목록 전체를 상신한다.
 *  업무 상태 전파는 없고(요구: 진행상태 반영 없음), 묶음 번호는 결재 이력에서 채번한다. */
async function submitDeptStatus(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/pledge/dept', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const dept = String(formData.get('dept') ?? '')
  if (me.role === 'DEPT_MGR' && dept !== me.dept) return
  const s = getStore()
  if (!s.people.some((p) => p.dept === dept)) return
  // 같은 부서의 상신이 결재 대기 중이면 중복 상신을 막는다
  if (s.approvals.some((a) => a.docType === '부서서약 현황 상신' && a.status === '대기' && a.title.startsWith(`[보안서약서] ${dept} `))) return

  const revisedAt = s.pledgeForms.find((f) => f.kind === '일반')?.revisedAt ?? '0000-00-00'
  const signed = new Set(s.pledges.filter((p) => p.year === currentYear() && p.kind === '일반' && p.signedAt >= revisedAt).map((p) => p.name))
  const members = s.people.filter((p) => p.dept === dept)
  const done = members.filter((p) => signed.has(p.name)).length

  // ref = 부서명 (안정 per-item 키) — 비회전(v1.5.84). 같은 부서 재상신은 exact-ref 닫기로 그 부서 할일만
  // 정확히 닫히고, 무관한 타 부서의 fresh 상신은 이 부서 반려 재상신 할일을 건드리지 않는다.
  draftApproval({
    docType: '부서서약 현황 상신',
    title: `[보안서약서] ${dept} 서약 현황 ${members.length}명 (완료 ${done} · 미서약 ${members.length - done}) ${today()}`,
    ref: dept, drafter: me,
  })
  // 공유 워크스페이스(부서담당·업무담당·Admin) — 재상신자가 원 기안자와 다를 수 있어(부서담당 A 상신·반려 →
  // Admin 재상신) draftApproval 의 기안자-매칭 닫기가 놓친다. 유형+부서명 선두 고정으로 소유자 무관하게, 그
  // 부서의 반려 재상신 할일만 닫는다('반려' 포함 매칭으로 부서명 접두 충돌 회피). SR·변경·점검과 동일 패턴.
  for (const t of s.todos) {
    if (!t.done && t.kind === '재상신' && t.title.startsWith(`[부서서약 현황 상신] ${dept} 반려`)) t.done = true
  }
  revalidatePath('/', 'layout')
}

export default async function DeptPledgePage() {
  const me = await requireMenu('/pledge/dept')
  const s = getStore()

  const revisedAt = s.pledgeForms.find((f) => f.kind === '일반')?.revisedAt ?? '0000-00-00'
  const signedBy = new Map(
    s.pledges.filter((p) => p.year === currentYear() && p.kind === '일반' && p.signedAt >= revisedAt).map((p) => [p.name, p]),
  )
  // 부서담당은 소속 부서만, 업무담당·Admin 은 전사
  const depts = [...new Set(s.people.map((p) => p.dept))]
    .filter((d) => me.role !== 'DEPT_MGR' || d === me.dept)

  const total = s.people.filter((p) => depts.includes(p.dept))
  const unsignedTotal = total.filter((p) => !signedBy.has(p.name))

  return (
    <>
      <ScreenHeader kicker="임직원 의식제고" title="부서 서약 현황"
        desc={`${currentYear()}년 일반 보안서약서 ${me.role === 'DEPT_MGR' ? `— ${me.dept} 진행현황` : '— 전사 부서별 진행현황'}`}
        right={<a className="btn sm" href="/api/export?type=pledge-status">엑셀 다운로드</a>} />

      <div className="stat-row">
        <Stat value={total.length} label="대상 인원" />
        <Stat value={total.length - unsignedTotal.length} label="서약 완료" />
        <Stat value={unsignedTotal.length} label="미서약" tone={unsignedTotal.length > 0 ? 'err' : undefined} />
        {/* 100% 는 전원 서약일 때만 — Math.round 거짓 100(99.5→100)을 막는다(전사 서약률·교육 이수율 v1.5.79 동일) */}
        <Stat value={`${total.length ? (unsignedTotal.length === 0 ? 100 : Math.min(99, Math.round(((total.length - unsignedTotal.length) / total.length) * 100))) : 0}%`} label="서약률" />
      </div>

      {depts.map((dept) => {
        const members = s.people.filter((p) => p.dept === dept)
        const unsigned = members.filter((p) => !signedBy.has(p.name))
        return (
          <Card key={dept} title={dept} kicker="Department"
            actions={
              <span className="hstack">
                {unsigned.length > 0 ? (
                  <form action={remindUnsigned}>
                    <input type="hidden" name="dept" value={dept} />
                    <button type="submit" className="btn sm">미서약 안내메일 ({unsigned.length}명)</button>
                  </form>
                ) : (
                  <Chip tone="ok" bare>전원 완료</Chip>
                )}
                <form action={submitDeptStatus}>
                  <input type="hidden" name="dept" value={dept} />
                  <button type="submit" className="btn sm pri">현황 결재상신</button>
                </form>
              </span>
            } pad={false}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>이름</th><th>상태</th><th>제출일</th><th>방식</th></tr></thead>
                <tbody>
                  {members.map((p) => {
                    const sig = signedBy.get(p.name)
                    return (
                      <tr key={p.name}>
                        <td className="strong">{p.name}</td>
                        <td>{sig ? <Chip tone="ok">서약 완료</Chip> : <Chip tone="err">미서약</Chip>}</td>
                        <td className="tnum">{sig?.signedAt?.slice(0, 10) ?? '-'}</td>
                        <td>{sig?.method ?? '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      })}
    </>
  )
}
