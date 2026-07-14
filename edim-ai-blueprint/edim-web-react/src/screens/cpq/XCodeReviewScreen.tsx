/** X-code 검토 (C-1X) — 비표준(X) 코드 견적안 심사.
 *  cpq_selection.x_code_status='PENDING' 대기열 → 승인/반려 (요청자 알림·감사). SETUP 이상. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { selectionService, type XReviewRow } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { usePermission } from '../../shell/PermissionContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function XCodeReviewScreen({ active }: ScreenProps) {
  const shell = useShell()
  const perm = usePermission()
  const { setStatusMsg } = shell
  const [rows, setRows] = useState<XReviewRow[]>([])
  const [offline, setOffline] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const [comment, setComment] = useState('')

  const load = useCallback(() => {
    void selectionService.xReviewList().then((r) => {
      if (r === null) { setOffline(true); return }
      setOffline(false); setRows(r); setSel(null)
    })
  }, [])
  useEffect(() => { load() }, [load])
  useFKeys(active, useMemo(() => ({ F8: load }), [load]))

  const decide = (decision: 'APPROVE' | 'REJECT') => {
    if (sel == null) { setStatusMsg(<span style={{ color: 'var(--err)' }}>대상 X-code 를 선택하십시오</span>); return }
    if (!perm.canWrite('cpq-xreview')) { setStatusMsg(perm.denyWrite); return }
    const row = rows.find((r) => r.selectionId === sel)
    void selectionService.xReview(sel, decision, comment)
      .then((r) => {
        setComment('')
        load()
        setStatusMsg(`X-code ${row?.finishedGoodsCode ?? sel} ${r.xCodeStatus === 'APPROVED' ? '승인' : '반려'} ✓ — 요청자 알림·감사(X_CODE_REVIEW)`)
      })
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const cols: GridColumn<XReviewRow>[] = [
    { key: 'code', header: 'X-code', width: 130, code: true, render: (r) => r.finishedGoodsCode },
    { key: 'proj', header: '프로젝트', width: 130, render: (r) => r.projectNo },
    { key: 'projName', header: '프로젝트명', render: (r) => r.projectName || '—' },
    { key: 'slots', header: '구성(슬롯)', render: (r) => Object.entries(r.slotValues || {}).map(([k, v]) => `${k}=${v}`).join(' · ') || '—' },
    { key: 'by', header: '요청자', width: 70, align: 'center', render: (r) => r.createdBy },
    { key: 'at', header: '요청일시', width: 130, align: 'center', render: (r) => r.createdAt },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>X-code 검토 대기열</span>
        <Chip tone={rows.length ? 'warn' : 'ok'}>{rows.length} 대기</Chip>
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          비표준(X) 완성코드 견적안은 사용 전 검토·승인이 필요합니다
        </span>
        <span style={{ flex: 1 }} />
        <input className="in" style={{ width: 200 }} value={comment} placeholder="검토 의견(선택)" aria-label="검토 의견"
          onChange={(e) => setComment(e.target.value)} />
        <Btn disabled={sel == null || !perm.canWrite('cpq-xreview')} onClick={() => decide('REJECT')}>반려</Btn>
        <Btn variant="pri" disabled={sel == null || !perm.canWrite('cpq-xreview')} onClick={() => decide('APPROVE')}>승인</Btn>
        <Btn onClick={load}>조회 F8</Btn>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox title={`검토 대기 — ${rows.length}건 (PENDING)`} noPad style={{ height: '100%' }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>백엔드 연결 필요 — 검토 대기열은 실DB에서만 조회됩니다</div>
          ) : rows.length ? (
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.selectionId}
              selectedKey={sel} onRowClick={(r) => setSel(r.selectionId)} />
          ) : (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>검토 대기 중인 X-code 가 없습니다 (표준 코드는 검토 불요)</div>
          )}
        </GroupBox>
      </div>
    </div>
  )
}
