/** M-15-2 승인함 (W-12) — 전 자산 공통 승인 게이트 (DRAFT→PENDING→APPROVED/REJECTED).
 *  Macro 는 변경 전후 수식 비교 + Test 결과 · 승인/반려 실동작. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  APPROVAL_HIST, MACRO_BEFORE, type ApprovalReq,
} from '../../api/mock/dataMore'
import { MACRO_FORMULA } from '../../api/mock/dataMore'
import { approvalService } from '../../api/services'
import { Btn, Chip, Fx, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { usePermission } from '../../shell/PermissionContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function ApprovalInboxScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { setStatusMsg } = shell
  const { t } = useI18n()
  const perm = usePermission()
  const [reqs, setReqs] = useState<ApprovalReq[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [decided, setDecided] = useState<{ target: string; result: string; date: string }[]>([])
  const [view, setView] = useState<'inbox' | 'mine'>('inbox')
  // F3 — 결정 권한 (decide = SETUP+; GENERAL 은 읽기 전용 + 내 요청)
  const canDecide = perm.canWrite('com-approval')

  const load = useCallback(() => {
    void approvalService.inbox().then((rows) => {
      setReqs(rows)
      setSelId(rows[rows.length - 1]?.id ?? null)
    })
  }, [])

  useEffect(() => { load() }, [load])

  useFKeys(active, useMemo(() => ({
    F8: () => { load(); setStatusMsg('승인함 재조회 (sys_approval_request)') },
  }), [load, setStatusMsg]))

  const mine = useMemo(
    () => reqs.filter((r) => r.requesterLogin === perm.login),
    [reqs, perm.login])
  const visible = view === 'mine' ? mine : reqs
  const sel = visible.find((r) => r.id === selId) ?? null

  const decide = (approve: boolean) => {
    if (!sel) return
    if (!approve && !comment.trim()) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>반려는 코멘트 필수</span>)
      return
    }
    if (approve && sel.assetType === 'Macro' && !sel.tested) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>AI 생성물은 Test 통과 후에만 승인 가능</span>)
      return
    }
    void (async () => {
      await approvalService.decide(sel.id, approve, comment)
      setDecided((prev) => [{ target: sel.target, result: approve ? '승인' : '반려', date: '07-09' }, ...prev])
      setReqs((prev) => prev.filter((r) => r.id !== sel.id))
      setSelId(null)
      setComment('')
      shell.setStatusMsg(approve
        ? `승인 — ${sel.target} → APPROVED 전이 (sys_history 기록)`
        : `반려 — ${sel.target} → REJECTED (요청자 알림)`)
    })()
  }

  const cols: GridColumn<ApprovalReq>[] = [
    { key: 't', header: t('appr.type', '유형'), width: 48, align: 'center', render: (r) => r.assetType },
    { key: 'target', header: t('appr.target', '대상'), render: (r) => r.target },
    { key: 'k', header: t('appr.reqKind', '요청 구분'), width: 62, align: 'center', code: true, render: (r) => r.reqKind },
    { key: 'req', header: t('appr.requester', '요청자'), width: 58, align: 'center', render: (r) => r.requester },
    { key: 'd', header: t('appr.reqDate', '요청일'), width: 48, align: 'center', render: (r) => r.reqDate },
    { key: 'stage', header: t('appr.stage', '단계'), width: 40, align: 'center', render: (r) => r.stage },
    {
      key: 'st', header: t('appr.status', '상태'), width: 72, align: 'center',
      render: (r) => (r.tested ? <Chip tone="info">Tested ✓</Chip> : <Chip tone="warn">Pending</Chip>),
    },
  ]

  return (
    <div className="fill-col">
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 160, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <GroupBox title={t('appr.inbox', '승인함')} noPad>
            <div className="tree2">
              <div className={`tn ${view === 'inbox' ? 'sel' : ''}`} data-view-inbox
                onClick={() => { setView('inbox'); setSelId(null) }}>
                <span className="pm">·</span>{t('appr.toProcess', '처리할 요청')} ({reqs.length})
              </div>
              <div className={`tn ${view === 'mine' ? 'sel' : ''}`} data-view-mine
                onClick={() => { setView('mine'); setSelId(null) }}>
                <span className="pm">·</span>{t('appr.myReqs', '내 요청')} ({mine.length})
              </div>
              <div className="tn"><span className="pm">·</span>{t('appr.history', '이력')} ({APPROVAL_HIST.length + decided.length})</div>
            </div>
          </GroupBox>
          <GroupBox title={t('appr.assetType', '자산 유형')} noPad>
            <div className="tree2" style={{ fontSize: 11 }}>
              <div className="tn"><span className="pm">·</span>☑ Code ({reqs.filter((r) => r.assetType === 'Code').length})</div>
              <div className="tn"><span className="pm">·</span>☑ {t('appr.drawing', '도면')} ({reqs.filter((r) => r.assetType === '도면').length})</div>
              <div className="tn"><span className="pm">·</span>☑ Macro ({reqs.filter((r) => r.assetType === 'Macro').length})</div>
              <div className="tn"><span className="pm">·</span>☐ {t('appr.tableFormDoc', 'Table · Form · 문서')}</div>
            </div>
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 6, overflow: 'auto' }}>
          <GroupBox title={(view === 'mine'
            ? t('appr.myReqsN', '내 요청 — {n}건')
            : t('appr.toProcessN', '처리할 요청 — {n}건')).replace('{n}', String(visible.length))} noPad>
            {visible.length
              ? (
                <DenseGrid columns={cols} rows={visible} rowKey={(r) => r.id}
                  selectedKey={selId} onRowClick={(r) => setSelId(r.id)} />
              )
              : (
                <div style={{ padding: 10, color: 'var(--txt-mute)', fontSize: 11 }}>
                  {view === 'mine'
                    ? t('appr.noMine', '내가 요청한 대기 건 없음 (requester = 본인)')
                    : t('appr.noPending', '대기 중인 요청 없음')}
                </div>
              )}
          </GroupBox>
          {sel ? (
            <GroupBox title={`${t('appr.detail', '상세')} — ${sel.target}`} style={{ flex: 1 }}>
              {sel.assetType === 'Macro' ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--txt-dim)', marginBottom: 3 }}>{t('appr.before', '변경 전')} (v0.2)</div>
                      <Fx>{MACRO_BEFORE}</Fx>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--txt-dim)', marginBottom: 3 }}>{t('appr.after', '변경 후')} (v0.3)</div>
                      <Fx style={{ borderColor: 'var(--ok)' }}>{MACRO_FORMULA}</Fx>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--txt-dim)', marginTop: 6 }}>
                    Test Run: {t('appr.input', '입력')} {'{MC:520, FES:15}'} → {t('appr.result', '결과')} <b style={{ color: 'var(--ok)' }}>786</b>
                    · {t('appr.refIntegrity', '참조 무결성')} ✓ · {t('appr.noCircular', '순환 참조 없음')} ✓
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--txt-dim)', lineHeight: 1.9 }}>
                  {sel.reqKind} — {sel.target}<br />
                  {sel.assetType === '도면'
                    ? t('appr.revCompare', 'Rev 비교: Rev.A → Rev.B (치수 B 재검토 반영)')
                    : t('appr.slotReview', 'Slot 정의·값 목록 변경 검토')}
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                {!canDecide ? <Chip tone="warn">{t('appr.readOnly', '읽기 전용 — 결정 권한 없음')}</Chip> : null}
                <input className="in" style={{ width: 240 }} value={comment} aria-label="코멘트"
                  disabled={!canDecide}
                  placeholder={t('appr.commentPh', '코멘트 (반려 시 필수)')} onChange={(e) => setComment(e.target.value)} />
                <Btn style={{ borderColor: 'var(--err)', color: 'var(--err)' }} disabled={!canDecide}
                  title={canDecide ? undefined : perm.denyWrite}
                  onClick={() => decide(false)}>{t('common.reject', '반려')}</Btn>
                <Btn variant="run" disabled={!canDecide}
                  title={canDecide ? undefined : perm.denyWrite}
                  onClick={() => decide(true)}>{t('common.approve', '승인')}</Btn>
              </div>
            </GroupBox>
          ) : (
            <div style={{ padding: 16, color: 'var(--txt-mute)', fontSize: 11 }}>{t('appr.selectReq', '요청을 선택하십시오')}</div>
          )}
        </div>
        <div className="split-h" />
        <div style={{ width: 290, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title={t('appr.rules', '승인 규칙')}>
            <div style={{ fontSize: 10.5, lineHeight: 1.8, color: 'var(--txt-dim)' }}>
              · {t('appr.rule1', '승인 시 approval_status=APPROVED 전이')}<br />
              · {t('appr.rule2', 'System DB 영향 작업은 Platform 승인 필요')}<br />
              · {t('appr.rule3', 'AI 생성물은 검증(Test) 통과 후에만 승인 가능')}
            </div>
          </GroupBox>
          <GroupBox title={t('appr.history', '이력')} noPad>
            <table className="g">
              <thead><tr><th>{t('appr.target', '대상')}</th><th>{t('appr.result', '결과')}</th><th>{t('appr.date', '일자')}</th></tr></thead>
              <tbody>
                {[...decided, ...APPROVAL_HIST].map((h, i) => (
                  <tr key={i}>
                    <td>{h.target}</td>
                    <td className="c">
                      <Chip tone={h.result === '승인' ? 'ok' : 'warn'}>
                        {h.result === '승인' ? t('common.approve', '승인')
                          : h.result === '반려' ? t('common.reject', '반려') : h.result}
                      </Chip>
                    </td>
                    <td className="c">{h.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title={t('appr.mobileSync', '모바일 동기')}>
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
              {t('appr.mobileSyncDesc', '모바일 승인(M-16)과 동일 데이터·규칙 (APP-002)')}
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
