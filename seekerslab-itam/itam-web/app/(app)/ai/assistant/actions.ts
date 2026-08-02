'use server'
import { recordAiCall } from '@/lib/ai-status'
import { appendAudit } from '@/lib/audit'
import { daysUntil, isLoanOverdue, isStaleVerify, today } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import type { ChatMessage } from '@/lib/types'

/** 권한 범위 내 자산 데이터를 질의 컨텍스트로 요약 (RAG 대체 — 데모 스코프) */
function buildContext(userName: string, isUser: boolean): string {
  const s = getStore()
  const assets = isUser ? s.assets.filter((a) => a.owner === userName) : s.assets
  const mine = s.approvals.filter((a) => a.requester === userName)
  const lines: string[] = [
    `기준일: ${today()}`,
    `[자산 대장] 총 ${assets.length}건`,
    ...assets.map((a) => `- ${a.assetNo} | ${a.category} | ${a.model} | ${a.status} | ${a.owner}/${a.dept} | ${a.location} | IP:${a.ip ?? '-'} | 보증만료:${a.warrantyEnd}`),
    `[내 신청] ${mine.length}건`,
    ...mine.map((a) => `- ${a.id} | ${a.kind} | ${a.title} | ${a.status}${a.status === '대기' ? ` (${a.currentStep})` : ''}`),
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
      `[재물조사] ${s.inventoryRounds.length}회차`,
      ...s.inventoryRounds.map((r) => `- ${r.name} | ${r.status} | ${r.scanned}/${r.planned} 스캔 | 차이:${r.mismatched} | 기한:${r.dueDate}`),
      `[결재 대기] ${s.approvals.filter((a) => a.status === '대기').length}건`,
      ...s.approvals.filter((a) => a.status === '대기').map((a) => `- ${a.id} | ${a.kind} | ${a.title} | ${a.currentStep}`),
      `[운영 리스크] 분실·도난 ${s.assets.filter((a) => a.status === '분실').length} · 장기미실측 ${s.assets.filter(isStaleVerify).length} · 대여연체 ${s.assets.filter(isLoanOverdue).length}`,
      ...s.assets
        .filter((a) => a.status === '분실' || isStaleVerify(a) || isLoanOverdue(a))
        .map((a) => `- ${a.assetNo} | ${a.model} | ${a.status === '분실' ? '분실·도난' : isLoanOverdue(a) ? `대여연체(${a.owner}, 기한 ${a.loanDueDate})` : `장기미실측(최근 실측 ${a.lastVerifiedAt ?? '없음'})`}`),
    )
  }
  return lines.join('\n')
}

