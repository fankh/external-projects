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
