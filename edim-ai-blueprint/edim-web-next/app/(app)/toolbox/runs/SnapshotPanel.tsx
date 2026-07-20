'use client'

/** 1.7 — Snapshot 고정·재현 검증 (요구 #9).
 *
 * Run 결과를 ID 하나로 동결해 두면, 이후 원본이 바뀌어도 "무엇을 근거로 견적/Handoff 했는가"를
 * 재현할 수 있다. 검증은 payload 무결성(checksum)과 현재 원본과의 차이(drift)를 함께 보고한다.
 */
import { useState, useTransition } from 'react'
import { Chip, GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { freezeSnapshot, verifySnapshot, type ActState, type SnapshotRow, type VerifyResult } from './actions'

export function SnapshotPanel({ rows, latestRunId }: { rows: SnapshotRow[]; latestRunId: number | null }) {
  const { t } = useI18n()
  const [runId, setRunId] = useState(latestRunId ? String(latestRunId) : '')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<ActState>({})
  const [vr, setVr] = useState<VerifyResult | null>(null)
  const [busy, start] = useTransition()

  const freeze = () => start(async () => {
    setMsg(await freezeSnapshot(Number(runId), note))
    setNote('')
  })
  const verify = (id: number) => start(async () => setVr(await verifySnapshot(id)))

  return (
    <GroupBox title={`${t('snap.title', 'Snapshot 고정·재현 (요구 #9)')} — ${rows.length}`} noPad data-snapshot-panel>
      <div style={{ display: 'flex', gap: 5, padding: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
        <label>Run</label>
        <input className="in" style={{ width: 72 }} value={runId} onChange={(e) => setRunId(e.target.value)} />
        <input className="in" style={{ width: 190 }} placeholder={t('snap.notePh', '메모 (선택)')}
          value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="b run" data-snap-freeze disabled={busy || !runId.trim()} onClick={freeze}>
          {t('snap.freeze', '고정')}
        </button>
        <span style={{ color: 'var(--txt-mute)', fontSize: 10.5 }}>
          {t('snap.hint', '고정 후에는 원본이 변경돼도 Snapshot 내용은 불변 — 검증에서 차이(drift)만 보고됩니다')}
        </span>
        {msg.error ? <span style={{ color: 'var(--err)' }}>{msg.error}</span> : null}
        {msg.ok ? <span style={{ color: 'var(--run)' }}>{msg.ok}</span> : null}
      </div>
      {vr ? (
        <div data-snap-verify style={{ padding: '5px 8px', fontSize: 10.5, borderTop: '1px solid var(--line)',
          background: vr.driftCount ? '#FFF6E5' : '#EAF3EC' }}>
          <b>{vr.snapshotCode}</b> — {t('snap.integrity', '무결성')}{' '}
          {vr.intact ? <Chip tone="ok">{t('snap.intact', '정상')}</Chip> : <Chip tone="err">{t('snap.broken', '훼손')}</Chip>}
          {' · '}{t('snap.source', '원본')} {vr.sourceExists ? t('snap.exists', '존재') : t('snap.deleted', '삭제됨')}
          {' · '}{t('snap.drift', '차이')} {vr.driftCount}
          {vr.drift.map((d) => (
            <div key={d.field} style={{ color: 'var(--err)' }}>
              · {d.field}: {JSON.stringify(d.snapshot)} → {JSON.stringify(d.current)}
            </div>
          ))}
          {!vr.driftCount ? <div style={{ color: 'var(--run)' }}>{t('snap.same', '현재 원본과 동일 — 그대로 재현 가능')}</div> : null}
          <span style={{ float: 'right', cursor: 'pointer', color: 'var(--txt-dim)' }} onClick={() => setVr(null)}>✕</span>
        </div>
      ) : null}
      <div style={{ maxHeight: 190, overflow: 'auto' }}>
        <table className="g">
          <thead><tr>
            <th>{t('snap.code', 'Snapshot')}</th><th>Run</th><th>v</th><th>{t('snap.project', '프로젝트')}</th>
            <th>FG Code</th><th>BOM</th><th>checksum</th><th>{t('snap.created', '고정')}</th>
            <th>ERP</th><th /></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={r.snapshotId}>
                <td className="code">{r.snapshotCode}</td>
                <td className="num">{r.sourceId}</td>
                <td className="num">{r.version}</td>
                <td>{r.projectNo}</td>
                <td className="code">{r.finishedGoodsCode}</td>
                <td className="num">{r.bomRows}</td>
                <td style={{ fontFamily: 'Consolas, monospace', color: 'var(--txt-mute)' }}>{r.checksum}</td>
                <td className="c">{r.createdAt}</td>
                <td className="c">{r.handedOff ? <Chip tone="info">{t('snap.handed', '연계')}</Chip> : '—'}</td>
                <td className="c">
                  <button className="b" data-snap-verify-btn disabled={busy} onClick={() => verify(r.snapshotId)}>
                    {t('snap.verify', '검증')}
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={10} style={{ padding: 10, color: 'var(--txt-mute)' }}>
                {t('snap.empty', '고정된 Snapshot 없음 — Run 번호를 넣고 고정하십시오')}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </GroupBox>
  )
}
