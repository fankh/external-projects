/** 변경 이력 대장 (D-5L) — 설계변경(ECO) 전용 라이프사이클 대장.
 *  ECO/ECN 화면이 요청·승인 동선이라면, 이 화면은 전체 변경 이력의 조회·감사 뷰.
 *  상태 집계 KPI · 상태/대상 필터 · Rev 전이·변경유형 · 헤더 컬럼 필터 · CSV. 조회 전용. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ecoService, type EcoLedger, type EcoLedgerRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { downloadCsv } from '../../utils/csv'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'info'> = {
  APPLIED: 'ok', REJECTED: 'warn', SUBMITTED: 'info', APPROVED: 'info', DRAFT: 'info',
}
const TYPE_TONE: Record<string, 'ok' | 'warn' | 'info'> = {
  'Rev-up': 'ok', '대체': 'info', '반려': 'warn', '진행': 'info',
}

export function EcoLedgerScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { setStatusMsg } = shell
  const [data, setData] = useState<EcoLedger | null>(null)
  const [offline, setOffline] = useState(false)
  const [status, setStatus] = useState('전체')
  const [ttype, setTtype] = useState('전체')

  const load = useCallback(() => {
    const st = status === '전체' ? '' : status
    const tt = ttype === '전체' ? '' : ttype
    void ecoService.ledger(st, tt).then((r) => {
      if (r === null) { setOffline(true); return }
      setOffline(false); setData(r)
    })
  }, [status, ttype])
  useEffect(() => { load() }, [load])
  useFKeys(active, useMemo(() => ({ F8: load }), [load]))

  const rows = data?.rows ?? []
  const sm = data?.summary

  const cols: GridColumn<EcoLedgerRow>[] = [
    { key: 'no', header: 'ECO 번호', width: 96, code: true, render: (r) => r.ecoNo },
    { key: 'title', header: '제목', render: (r) => r.title },
    { key: 'ttype', header: '대상유형', width: 74, align: 'center', render: (r) => r.targetType === 'DRAWING' ? '도면' : '코드' },
    { key: 'target', header: '대상', width: 110, code: true, render: (r) => r.targetNo },
    { key: 'ctype', header: '변경유형', width: 74, align: 'center', render: (r) => <Chip tone={TYPE_TONE[r.changeType] ?? 'info'}>{r.changeType}</Chip> },
    { key: 'rev', header: 'Rev 전이', width: 96, align: 'center', render: (r) => r.revTransition },
    { key: 'status', header: '상태', width: 84, align: 'center', render: (r) => <Chip tone={STATUS_TONE[r.status] ?? 'info'}>{r.status}</Chip> },
    { key: 'reason', header: '사유', render: (r) => r.reason || '—' },
    { key: 'by', header: '등록자', width: 70, align: 'center', render: (r) => r.createdBy },
    { key: 'at', header: '등록일시', width: 116, align: 'center', render: (r) => r.createdAt },
    { key: 'applied', header: '적용일시', width: 116, align: 'center', render: (r) => r.appliedAt || '—' },
  ]

  const exportCsv = () => {
    if (!rows.length) return
    downloadCsv('eco_ledger',
      ['ECO', '제목', '대상유형', '대상', '변경유형', 'RevFrom', 'RevTo', '상태', '사유', '등록자', '등록일시', '적용일시'],
      rows.map((r) => [r.ecoNo, r.title, r.targetType, r.targetNo, r.changeType, r.revFrom, r.revTo, r.status, r.reason, r.createdBy, r.createdAt, r.appliedAt]))
    setStatusMsg(`변경 이력 대장 CSV ✓ — ${rows.length}건`)
  }

  return (
    <div className="fill-col">
      <div className="qband">
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>변경 이력 대장</span>
        {sm ? (
          <>
            <Chip tone="info">총 {sm.total}</Chip>
            <Chip tone="ok">적용 {sm.applied}</Chip>
            <Chip tone="warn">진행 {sm.pending}</Chip>
            <Chip tone="warn">반려 {sm.rejected}</Chip>
          </>
        ) : null}
        <span style={{ flex: 1 }} />
        <label>상태</label>
        <Combo width={120} value={status} options={['전체', 'SUBMITTED', 'APPROVED', 'APPLIED', 'REJECTED', 'DRAFT']} onChange={setStatus} />
        <label>대상</label>
        <Combo width={100} value={ttype} options={['전체', 'DRAWING', 'CODE']} onChange={setTtype} />
        <Btn onClick={exportCsv}>⬇ CSV</Btn>
        <Btn onClick={load}>조회 F8</Btn>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox title={`설계 변경 이력 — ${rows.length}건`} noPad style={{ height: '100%' }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>백엔드 연결 필요 — 변경 이력은 실DB(eco_change)에서만 조회됩니다</div>
          ) : rows.length ? (
            <DenseGrid prefKey="eco-ledger" colFilter columns={cols} rows={rows} rowKey={(r) => r.ecoNo} />
          ) : (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>변경 이력이 없습니다 (필터 조건 확인)</div>
          )}
        </GroupBox>
      </div>
    </div>
  )
}
