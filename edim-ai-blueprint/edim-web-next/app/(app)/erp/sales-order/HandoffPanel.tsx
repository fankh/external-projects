'use client'

/** ERP Handoff 패널 (트리아지 #44~47/#49) — CPQ 산출물 수신 상태기계.
 *  생성(Validation pass/warning) → 승인함 결정 → ERP 수신(accept). 변경 = 새 Version, 이전 건 superseded. */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { acceptHandoff, createHandoff, type ActState, type HandoffRow, type RunOption } from './handoffActions'

const TONE: Record<string, 'ok' | 'warn' | 'info' | 'err'> = {
  accepted: 'ok', approved: 'info', approval_requested: 'warn', validated: 'info',
  rejected: 'err', superseded: 'warn',
}

export function HandoffPanel({ rows, runs }: { rows: HandoffRow[]; runs: RunOption[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [runId, setRunId] = useState<string>(runs[0] ? String(runs[0].runId) : '')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()

  return (
    <div className="gb" data-handoff-panel style={{ flex: 'none', maxHeight: 220, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>{t('handoff.title', 'ERP Handoff — 승인된 Package 만 수신')}</span>
        <span style={{ flex: 1 }} />
        <select className="in" data-handoff-run value={runId} onChange={(e) => setRunId(e.target.value)}
          style={{ height: 20, fontSize: 10.5 }} aria-label="Handoff Run">
          {runs.map((r) => <option key={r.runId} value={r.runId}>Run #{r.runId} ({r.startedAt})</option>)}
        </select>
        <button className="b run" data-handoff-create disabled={pending || !runId}
          title={t('handoff.createHint', 'Validation(BOM·원가·견적) 통과 시 승인 요청 생성 — 같은 프로젝트 재생성은 새 Version')}
          onClick={() => start(async () => {
            const r = await createHandoff(Number(runId))
            setSt(r)
            router.refresh()
          })}>{t('handoff.createBtn', 'Handoff 생성')}</button>
        {st.error ? <span style={{ fontSize: 10.5, color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ fontSize: 10.5, color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <table className="g" style={{ width: '100%' }}>
          <thead><tr><th>#</th><th>{t('so.project', '프로젝트')}</th><th>Run</th><th>Ver</th>
            <th>{t('handoff.grade', '검증')}</th><th>{t('order.status', '상태')}</th>
            <th>{t('handoff.at', '생성')}</th><th></th></tr></thead>
          <tbody>{rows.length ? rows.map((h) => (
            <tr key={h.handoffId}>
              <td className="c">{h.handoffId}</td>
              <td className="code">{h.projectNo}</td>
              <td className="c">#{h.runId}</td>
              <td className="c">v{h.version}</td>
              <td className="c">{h.grade ? <Chip tone={h.grade === 'pass' ? 'ok' : 'warn'}>{h.grade}</Chip> : '—'}</td>
              <td className="c"><Chip tone={TONE[h.status] ?? 'info'}>{h.status}</Chip></td>
              <td className="c" style={{ fontSize: 9.5 }}>{h.createdAt}</td>
              <td className="c">
                {h.status === 'approved' ? (
                  <button className="b run" data-handoff-accept disabled={pending} style={{ height: 17, fontSize: 9.5 }}
                    title={t('handoff.acceptHint', 'ERP 수신 — 프로젝트 업무 시작')}
                    onClick={() => start(async () => { setSt(await acceptHandoff(h.handoffId)); router.refresh() })}>
                    {t('handoff.acceptBtn', 'ERP 수신')}</button>
                ) : h.status === 'approval_requested' ? (
                  <span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>{t('handoff.waitApproval', '승인함 대기')}</span>
                ) : h.acceptedAt ? <span style={{ fontSize: 9.5, color: 'var(--run)' }}>{h.acceptedAt}</span> : null}
              </td>
            </tr>
          )) : <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--txt-mute)' }}>{t('handoff.empty', 'Handoff 없음 — SUCCESS Run 에서 생성')}</td></tr>}</tbody>
        </table>
      </div>
    </div>
  )
}
