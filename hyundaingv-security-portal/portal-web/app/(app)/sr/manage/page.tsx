import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { draftApproval } from '@/lib/approvals'
import { attachCount, registerUpload } from '@/lib/attachments'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { daysBetween, today } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { SR_FLOW, type SrRequest, type SrStatus } from '@/lib/types'
import { SR_CHIP, srStatusLabel } from '../chips'

/** 진행 단계 전이 — 유형별로 다르다 (요구사항 결재 시트 4~7번).
 *  시스템개발: 개발 → 테스트 → 적용요청 (반영·완료는 변경관리 최종완료로 전파)
 *  데이터·계정/권한: 배정 후 처리 → 완료 직행 (테스트·적용요청 단계 없음) */
function nextOf(sr: SrRequest): SrStatus | undefined {
  if (sr.kind === '시스템개발') {
    // 테스트 이후는 수동 전이 없음 — 적용요청은 적용요청서 결재 승인으로, 완료는 변경관리 최종완료로만 전파된다
    return ({ 개발중: '테스트' } as Partial<Record<SrStatus, SrStatus>>)[sr.status]
  }
  return sr.status === '개발중' ? '완료' : undefined
}

async function advance(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/sr/manage', 'BIZ_MGR', 'ADMIN')
  const srNo = String(formData.get('srNo') ?? '')
  const s = getStore()
  const sr = s.srRequests.find((r) => r.srNo === srNo)
  const next = sr && nextOf(sr)
  if (!sr || !next) return
  sr.status = next
  if (next === '완료') sr.completedAt = today()
  // 공수(MD) — 진행 처리 시 누적 입력 (요구사항 26행: 작업기간·공수·담당자 관리)
  const manHours = Number(formData.get('manHours'))
  if (Number.isFinite(manHours) && manHours > 0 && manHours <= 999) sr.manHours = Math.min(9999, (sr.manHours ?? 0) + Math.round(manHours))
  // 처리 결과 증적 — SR 번호(pk) 하나로 신청·BA·결과 첨부를 공유한다 (첨부 시트: SR관리 결과등록)
  registerUpload(srNo, formData.get('file'), me.name)
  revalidatePath('/', 'layout')
}

/** 적용요청서 상신 (요구사항 결재 시트 5번) — 신청 상신과 별개의 2차 결재.
 *  테스트 완료 건만, 첨부 추가 가능(본문 자동첨부 없음). 승인 → 적용요청, 반려·회수 → 테스트. */
async function submitApply(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/sr/manage', 'BIZ_MGR', 'ADMIN')
  const srNo = String(formData.get('srNo') ?? '')
  const s = getStore()
  const sr = s.srRequests.find((r) => r.srNo === srNo && r.kind === '시스템개발' && r.status === '테스트')
  if (!sr || s.approvals.some((a) => a.ref === srNo && a.status === '대기')) return
  sr.status = '적용요청결재중'
  // 적용요청서 첨부 — SR 번호(pk) 공유 (요구 명세: 첨부파일 추가 기능 있음)
  registerUpload(srNo, formData.get('file'), me.name)
  draftApproval({ docType: '적용요청 상신', title: `[SR적용요청서] ${sr.title}`, ref: srNo, drafter: me })
  // /sr/manage 는 공유 워크스페이스(담당·Admin) — 재상신자가 원 기안자와 다르면 draftApproval 의 기안자-매칭
  // 닫기가 놓쳐 반려 재상신 할일이 고아로 남고 '반려 방치' 알림이 무한 반복된다(변경의 closeChangeResignTodo
  // 와 동일 결함). 유형+SR번호 선두 고정으로 소유자 무관하게 닫아 폐쇄 루프를 만든다.
  for (const t of s.todos) {
    if (!t.done && t.kind === '재상신' && t.title.startsWith(`[적용요청 상신] ${srNo} `)) t.done = true
  }
  revalidatePath('/', 'layout')
}

/** 중지 가능 상태 — 배정 이후 활성 진행 단계만(결재중·작성중·종결은 제외). 결재 대기 없는 건만 중지해
 *  '중지 중 결재 반영 안함'(결재 시트 BA030014) 요구를 결재 대기 없는 상태로 자연 충족한다. */
const SUSPENDABLE: SrStatus[] = ['CI배정', '개발중', '테스트', '적용요청']

/** SR 중지 (BA030014, 결재 시트) — 활성 진행 SR 을 보류한다. 중지 중엔 진행 처리·지연 집계·SR지연 알림에서
 *  빠지고(가드), 직전 상태를 suspendedFrom 에 남겨 재개 시 복원한다. */
