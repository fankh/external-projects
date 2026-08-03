import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { SR_FLOW, type SrRequest, type SrStatus } from '@/lib/types'
import { SR_CHIP, srStatusLabel } from '../chips'

/** 진행 단계 전이 — 유형별로 다르다 (요구사항 결재 시트 4~7번).
 *  시스템개발: 개발 → 테스트 → 적용요청 (반영·완료는 변경관리 최종완료로 전파)
 *  데이터·계정/권한: 배정 후 처리 → 완료 직행 (테스트·적용요청 단계 없음) */
function nextOf(sr: SrRequest): SrStatus | undefined {
  if (sr.kind === '시스템개발') {
    return ({ 개발중: '테스트', 테스트: '적용요청', 적용요청: '완료' } as Partial<Record<SrStatus, SrStatus>>)[sr.status]
  }
  return sr.status === '개발중' ? '완료' : undefined
}

async function advance(formData: FormData) {
  'use server'
  const me = await requireRole('BIZ_MGR', 'ADMIN')
  const srNo = String(formData.get('srNo') ?? '')
  const s = getStore()
  const sr = s.srRequests.find((r) => r.srNo === srNo)
  const next = sr && nextOf(sr)
  if (!sr || !next) return
  sr.status = next
  if (next === '완료') sr.completedAt = today()
  // 처리 결과 증적 — SR 번호(pk) 하나로 신청·BA·결과 첨부를 공유한다 (첨부 시트: SR관리 결과등록)
  registerUpload(srNo, formData.get('file'), me.name)
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
                const next = nextOf(r)
                return (
                  <tr key={r.srNo}>
                    <td className="code">{r.srNo}</td>
                    <td><Chip tone="neutral" bare>{r.kind}</Chip></td>
                    <td className="strong">{r.title}<Clip count={attachCount(r.srNo)} title="SR 첨부 (신청·BA·결과)" /></td>
                    <td>{r.requester} <span className="mut">· {r.dept}</span></td>
                    <td>{r.ci ?? <span className="mut">미배정</span>}</td>
                    <td><Chip tone={SR_CHIP[r.status]}>{srStatusLabel(r)}</Chip></td>
                    <td className="tnum">{r.status === '완료' ? (r.completedAt ?? '-') : (r.dueDate ?? '-')}</td>
                    <td className="c">
                      {next ? (
                        <form action={advance} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                          <input type="hidden" name="srNo" value={r.srNo} />
                          <input className="input" type="file" name="file" style={{ height: 25, fontSize: 11, width: 130, paddingTop: 2 }} title="처리 결과 증적 첨부" />
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