/** 키 미설정 시 스텁 — 스토어 데이터 기반 결정적 응답 (edim 패턴: 샘플 모드) */
function stubAnswer(question: string, userName: string, isUser: boolean): ChatMessage {
  const s = getStore()
  const q = question.toLowerCase()

  // 내 신청 상태 — 본인이 상신한 결재 (전 권한그룹, 본인 범위). 조직 결재 큐(비사용자)와 구분해 '내 신청'으로 잡는다.
  if (q.includes('내 신청') || q.includes('신청 상태') || q.includes('내 요청')) {
    const mine = s.approvals.filter((a) => a.requester === userName)
    const cnt = (st: string) => mine.filter((a) => a.status === st).length
    return {
      role: 'assistant',
      text: mine.length
        ? `${userName}님이 상신한 신청은 총 ${mine.length}건입니다 (대기 ${cnt('대기')} · 승인 ${cnt('승인')} · 반려 ${cnt('반려')} · 취소 ${cnt('취소')}).\n\n${mine
            .slice(0, 8)
            .map((a) => `· ${a.id} — ${a.title} [${a.status}${a.status === '대기' ? ` · ${a.currentStep}` : a.status === '반려' && a.rejectReason ? ` · 사유: ${a.rejectReason}` : ''}]`)
            .join('\n')}`
        : `${userName}님이 상신한 신청 내역이 없습니다. 자산 신청·반납·이동은 워크플로 › 신청·결재에서 상신할 수 있습니다.`,
      evidence: [{ label: '결재함', href: '/workflow/approvals' }],
    }
  }

  if (!isUser && (q.includes('재물조사') || q.includes('실사') || q.includes('재고조사'))) {
    const cur = s.inventoryRounds.find((r) => r.status === '진행중')
    const rounds = s.inventoryRounds
    return {
      role: 'assistant',
      text: cur
        ? `진행 중인 재물조사는 '${cur.name}'이며 진행률 ${Math.round((cur.scanned / cur.planned) * 100)}% (${cur.scanned.toLocaleString()}/${cur.planned.toLocaleString()} 스캔)입니다. 차이 항목 ${cur.mismatched}건이 조정 결재 대상이며 기한은 ${cur.dueDate}입니다.\n\n전체 회차 ${rounds.length}개 — ${rounds.map((r) => `${r.name}(${r.status})`).join(', ')}.`
        : `현재 진행 중인 재물조사가 없습니다. 전체 회차 ${rounds.length}개: ${rounds.map((r) => `${r.name}(${r.status})`).join(', ')}.`,
      evidence: [
        { label: '재물조사 수행', href: '/inventory/survey' },
        { label: '재물조사 계획', href: '/inventory/survey-plan' },
      ],
    }
  }
  if (!isUser && (q.includes('결재') || q.includes('승인 대기') || q.includes('상신'))) {
    const pend = s.approvals.filter((a) => a.status === '대기')
    const byKind = [...new Set(pend.map((a) => a.kind))].map((k) => `${k} ${pend.filter((a) => a.kind === k).length}건`)
    return {
      role: 'assistant',
      text: `현재 결재 대기 ${pend.length}건입니다.${pend.length
        ? `\n\n종류별: ${byKind.join(', ')}.\n\n${pend.slice(0, 6).map((a) => `· ${a.id} — ${a.title} (현재 단계: ${a.currentStep})`).join('\n')}`
        : ''}`,
      evidence: [{ label: '결재함', href: '/workflow/approvals' }],
    }
  }
  if (!isUser && (q.includes('미인가') || q.includes('saas') || q.includes('새스') || q.includes('섀도'))) {
    const shadow = s.saas.filter((x) => !x.sanctioned)
    // "A부서에서 쓰는 …" — 질문에 언급된 부서가 있으면 그 부서로 좁힌다
    const dept = [...new Set(s.saas.map((x) => x.dept))].find((d) => question.includes(d))
    const items = dept ? shadow.filter((x) => x.dept === dept) : shadow
    const users = items.reduce((n, x) => n + x.users, 0)
    return {
      role: 'assistant',
      text: `${dept ? `${dept}의 ` : ''}미인가(Shadow) SaaS는 ${items.length}종이며 추정 사용자는 총 ${users}명입니다.\n\n${items
        .map((x) => `· ${x.service} — ${x.dept} · 추정 사용자 ${x.users}명 (분류 ${x.category}, 위험도 ${x.risk})`)
        .join('\n')}\n\n인가·차단 판정은 Discovery › Shadow SaaS 또는 환경설정 › SaaS 카탈로그에서 처리합니다.`,
      evidence: [
        { label: 'Shadow SaaS', href: '/discovery/saas' },
        { label: 'SaaS 카탈로그', href: '/settings/saas-catalog' },
      ],
    }
  }
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
  // 운영 리스크 자산 — 분실·도난, 장기 미실측(유령 후보), 대여 반환 연체를 한 번에 훑는다 (자산팀 조치 대상)
  if (!isUser && (q.includes('분실') || q.includes('도난') || q.includes('미실측') || q.includes('유령') || q.includes('연체') || q.includes('대여') || q.includes('반출') || q.includes('운영 리스크') || q.includes('리스크 자산'))) {
    const lost = s.assets.filter((a) => a.status === '분실')
    const stale = s.assets.filter(isStaleVerify)
    const overdue = s.assets.filter(isLoanOverdue)
    const sec = (label: string, arr: typeof lost, fmt: (a: (typeof lost)[number]) => string) =>
      `· ${label}: ${arr.length}건${arr.length ? `\n${arr.slice(0, 8).map((a) => `   - ${fmt(a)}`).join('\n')}` : ''}`
    return {
      role: 'assistant',
      text: `운영 리스크 자산 현황입니다 (자산팀 조치 대상).\n\n${[
        sec('분실·도난 신고', lost, (a) => `${a.assetNo} — ${a.model} (${a.dept})`),
        sec('장기 미실측(유령 후보)', stale, (a) => `${a.assetNo} — ${a.model} · 최근 실측 ${a.lastVerifiedAt ?? '없음'}`),
        sec('대여 반환 연체', overdue, (a) => `${a.assetNo} — ${a.model} · ${a.owner} (기한 ${a.loanDueDate})`),
      ].join('\n\n')}\n\n분실은 회수·폐기 확정, 장기 미실측은 수시 재물조사 편성, 대여 연체는 반환 독촉으로 처리합니다.`,
      evidence: [
        { label: '자산 대장 (장기 미실측 필터)', href: '/assets/register' },
        { label: '재물조사 계획', href: '/inventory/survey-plan' },
      ],
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
    text: `현재 데모 모드(ANTHROPIC_API_KEY 미설정)로 동작 중입니다. 다음과 같은 질의를 지원합니다.\n\n· "이번 달 새로 발견된 미등록 단말 중 서버 대역에 있는 것은?"\n· "특정 부서에서 쓰는 미인가 SaaS와 추정 사용자 수"\n· "재물조사 진행률"\n· "결재 대기 현황"\n· "만료 임박한 계약 목록"\n· "라이선스 초과 사용 현황"\n· "분실·대여 연체·장기 미실측 등 운영 리스크 자산 현황"\n· "내 보유 자산"\n· "내 신청 상태"`,
  }
}

/** AI 질의 감사 기록 — AI 거버넌스는 "제안·질의·응답 전체를 감사 로그로 보존"을 요구한다
 *  (제품안내서 §05). 질의 원문과 응답 경로를 남겨야 권한 밖 데이터 접근 여부를 사후 검증할 수 있다.
 *  응답 전문은 길어 로그를 삼키므로 경로·길이만 남긴다. */
function auditQuery(actor: string, question: string, route: string, chars: number) {
  const q = question.trim().replace(/\s+/g, ' ')
  appendAudit({
    actor,
    action: `AI 질의 (${route}) — "${q.length > 60 ? `${q.slice(0, 60)}…` : q}" → 응답 ${chars}자`,
    target: 'AI 어시스턴트',
  })
}

export async function askAssistant(question: string): Promise<ChatMessage> {
  const session = await getSession()
  if (!session) return { role: 'assistant', text: '세션이 만료되었습니다. 다시 로그인해 주세요.' }
  const isUser = session.role === 'USER'

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    const stub = stubAnswer(question, session.name, isUser)
    auditQuery(session.name, question, '규칙 응답', stub.text.length)
    return stub
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      // claude-opus-5는 thinking 기본 on — max_tokens가 thinking+응답 합산 상한이라 여유를 둔다
      model: process.env.ANTHROPIC_MODEL_ID || 'claude-opus-5',
      max_tokens: 8192,
      system:
        `당신은 SEEKERSLAB ITAM 플랫폼의 AI 자산 어시스턴트입니다. ` +
        `아래 자산 데이터(사용자 권한 범위 내)만 근거로 한국어로 간결히 답하세요. ` +
        `데이터에 없는 내용은 없다고 답하세요. 수치는 데이터와 정확히 일치해야 합니다.\n\n` +
        buildContext(session.name, isUser),
      messages: [{ role: 'user', content: question }],
    })
    if (response.stop_reason === 'refusal') {
      auditQuery(session.name, question, '정책 거부', 0)
      return { role: 'assistant', text: '해당 질의는 정책상 응답할 수 없습니다.' }
    }
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
    recordAiCall(true)
    auditQuery(session.name, question, 'LLM', text.length)
    return {
      role: 'assistant',
      text,
      evidence: [{ label: '자산 대장', href: '/assets/register' }, { label: '발견 자산', href: '/discovery/found' }],
    }
  } catch (err) {
    recordAiCall(false, err instanceof Error ? err.message.slice(0, 80) : '알 수 없는 오류')
    auditQuery(session.name, question, 'LLM 호출 실패 → 규칙 응답', 0)
    return {
      role: 'assistant',
      text: `AI 서비스 호출에 실패했습니다 — ${err instanceof Error ? err.message : '알 수 없는 오류'}. 데모 응답으로 대체합니다.\n\n${stubAnswer(question, session.name, isUser).text}`,
    }
  }
}
