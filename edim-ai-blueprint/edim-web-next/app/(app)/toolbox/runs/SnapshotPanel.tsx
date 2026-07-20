'use client'

/** 1.7 — Snapshot 고정·재현 검증 (요구 #9).
 *
 * Run 결과를 ID 하나로 동결해 두면, 이후 원본이 바뀌어도 "무엇을 근거로 견적/Handoff 했는가"를
 * 재현할 수 있다. 검증은 payload 무결성(checksum)과 현재 원본과의 차이(drift)를 함께 보고한다.
 */
import { useState, useTransition } from 'react'
import { Chip, GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { checkBomBasis, freezeSnapshot, verifySnapshot, type ActState, type BasisResult, type SnapshotRow, type VerifyResult } from './actions'

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

  // #40 — 전개 근거 대조: Snapshot 이 결과를 보존한다면, 이쪽은 "지금 다시 펴도 같은가" 를 답한다
  const [basis, setBasis] = useState<BasisResult | { error: string } | null>(null)
  const checkBasis = () => start(async () => setBasis(await checkBomBasis(Number(runId))))

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
        <button className="b" data-basis-check disabled={busy || !runId.trim()} onClick={checkBasis}
          title={t('basis.hint', '이 Run 이 어떤 관계 Revision 으로 폈는지 · 지금 재실행해도 같은 BOM 인지')}>
          {t('basis.btn', '전개 근거 대조')}
        </button>
        <span style={{ color: 'var(--txt-mute)', fontSize: 10.5 }}>
          {t('snap.hint', '고정 후에는 원본이 변경돼도 Snapshot 내용은 불변 — 검증에서 차이(drift)만 보고됩니다')}
        </span>
        {msg.error ? <span style={{ color: 'var(--err)' }}>{msg.error}</span> : null}
        {msg.ok ? <span style={{ color: 'var(--run)' }}>{msg.ok}</span> : null}
      </div>
      {basis ? (
        <div data-basis-result style={{ padding: '5px 8px', fontSize: 10.5, borderTop: '1px solid var(--line)',
          background: 'error' in basis || basis.stable === false ? '#FFF6E5' : basis.stable === null ? '#F3F4F6' : '#EAF3EC' }}>
          <span style={{ float: 'right', cursor: 'pointer', color: 'var(--txt-dim)' }} onClick={() => setBasis(null)}>✕</span>
          {'error' in basis ? <span style={{ color: 'var(--err)' }}>{basis.error}</span> : (
            <>
              <b>{t('basis.title', 'BOM 전개 근거')} — Run {basis.runId}</b>{' '}
              {basis.stable === null ? (
                <span style={{ color: 'var(--txt-mute)' }}>{basis.reason}</span>
              ) : (
                <>
                  {basis.stable
                    ? <Chip tone="ok">{t('basis.stable', '근거 동일 — 재실행해도 같은 BOM')}</Chip>
                    : <Chip tone="warn">{t('basis.moved', '근거 변경됨')}</Chip>}
                  {' · '}{t('basis.edges', '관계')} {basis.edgeCount}
                  {' · '}<span style={{ fontFamily: 'Consolas, monospace', color: 'var(--txt-mute)' }}>
                    {basis.pinned?.checksum.slice(0, 12)}{!basis.stable ? ` → ${basis.current?.checksum.slice(0, 12)}` : ''}
                  </span>
                  {(basis.diff ?? []).map((d) => (
                    <div key={d.relId} data-basis-diff={d.relId} style={{ color: 'var(--err)' }}>
                      · {d.label} — {d.change === 'added' ? t('basis.added', '추가됨')
                        : d.change === 'removed' ? t('basis.removed', '제거됨')
                        : `${t('basis.revised', 'Rev')} ${d.pinnedRevision} → ${d.currentRevision}`}
                    </div>
                  ))}
                  {basis.stable ? (
                    <div style={{ color: 'var(--run)' }}>
                      {t('basis.sameHint', '고정된 관계 Revision 집합이 현재와 동일합니다')}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--txt-mute)' }}>
                      {t('basis.movedHint', '근거가 이동해도 이 Run 의 BOM 은 바뀌지 않습니다 — 재실행 시 결과가 달라질 수 있다는 뜻입니다')}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      ) : null}
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
