'use server'
import { revalidatePath } from 'next/cache'
import { recordAiCall } from '@/lib/ai-status'
import { appendAudit } from '@/lib/audit'
import { nowMinute, today } from '@/lib/dates'
import { buildSections, nextRunOf, ruleHeadline } from '@/lib/reports'
import { getSession } from '@/lib/session'
import { dispatch } from '@/lib/notify'
import { getStore } from '@/lib/store'
import type { ReportKind, ReportSchedule, ReportSection } from '@/lib/types'

/** 섹션 표를 LLM 입력용 텍스트로 압축 — 수치는 섹션에서만 오고 AI는 서술만 담당 */
function sectionsAsText(sections: ReportSection[]): string {
  return sections
    .map((s) => {
      const head = `## ${s.title}${s.note ? ` (${s.note})` : ''}`
      const table = s.columns ? [s.columns.join(' | '), ...(s.rows ?? []).map((r) => r.join(' | '))].join('\n') : ''
      const bullets = (s.bullets ?? []).map((b) => `- ${b}`).join('\n')
      return [head, table, bullets].filter(Boolean).join('\n')
    })
    .join('\n\n')
}

/** 리포트 1건 생성 — 수동 생성과 스케줄 실행이 같은 경로를 쓴다 */
async function createReport(kind: ReportKind, by: string): Promise<string> {
  const s = getStore()
  const sections = buildSections(kind)
  let headline = ruleHeadline(kind, sections)
  let mode: 'AI' | '규칙' = '규칙'

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey })
      const response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL_ID || 'claude-opus-5',
        max_tokens: 4096,
        system:
          'IT 자산관리 리포트의 요약 서술을 작성합니다. 아래 표 데이터에 있는 수치만 사용하고 ' +
          '없는 사실을 추가하지 마세요. 3~5문장의 한국어 평서문으로, 담당자가 조치를 판단할 수 있게 ' +
          '위험·이상 항목을 우선 언급하세요. 제목이나 머리말 없이 본문만 출력하세요.',
        messages: [{ role: 'user', content: `리포트: ${kind}\n\n${sectionsAsText(sections)}` }],
      })
      if (response.stop_reason !== 'refusal') {
        const text = response.content
          .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
          .map((b) => b.text).join('').trim()
        if (text) { headline = text; mode = 'AI' }
      }
      recordAiCall(mode === 'AI', mode === 'AI' ? undefined : '응답에 텍스트 없음')
    } catch (err) {
      // 라이브 생성 실패 시 규칙 기반 서술 유지 — 리포트 생성 자체는 성공시킨다.
      // 다만 실패 사실은 남긴다. 조용히 폴백하면 화면이 계속 'AI 가동'이라 주장하게 된다.
      recordAiCall(false, err instanceof Error ? err.message.slice(0, 80) : '알 수 없는 오류')
    }
  }

  s.seq += 1
  const id = `RPT-${s.seq}`
  s.reports.unshift({
    id,
    kind,
    title: `${kind} (${today()})`,
    period: today(),
    generatedAt: nowMinute(),
    generatedBy: by,
    mode,
    headline,
    sections,
  })
  appendAudit({ actor: by, action: `AI 리포트 생성 (${mode})`, target: kind })
  return id
}

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
  s.reports = s.reports.filter((r) => r.id !== id)
  revalidatePath('/', 'layout')
}