async function suspendSr(formData: FormData) {
  'use server'
  await requireMenuRole('/sr/manage', 'BIZ_MGR', 'ADMIN')
  const srNo = String(formData.get('srNo') ?? '')
  const s = getStore()
  const sr = s.srRequests.find((r) => r.srNo === srNo)
  if (!sr || !SUSPENDABLE.includes(sr.status) || s.approvals.some((a) => a.ref === srNo && a.status === '대기')) return
  // 진행 중 변경(비-최종완료)에 편입된 SR 은 중지 금지 — 변경결과 승인 전파(sr.status==='적용요청' 요구)가
  // '중지' 때문에 누락되면 SR 이 적용요청에 영구 고착된다(변경 approval 은 cw.id 로 키잉돼 위 srNo 대기
  // 가드에 안 걸린다). 변경 미편입 적용요청 SR 은 정상적으로 중지 가능.
  if (s.changes.some((c) => c.srNo === srNo && c.status !== '최종완료')) return
  sr.suspendedFrom = sr.status
  sr.status = '중지'
  revalidatePath('/', 'layout')
}

/** SR 중지 해제 — 직전 진행 상태로 복원(누락 시 CI배정 폴백). */
async function resumeSr(formData: FormData) {
  'use server'
  await requireMenuRole('/sr/manage', 'BIZ_MGR', 'ADMIN')
  const srNo = String(formData.get('srNo') ?? '')
  const s = getStore()
  const sr = s.srRequests.find((r) => r.srNo === srNo && r.status === '중지')
  if (!sr) return
  sr.status = sr.suspendedFrom ?? 'CI배정'
  sr.suspendedFrom = undefined
  // 벨트앤서스펜더 — 복원 상태가 적용요청인데 매칭 변경이 이미 최종완료면(가드 이전 데이터에서 중지 중
  // 결과 승인으로 전파를 놓친 고아), 여기서 완료로 닫아 영구 고착을 해소한다.
  if (sr.status === '적용요청' && s.changes.some((c) => c.srNo === srNo && c.status === '최종완료')) {
    sr.status = '완료'
    sr.completedAt = today()
  }
  revalidatePath('/', 'layout')
}

export default async function SrManagePage() {
  await requireMenu('/sr/manage')
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

      <Card title="전사 SR 목록" kicker="Pipeline" pad={false}
        actions={<a className="btn sm" href="/api/export?type=sr-requests">엑셀 다운로드</a>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>SR번호</th><th>유형</th><th>제목</th><th>신청자</th><th>담당 CI</th><th>상태</th><th className="num">공수(MD)</th><th>작업기간</th><th>완료 예정</th><th className="c">진행 처리</th></tr>
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
                    <td className="num tnum">{r.manHours ?? '-'}</td>
                    <td className="tnum">{(() => {
                      const d = r.completedAt ? daysBetween(r.requestedAt, r.completedAt) : null
                      return d !== null ? `${Math.max(1, d + 1)}일` : '-'
                    })()}</td>
                    <td className="tnum">{r.status === '완료' ? (r.completedAt ?? '-') : (r.dueDate ?? '-')}</td>
                    <td className="c">
                      {r.status === '중지' ? (
                        // 중지(BA030014) — 재개하면 직전 진행 상태로 복원된다
                        <form action={resumeSr} style={{ display: 'inline' }}>
                          <input type="hidden" name="srNo" value={r.srNo} />
                          <button type="submit" className="btn sm">재개</button>
                        </form>
                      ) : (
                      <div className="hstack" style={{ justifyContent: 'center', gap: 4 }}>
                      {next ? (
                        <form action={advance} className="hstack" style={{ padding: '3px 0' }}>
                          <input type="hidden" name="srNo" value={r.srNo} />
                          <input aria-label="공수" className="input" type="number" name="manHours" min={1} placeholder="공수" title="투입 공수(MD) — 누적 합산" style={{ height: 25, fontSize: 11, width: 54 }} />
                          <input className="input" type="file" name="file" style={{ height: 25, fontSize: 11, width: 130, paddingTop: 2 }} title="처리 결과 증적 첨부" />
                          <button type="submit" className="btn sm">{next} 처리 →</button>
                        </form>
                      ) : r.kind === '시스템개발' && r.status === '테스트' ? (
                        // 결재 시트 5번 — 적용요청서는 신청 상신과 별개의 결재 (첨부 추가 가능)
                        <form action={submitApply} className="hstack" style={{ padding: '3px 0' }}>
                          <input type="hidden" name="srNo" value={r.srNo} />
                          <input className="input" type="file" name="file" style={{ height: 25, fontSize: 11, width: 130, paddingTop: 2 }} title="적용요청서 첨부" />
                          <button type="submit" className="btn sm pri">적용요청서 상신</button>
                        </form>
                      ) : (
                        <span className="mut">-</span>
                      )}
                      {SUSPENDABLE.includes(r.status) && (
                        <form action={suspendSr} style={{ display: 'inline' }}>
                          <input type="hidden" name="srNo" value={r.srNo} />
                          <button type="submit" className="btn sm danger" title="SR 보류 — 진행·지연·알림에서 제외">중지</button>
                        </form>
                      )}
                      </div>
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
