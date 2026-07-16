'use client'

import { useState, useTransition } from 'react'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { decideApproval, completeEvent, inboundStock } from './actions'

export interface ApprovalReq { id: number; assetType: string; target: string; reqKind: string; requester: string; reqDate: string; stage: string }
export interface EventRow { eventId: number; procName: string; code: string; title: string; owner: string; deadline: string; delayed: boolean; status: string }

const TAB_KEYS = ['approval', 'task', 'inbound'] as const
type TabKey = typeof TAB_KEYS[number]

export function MobilePreview({ inbox, events }: { inbox: ApprovalReq[]; events: EventRow[] }) {
  const { t } = useI18n()
  const TABS: { k: TabKey; label: string }[] = [
    { k: 'approval', label: t('mobile.tabApproval', '승인함') },
    { k: 'task', label: t('mobile.tabTask', '업무함') },
    { k: 'inbound', label: t('mobile.tabInbound', '입고') },
  ]
  const [tab, setTab] = useState<TabKey>('approval')
  const [item, setItem] = useState('M-MOT-22')
  const [qty, setQty] = useState('10')
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [pending, start] = useTransition()
  const say = (text: string, err = false) => setMsg({ text, err })

  const decide = (id: number, approve: boolean) => start(async () => {
    const r = await decideApproval(id, approve); say(r.error ?? `${approve ? '승인' : '반려'} ✓ — #${id} (APP-002)`, !!r.error)
  })
  const complete = (id: number) => start(async () => {
    const r = await completeEvent(id); say(r.error ?? `업무 완료 ✓ — #${id}`, !!r.error)
  })
  const doInbound = () => start(async () => {
    const r = await inboundStock(item, Number(qty) || 0)
    say(r.error ?? `입고 ✓ — ${item} ×${qty} · 재고 ${r.result?.onHand} · 평단가 ₩${r.result?.avgPrice?.toLocaleString()} (MI-002)`, !!r.error)
  })

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 16, height: '100%', overflow: 'auto' }}>
      {/* 폰 프레임 */}
      <div style={{ width: 360, minHeight: 640, border: '10px solid #1B2233', borderRadius: 32, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 30px rgba(20,26,40,.25)' }}>
        <div style={{ background: 'var(--title-navy)', color: '#fff', padding: '10px 14px', fontSize: 13, fontWeight: 700 }}>EDIM Mobile</div>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
          {TABS.map((tb) => (
            <button key={tb.k} onClick={() => setTab(tb.k)} style={{ flex: 1, padding: '8px 0', fontSize: 12, border: 'none', background: tab === tb.k ? '#EDF2FA' : '#fff', color: tab === tb.k ? 'var(--title-navy)' : 'var(--txt-mute)', fontWeight: tab === tb.k ? 700 : 400, cursor: 'pointer' }}>
              {tb.label}{tb.k === 'approval' && inbox.length ? ` (${inbox.length})` : ''}{tb.k === 'task' && events.length ? ` (${events.length})` : ''}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
          {tab === 'approval' ? (
            inbox.length ? inbox.map((r) => (
              <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{r.assetType} · {r.target}</div>
                <div style={{ fontSize: 11, color: 'var(--txt-mute)', margin: '3px 0' }}>{r.reqKind} · {r.requester} · {r.reqDate} <Chip tone="info">{r.stage}</Chip></div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="b" disabled={pending} onClick={() => decide(r.id, true)} style={{ flex: 1, height: 30, fontSize: 12, color: 'var(--run)' }}>{t('common.approve', '승인')}</button>
                  <button className="b" disabled={pending} onClick={() => decide(r.id, false)} style={{ flex: 1, height: 30, fontSize: 12, color: 'var(--err)' }}>{t('common.reject', '반려')}</button>
                </div>
              </div>
            )) : <Empty text={t('mobile.noApproval', '대기 중인 승인 요청 없음')} />
          ) : tab === 'task' ? (
            events.length ? events.map((e) => (
              <div key={e.eventId} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{e.title}</div>
                <div style={{ fontSize: 11, color: 'var(--txt-mute)', margin: '3px 0' }}>{e.procName} · {e.owner} · {e.deadline}{e.delayed ? ` (${t('mobile.delayed', '지연')})` : ''} <Chip tone={e.status === '지연' ? 'warn' : 'info'}>{e.status}</Chip></div>
                <button className="b" disabled={pending || e.status === 'DONE'} onClick={() => complete(e.eventId)} style={{ width: '100%', height: 30, fontSize: 12, marginTop: 4 }}>{t('mobile.complete', '완료 처리')}</button>
              </div>
            )) : <Empty text={t('mobile.noTask', '업무 없음')} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12 }}>{t('mobile.itemCode', '품목 코드')}</label>
              <input className="in" value={item} onChange={(e) => setItem(e.target.value)} style={{ height: 32, fontSize: 13 }} aria-label={t('mobile.itemCode', '품목 코드')} />
              <label style={{ fontSize: 12 }}>{t('mobile.qty', '수량')}</label>
              <input className="in" value={qty} onChange={(e) => setQty(e.target.value)} style={{ height: 32, fontSize: 13 }} aria-label={t('mobile.qty', '수량')} />
              <button className="b" disabled={pending} onClick={doInbound} style={{ height: 36, fontSize: 13, marginTop: 4 }}>{t('mobile.inboundBtn', '입고 처리 (MI-002)')}</button>
            </div>
          )}
        </div>
        {msg ? <div style={{ padding: '8px 10px', fontSize: 11, borderTop: '1px solid var(--line)', color: msg.err ? 'var(--err)' : 'var(--run)' }}>{msg.text}</div> : null}
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--txt-mute)' }}>{text}</div>
}
