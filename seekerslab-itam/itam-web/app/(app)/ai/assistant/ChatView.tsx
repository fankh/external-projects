'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import type { ChatMessage } from '@/lib/types'
import { askAssistant } from './actions'

const SUGGESTIONS = [
  '발견 자산 요약 브리핑',
  '이번 달 새로 발견된 미등록 단말 중 서버 대역에 있는 것은?',
  '만료 임박한 계약 목록',
  '내년 1분기 보증 만료되는 네트워크 장비 목록',
  '라이선스 초과 사용 현황',
  '자산 상태 분포와 대여 현황',
  '자산 가치 현황 (취득가·잔존가치·감가상각)',
  '분실·대여 연체·수리 지연·장기 미실측 자산 현황',
  '내 보유 자산',
]
// 리포트 생성 프리셋 — 담당자·관리자 전용(생성은 권한 게이트). 클릭 시 실제 리포트가 만들어진다.
const REPORT_SUGGESTIONS = ['월간 자산 현황 리포트 생성', '주간 Shadow IT 브리핑 생성']

export function ChatView({ canReport }: { canReport?: boolean }) {
  const suggestions = canReport ? [...REPORT_SUGGESTIONS, ...SUGGESTIONS] : SUGGESTIONS
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: '안녕하세요, AI 자산 어시스턴트입니다. 자산 대장·발견 자산·계약·이력을 대상으로 자연어로 질의할 수 있습니다.',
    },
  ])
  const [input, setInput] = useState('')
  const [pending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  const send = (text: string) => {
    const q = text.trim()
    if (!q || pending) return
    setInput('')
    setMessages((cur) => [...cur, { role: 'user', text: q }])
    startTransition(async () => {
      const answer = await askAssistant(q)
      setMessages((cur) => [...cur, answer])
    })
  }

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scrollRef} style={{ maxHeight: 460 }}>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="who">{m.role === 'user' ? 'You' : 'AI Assistant'}</div>
            <div className="bub">{m.text}</div>
            {m.evidence && m.evidence.length > 0 && (
              <div className="refs">
                <span className="kicker mute" style={{ alignSelf: 'center' }}>근거</span>
                {m.evidence.map((e) => <a key={e.href} href={e.href}>{e.label} →</a>)}
              </div>
            )}
          </div>
        ))}
        {pending && (
          <div className="msg assistant">
            <div className="who">AI Assistant</div>
            <div className="bub mut">분석 중…</div>
          </div>
        )}
      </div>
      <div className="suggest">
        {suggestions.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
      </div>
      <div className="chat-in">
        <input
          className="input"
          placeholder="자산에 대해 질문하세요 — 예: A부서에서 쓰는 미인가 SaaS와 월 추정 사용자 수"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(input) }}
          disabled={pending}
        />
        <button className="btn pri" onClick={() => send(input)} disabled={pending || !input.trim()}>
          질의
        </button>
      </div>
    </div>
  )
}
