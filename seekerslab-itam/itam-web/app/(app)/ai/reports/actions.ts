'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { createReport, nextRunOf } from '@/lib/reports'
import { getSession } from '@/lib/session'
import { dispatch } from '@/lib/notify'
import { getStore } from '@/lib/store'
import type { ReportKind } from '@/lib/types'

export async function generateReport(kind: ReportKind) {
  const session = await getSession()
  if (!session || session.role === 'USER') return
  await createReport(kind, session.name)
  revalidatePath('/', 'layout')
}

/** 결재 첨부 — 생성 리포트를 대기 중 결재의 근거 문서로 첨부한다(제품안내서 §05 "결재 첨부용 문서 산출"의
 *  실제 연결 — 그동안 리포트는 내려받기만 되고 결재에 붙지 않았다). 결재자는 결재함에서 첨부 리포트를 연다.
 *  대기 결재·존재하는 리포트만 대상, 중복 첨부는 무시(멱등). 비사용자만. */
export async function attachReportToApproval(approvalId: string, reportId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '결재 첨부 권한이 없습니다.' }
  const s = getStore()
  const ap = s.approvals.find((a) => a.id === approvalId)
  if (!ap) return { ok: false, message: '결재 건을 찾을 수 없습니다.' }
  if (ap.status !== '대기') return { ok: false, message: '대기 중인 결재에만 리포트를 첨부할 수 있습니다.' }
  const rep = s.reports.find((r) => r.id === reportId)
  if (!rep) return { ok: false, message: '리포트를 찾을 수 없습니다.' }

  ap.reportRefs ??= []
  if (ap.reportRefs.includes(reportId)) return { ok: true, message: '이미 첨부된 리포트입니다.' }
  ap.reportRefs.push(reportId)
  appendAudit({ actor: session.name, action: `결재 리포트 첨부 — ${reportId} (${rep.kind}) → ${approvalId}`, target: approvalId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${rep.kind} 리포트를 ${ap.id} 결재에 첨부했습니다.` }
}

/** 결재 첨부 리포트 해제 — 잘못 붙인 근거 문서를 뗀다. 대기 결재만, 비사용자. */
export async function detachReportFromApproval(approvalId: string, reportId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '권한이 없습니다.' }
  const s = getStore()
  const ap = s.approvals.find((a) => a.id === approvalId)
  if (!ap || !ap.reportRefs) return { ok: false, message: '첨부 내역을 찾을 수 없습니다.' }
  if (ap.status !== '대기') return { ok: false, message: '대기 중인 결재만 첨부를 변경할 수 있습니다.' }
  ap.reportRefs = ap.reportRefs.filter((id) => id !== reportId)
  appendAudit({ actor: session.name, action: `결재 리포트 첨부 해제 — ${reportId} ↔ ${approvalId}`, target: approvalId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${reportId} 첨부를 해제했습니다.` }
}

export async function toggleSchedule(kind: ReportKind) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '스케줄 변경 권한이 없습니다.' }
  const s = getStore()
  const sc = s.reportSchedules.find((x) => x.kind === kind)
  if (!sc) return { ok: false, message: '스케줄을 찾을 수 없습니다.' }
  sc.enabled = !sc.enabled
  appendAudit({ actor: session.name, action: `리포트 스케줄 ${sc.enabled ? '가동' : '중지'} — ${kind}`, target: '리포트 스케줄' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${kind} 스케줄 ${sc.enabled ? '가동' : '중지'}` }
}

/** 예약 실행 — 기한이 지난 스케줄을 돌려 리포트를 만들고 수신자에게 배포한다.
 *  중지된 스케줄과 기한 전 스케줄은 건너뛴다 (실행 이력이 곧 배포 증적이 된다). */
/** 스케줄 수정 — 수신자·실행 시각·요일/일자를 갱신한다 (가동/중지 외 설정이 고정이던 공백).
 *  주기(주간/월간)는 리포트 성격에 고정이므로 바꾸지 않는다. 비사용자만. */
export async function editSchedule(
  kind: ReportKind,
  input: { recipients: string[]; hour: number; dayOfWeek?: number; dayOfMonth?: number },
) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '스케줄 변경 권한이 없습니다.' }
  const s = getStore()
  const sc = s.reportSchedules.find((x) => x.kind === kind)
  if (!sc) return { ok: false, message: '스케줄을 찾을 수 없습니다.' }

  const recipients = input.recipients.map((r) => r.trim()).filter(Boolean)
  if (recipients.length === 0) return { ok: false, message: '수신자를 1명 이상 입력하세요.' }
  if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) {
    return { ok: false, message: '실행 시각은 0~23시로 입력하세요.' }
  }
  if (sc.period === '주간') {
    if (!input.dayOfWeek || input.dayOfWeek < 1 || input.dayOfWeek > 7) return { ok: false, message: '요일을 선택하세요.' }
    sc.dayOfWeek = input.dayOfWeek
  } else {
    if (!input.dayOfMonth || input.dayOfMonth < 1 || input.dayOfMonth > 31) return { ok: false, message: '일자를 1~31로 입력하세요.' }
    sc.dayOfMonth = input.dayOfMonth
  }
  sc.hour = input.hour
  sc.recipients = recipients

  appendAudit({ actor: session.name, action: `리포트 스케줄 수정 — ${kind} (수신 ${recipients.length}명)`, target: '리포트 스케줄' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${kind} 스케줄이 수정되었습니다.` }
}

export async function runDueSchedules() {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '스케줄 실행 권한이 없습니다.' }

  const s = getStore()
  const t = today()
  const due = s.reportSchedules.filter((sc) => {
    if (!sc.enabled) return false
    const next = nextRunOf(sc)
    return next === null || next <= t
  })
  if (due.length === 0) return { ok: false, message: '실행 기한이 도래한 스케줄이 없습니다 (중지된 스케줄 제외).' }

  const made: string[] = []
  for (const sc of due) {
    const id = await createReport(sc.kind, `스케줄러 (${sc.period})`)
    sc.lastRunAt = t
    made.push(`${sc.kind} → ${id}`)
    for (const to of sc.recipients) {
      dispatch({ channel: '이메일', to, subject: `[${sc.period}] ${sc.kind} 자동 생성 — 결재 첨부용`, kind: '리포트 배포', ref: id })
    }
  }

  appendAudit({ actor: session.name, action: `리포트 예약 실행 (${due.length}건) — ${due.map((d) => d.kind).join(', ')}`, target: '리포트 스케줄' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${due.length}건 자동 생성 · 수신자 배포 완료 — ${made.join(' / ')}` }
}

export async function deleteReport(id: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return
  const s = getStore()
  const report = s.reports.find((r) => r.id === id)
  if (!report) return
  s.reports = s.reports.filter((r) => r.id !== id)
  appendAudit({ actor: session.name, action: `AI 리포트 삭제 — ${report.kind}`, target: id })
  revalidatePath('/', 'layout')
}
