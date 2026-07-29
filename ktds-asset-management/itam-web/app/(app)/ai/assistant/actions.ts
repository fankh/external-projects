'use server'
import { TODAY, daysUntil } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import type { ChatMessage } from '@/lib/types'

/** 권한 범위 내 자산 데이터를 질의 컨텍스트로 요약 (RAG 대체 — 데모 스코프) */
function buildContext(userName: string, isUser: boolean): string {
  const s = getStore()
  const assets = isUser ? s.assets.filter((a) => a.owner === userName) : s.assets
  const lines: string[] = [
    `기준일: ${TODAY}`,
    `[자산 대장] 총 ${assets.length}건`,
    ...assets.map((a) => `- ${a.assetNo} | ${a.category} | ${a.model} | ${a.status} | ${a.owner}/${a.dept} | ${a.location} | IP:${a.ip ?? '-'} | 보증만료:${a.warrantyEnd}`),
  ]
  if (!isUser) {
    lines.push(
      `[발견 자산] ${s.discovered.length}건`,
      ...s.discovered.map((d) => `- ${d.id} | ${d.hostname} | ${d.type} | ${d.channel} | ${d.state} | 위험도:${d.risk} | 최근:${d.lastSeen}${d.note ? ` | ${d.note}` : ''}`),
      `[계약] ${s.contracts.length}건`,
      ...s.contracts.map((c) => `- ${c.id} | ${c.name} | ${c.vendor} | 만료:${c.end} (D-${daysUntil(c.end)})`),
      `[라이선스]`,
      ...s.licenses.map((l) => `- ${l.name} | 보유:${l.purchased} 사용:${l.used} | 만료:${l.expiry}`),
      `[Shadow SaaS]`,
      ...s.saas.map((x) => `- ${x.service} | ${x.dept} | 사용자:${x.users} | ${x.sanctioned ? '인가' : '미인가'} | 위험도:${x.risk}`),
    )
  }
  return lines.join('\n')
}

/** 키 미설정 시 스텁 — 스토어 데이터 기반 결정적 응답 (edim 패턴: 샘플 모드) */
function stubAnswer(question: string, userName: string, isUser: boolean): ChatMessage {
  const s = getStore()
  const q = question.toLowerCase()

  if (!isUser && (q.includes('미등록') || q.includes('발견') || q.includes('shadow'))) {
    const items = s.discovered.filter((d) => d.state === '미등록' && !d.action)
    return {
      role: 'assistant',
      text: `이번 달 새로 발견된 미등록 자산은 ${items.length}건입니다.\n\n${items
        .map((d) => `· ${d.id} — ${d.hostname} (${d.type}, ${d.channel}, 위험도 ${d.risk})`)
        .join('\n')}\n\n이 중 서버 대역(10.20.31.x)에 있는 것은 ${items.filter((d) => d.ip.startsWith('10.20.31')).length}건입니다. 소유자 확인 요청 후 편입 또는 격리 처리를 권장합니다.`,
      evidence: [
        { label: '발견 자산 목록', href: '/discovery/found' },
        { label: 'CMDB 대사', href: '/discovery/reconcile' },
      ],
    }
  }
  if (!isUser && (q.includes('만료') || q.includes('보증') || q.includes('계약'))) {
    const soon = s.contracts.filter((c) => { const d = daysUntil(c.end); return d !== null && d <= 90 })
    return {
      role: 'assistant',
      text: `90일 내 만료 예정 계약은 ${soon.length}건입니다.\n\n${soon
        .map((c) => `· ${c.id} — ${c.name} (${c.vendor}, ${c.end} 만료, D-${daysUntil(c.end)})`)
        .join('\n')}\n\n네트워크 장비 유지보수 계약(CT-2022-007)은 잔여 ${daysUntil('2026-08-31')}일로 갱신 협상이 시급합니다.`,
      evidence: [{ label: '계약 · 라이선스', href: '/inventory/contracts' }],
    }
  }
  if (!isUser && (q.includes('라이선스') || q.includes('license'))) {
    const over = s.licenses.filter((l) => l.used > l.purchased)
    const low = s.licenses.filter((l) => l.used / l.purchased < 0.6)
    return {
      role: 'assistant',
      text: `라이선스 대사 결과 초과 사용 ${over.length}건, 장기 미사용 보유 ${low.length}건이 검출되었습니다.\n\n${over
        .map((l) => `· ${l.name} — 보유 ${l.purchased}석 / 사용 ${l.used}석 (${l.used - l.purchased}석 초과, 감사 리스크)`)
        .join('\n')}\n${low
        .map((l) => `· ${l.name} — 사용률 ${Math.round((l.used / l.purchased) * 100)}% (회수 후보 ${l.purchased - l.used}석, 연 ${Math.round(((l.purchased - l.used) * l.unitCost) / 10_000).toLocaleString()}만원 절감 가능)`)
        .join('\n')}`,
      evidence: [{ label: '라이선스 컴플라이언스', href: '/inventory/contracts' }],
    }
  }
  const mine = s.assets.filter((a) => a.owner === userName)
  if (q.includes('내') || q.includes('보유') || isUser) {
    return {
      role: 'assistant',
      text: mine.length
        ? `${userName}님이 보유 중인 자산은 ${mine.length}건입니다.\n\n${mine
            .map((a) => `· ${a.assetNo} — ${a.model} (${a.status}, 보증 만료 ${a.warrantyEnd})`)
            .join('\n')}`
        : `${userName}님 명의로 등록된 자산이 없습니다. 자산 신청은 워크플로 › 신청·결재에서 상신할 수 있습니다.`,
      evidence: [{ label: '자산 대장', href: '/assets/register' }],
    }
  }
  return {
    role: 'assistant',
    text: `현재 데모 모드(ANTHROPIC_API_KEY 미설정)로 동작 중입니다. 다음과 같은 질의를 지원합니다.\n\n· "이번 달 새로 발견된 미등록 단말 중 서버 대역에 있는 것은?"\n· "만료 임박한 계약 목록"\n· "라이선스 초과 사용 현황"\n· "내 보유 자산"`,
  }
}

export async function askAssistant(question: string): Promise<ChatMessage> {
  const session = await getSession()
  if (!session) return { role: 'assistant', text: '세션이 만료되었습니다. 다시 로그인해 주세요.' }
  const isUser = session.role === 'USER'

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return stubAnswer(question, session.name, isUser)

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL_ID || 'claude-opus-5',
      max_tokens: 2048,
      system:
        `당신은 SEEKERSLAB ITAM 플랫폼의 AI 자산 어시스턴트입니다. ` +
        `아래 자산 데이터(사용자 권한 범위 내)만 근거로 한국어로 간결히 답하세요. ` +
        `데이터에 없는 내용은 없다고 답하세요. 수치는 데이터와 정확히 일치해야 합니다.\n\n` +
        buildContext(session.name, isUser),
      messages: [{ role: 'user', content: question }],
    })
    if (response.stop_reason === 'refusal') {
      return { role: 'assistant', text: '해당 질의는 정책상 응답할 수 없습니다.' }
    }
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
    return {
      role: 'assistant',
      text,
      evidence: [{ label: '자산 대장', href: '/assets/register' }, { label: '발견 자산', href: '/discovery/found' }],
    }
  } catch (err) {
    return {
      role: 'assistant',
      text: `AI 서비스 호출에 실패했습니다 — ${err instanceof Error ? err.message : '알 수 없는 오류'}. 데모 응답으로 대체합니다.\n\n${stubAnswer(question, session.name, isUser).text}`,
    }
  }
}
