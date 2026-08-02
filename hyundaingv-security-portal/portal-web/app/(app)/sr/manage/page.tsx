import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { SR_FLOW, type SrStatus } from '@/lib/types'
import { SR_CHIP } from '../chips'

/** 진행 단계 전이 — 개발중 → 테스트 → 적용요청 → 완료 (한 단계씩만 이동) */
const NEXT: Partial<Record<SrStatus, SrStatus>> = { 개발중: '테스트', 테스트: '적용요청', 적용요청: '완료' }

async function advance(formData: FormData) {
  'use server'
  await requireRole('BIZ_MGR', 'ADMIN')
  const srNo = String(formData.get('srNo') ?? '')
  const s = getStore()
  const sr = s.srRequests.find((r) => r.srNo === srNo)
  const next = sr && NEXT[sr.status]
  if (!sr || !next) return
  sr.status = next
  if (next === '완료') sr.completedAt = today()
  revalidatePath('/', 'layout')
}

export default async function SrManagePage() {
  await requireRole('BIZ_MGR', 'ADMIN')
  const s = getStore()
  const rows = s.srRequests

  const countOf = (st: SrStatus) => rows.filter((r) => r.status === st).length

  return (
    <>
      <ScreenHeader kicker="IT Request" title="SR 관리"
        desc="전사 SR 파이프라인 — 개발 · 테스트 · 적용 단계를 진행 처리한다." />

      <div className="stat-row">
        {SR_FLOW.filter((st) => st !== '작성중').map((st) => (
          <Stat key={st} value={countOf(st)} label={st}
            tone={st !== '완료' && countOf(st) > 0 ? 'warn' : undefined} />
        ))}
      </div>

      <Card title="전사 SR 목록" kicker="Pipeline" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>SR번호</th><th>유형</th><th>제목</th><th>신청자</th><th>담당 CI</th><th>상태</th><th>완료 예정</th><th className="c">진행 처리</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const next = NEXT[r.status]
                return (
                  <tr key={r.srNo}>
                    <td className="code">{r.srNo}</td>
                    <td><Chip tone="neutral" bare>{r.kind}</Chip></td>
                    <td className="strong">{r.title}</td>
                    <td>{r.requester} <span className="mut">· {r.dept}</span></td>
                    <td>{r.ci ?? <span className="mut">미배정</span>}</td>
                    <td><Chip tone={SR_CHIP[r.status]}>{r.status}</Chip></td>
                    <td className="tnum">{r.status === '완료' ? (r.completedAt ?? '-') : (r.dueDate ?? '-')}</td>
                    <td className="c">
                      {next ? (
                        <form action={advance} style={{ display: 'inline' }}>
                          <input type="hidden" name="srNo" value={r.srNo} />
                          <button type="submit" className="btn sm">{next} 처리 →</button>
                        </form>
                      ) : (
                        <span className="mut">-</span>
                      )}
                    </td>
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
