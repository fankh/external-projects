'use server'
import { revalidatePath } from 'next/cache'
import { TODAY } from '@/lib/dates'
import { buildSections, ruleHeadline } from '@/lib/reports'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import type { ReportKind, ReportSection } from '@/lib/types'

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

export async function generateReport(kind: ReportKind) {
  const session = await getSession()
  if (!session || session.role === 'USER') return

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
    } catch {
      // 라이브 생성 실패 시 규칙 기반 서술 유지 — 리포트 생성 자체는 성공시킨다
    }
  }

  s.seq += 1
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const id = `RPT-${s.seq}`
  s.reports.unshift({
    id,
    kind,
    title: `${kind} (${TODAY})`,
    period: TODAY,
    generatedAt: `${TODAY} ${hh}:${mm}`,
    generatedBy: session.name,
    mode,
    headline,
    sections,
  })
  s.auditLogs.unshift({
    id: `AUD-${9000 + s.seq}`,
    at: `${TODAY} ${hh}:${mm}:00`,
    actor: session.name,
    action: `AI 리포트 생성 (${mode})`,
    target: kind,
    result: '성공',
    ip: '10.20.31.45',
  })
  revalidatePath('/', 'layout')
}

export async function deleteReport(id: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return
  const s = getStore()
  s.reports = s.reports.filter((r) => r.id !== id)
  revalidatePath('/', 'layout')
}
