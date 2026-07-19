'use client'

/** U28 — 내부 Q&A 패널: 질문 → 내부 자산 근거 목록(딥링크) + 답변(live=Claude 합성 / search=검색 안내). */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Chip, GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { askAssistant, type ChatResult } from './actions'

export function AssistantPanel() {
  const { t } = useI18n()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [res, setRes] = useState<ChatResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const ask = () => {
    if (!q.trim()) return
    start(async () => {
      const r = await askAssistant(q.trim())
      if (!r) { setErr('질의 실패 — 백엔드 필요'); return }
      setErr(null); setRes(r)
    })
  }
  return (
    <GroupBox title={t('assist.panel', '내부 자료 질의응답 — 코드·문서·Table·Macro·부품 검색 근거 기반')} noPad
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, padding: 8, alignItems: 'center' }}>
        <input className="in" data-assist-q value={q} placeholder={t('assist.ph', '예: KDCR 3-13 관련 자료는? · FanTechData 는 어디에?')}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask() }} style={{ flex: 1, height: 24 }} />
        <button className="b run" data-assist-ask disabled={pending || !q.trim()} onClick={ask} style={{ height: 24 }}>
          {pending ? t('assist.asking', '조회 중…') : t('assist.ask', '질의')}
        </button>
        {res ? <Chip tone={res.mode === 'live' ? 'ok' : 'info'}>{res.mode}</Chip> : null}
      </div>
      {err ? <div style={{ padding: '0 10px', fontSize: 11, color: 'var(--err)' }}>{err}</div> : null}
      {res ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 10px 10px', fontSize: 11.5 }}>
          <div data-assist-answer style={{ padding: 8, background: 'var(--panel, #F4F6FA)', border: '1px solid var(--line)', borderRadius: 3, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {res.answer}
          </div>
          {res.refs.length ? (
            <table className="g" data-assist-refs style={{ width: '100%', marginTop: 8 }}>
              <thead><tr><th style={{ width: 90 }}>{t('assist.kind', '유형')}</th><th style={{ width: 150 }}>{t('assist.code', '코드')}</th><th>{t('assist.titleCol', '이름')}</th><th style={{ width: 40 }}>{t('assist.open', '열기')}</th></tr></thead>
              <tbody>
                {res.refs.map((r, i) => (
                  <tr key={i}>
                    <td className="c">{r.kind}</td>
                    <td className="c code">{r.code}</td>
                    <td>{r.title}</td>
                    <td className="c" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => router.push(r.href)}>↗</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div style={{ marginTop: 8, color: 'var(--txt-mute)' }}>{t('assist.none', '일치하는 내부 자료 없음')}</div>}
        </div>
      ) : (
        <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)', lineHeight: 1.8 }}>
          {t('assist.hint', '질문의 키워드로 내부 자산(제품 코드·문서·데이터 Table·Macro·부품)을 검색해 근거와 함께 답합니다. AI 합성 답변은 API 크레딧 준비 시 자동 활성(live 배지).')}
        </div>
      )}
    </GroupBox>
  )
}
