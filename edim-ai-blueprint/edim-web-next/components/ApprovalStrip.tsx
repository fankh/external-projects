'use client'

/** U32 — Approval 스트립 표준 (원본 PPT 전 Set-up 화면 좌측 Approval 박스: 상태 + 승인 요청 + 승인함).
 *  대상 지정형 공용 위젯 — 화면별 개별 버튼의 표준 대체. */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { requestApprovalGeneric } from './approvalActions'

const TONE: Record<string, 'ok' | 'warn' | 'info'> = { APPROVED: 'ok', PENDING: 'warn', DRAFT: 'info' }

export function ApprovalStrip(props: {
  targetTable: string
  targetId: number
  targetCode: string
  label: string
  status?: string | null
  disabled?: boolean
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [pending, start] = useTransition()
  const st = (props.status || 'DRAFT').toUpperCase()
  const request = () => start(async () => {
    const r = await requestApprovalGeneric(props.targetTable, props.targetId, props.targetCode, props.label)
    setMsg(r.error ? { text: r.error, err: true } : { text: t('appr.requested', '승인 요청 ✓ — 승인함 등록') })
  })
  return (
    <span data-approval-strip style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 10.5 }}>
      <span style={{ color: 'var(--txt-dim)' }}>Approval</span>
      <Chip tone={TONE[st] ?? 'info'}>{st}</Chip>
      <button className="b" data-appr-request disabled={props.disabled || pending} onClick={request}
        title={t('appr.requestHint', '승인 요청 — 승인함(M-15-2) 등록 후 결재 (표준 스트립)')}
        style={{ height: 18, fontSize: 10 }}>✍ {t('common.requestApproval', '승인 요청')}</button>
      <button className="b" data-appr-inbox onClick={() => router.push('/common/approval')}
        title={t('appr.inboxHint', '승인함 열기')} style={{ height: 18, fontSize: 10 }}>📥</button>
      {msg ? <span style={{ color: msg.err ? 'var(--err)' : 'var(--run)' }}>{msg.text}</span> : null}
    </span>
  )
}
