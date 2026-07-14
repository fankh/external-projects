/** 이상 이벤트 통합 관리 — QC 불합격·원가 차이경보·마일스톤 지연을 한 곳에서.
 *  QC 는 검사 등록 시 자동 승격, 원가·마일스톤은 스캔으로 생성. OPEN→ACK→RESOLVED. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { anomalyService, type AnomalyRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const SEV_TONE: Record<string, 'err' | 'warn' | 'info'> = { HIGH: 'err', MED: 'warn', LOW: 'info' }
const SRC_LABEL: Record<string, string> = { QC: '품질', COST: '원가', MILESTONE: '일정', MANUAL: '수동' }
const ST_TONE: Record<string, 'err' | 'warn' | 'ok'> = { OPEN: 'err', ACK: 'warn', RESOLVED: 'ok' }
const ST_LABEL: Record<string, string> = { OPEN: '미처리', ACK: '확인', RESOLVED: '해소' }

export function AnomalyScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [rows, setRows] = useState<AnomalyRow[]>([])
  const [open, setOpen] = useState(0)
  const [openHigh, setOpenHigh] = useState(0)
  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [sel, setSel] = useState<number | null>(null)

  const load = useCallback(() => {
    void anomalyService.list(status, source).then((r) => {
      if (r) { setRows(r.rows); setOpen(r.open); setOpenHigh(r.openHigh) }
    })
  }, [status, source])
  useEffect(() => { load() }, [load])

  const scan = useCallback(() => {
    void anomalyService.scan().then((r) => {
      if (!r) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
      load()
      shell.setStatusMsg(`이상 스캔 ✓ — 신규 ${r.created}건 승격 (원가 차이·마일스톤 지연), 총 ${r.total}건`)
    }).catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [load, shell])

  const escalate = useCallback(() => {
    void anomalyService.escalate().then((r) => {
      if (!r) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
      load()
      shell.setStatusMsg(r.escalated
        ? `에스컬레이션 ✓ — ${r.escalated}건 관리자 ${r.admins}명 통지 (미처리 HIGH·방치)`
        : '에스컬레이션 대상 없음 (미처리 HIGH·임계 방치 없음)')
    }).catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [load, shell])

  useFKeys(active, useMemo(() => ({ F8: load, F9: scan }), [load, scan]))

  const transition = (a: AnomalyRow, st: string) => {
    void anomalyService.transition(a.anomalyId, st).then((ok) => {
      if (!ok) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
      load()
      shell.setStatusMsg(`${ST_LABEL[st]} 처리 ✓ — #${a.anomalyId}`)
    }).catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const cols: GridColumn<AnomalyRow>[] = [
    { key: 'sev', header: t('anom.sev', '심각도'), width: 60, align: 'center', render: (r) => <Chip tone={SEV_TONE[r.severity] ?? 'info'}>{r.severity}</Chip> },
    { key: 'src', header: t('anom.source', '출처'), width: 56, align: 'center', render: (r) => SRC_LABEL[r.source] ?? r.source },
    { key: 'title', header: t('anom.title', '내용'), render: (r) => r.title },
    { key: 'ref', header: t('anom.ref', '참조'), width: 100, render: (r) => r.refNo || '-' },
    { key: 'st', header: t('anom.status', '상태'), width: 66, align: 'center', render: (r) => <Chip tone={ST_TONE[r.status] ?? 'info'}>{ST_LABEL[r.status] ?? r.status}</Chip> },
    { key: 'at', header: t('anom.at', '발생'), width: 92, align: 'center', render: (r) => r.createdAt },
    {
      key: 'act', header: t('anom.action', '처리'), width: 108, align: 'center', noSort: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 3 }}>
          {r.status === 'OPEN' ? <Btn style={{ height: 18, fontSize: 10 }} onClick={() => transition(r, 'ACK')}>확인</Btn> : null}
          {r.status !== 'RESOLVED' ? <Btn variant="pri" style={{ height: 18, fontSize: 10 }} onClick={() => transition(r, 'RESOLVED')}>해소</Btn> : <Chip tone="ok">해소</Chip>}
        </span>
      ),
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('anom.header', '이상 이벤트')}</label>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          {t('anom.hint', 'QC 불합격·원가 차이경보·마일스톤 지연 통합 · QC 자동승격/F9 스캔')}
        </span>
        <span style={{ flex: 1 }} />
        <Combo value={source} onChange={setSource} width={90} options={[
          { value: '', label: '전체 출처' }, { value: 'QC', label: '품질' },
          { value: 'COST', label: '원가' }, { value: 'MILESTONE', label: '일정' },
        ]} />
        <Combo value={status} onChange={setStatus} width={90} options={[
          { value: '', label: '전체 상태' }, { value: 'OPEN', label: '미처리' },
          { value: 'ACK', label: '확인' }, { value: 'RESOLVED', label: '해소' },
        ]} />
        <Btn onClick={scan}>{t('anom.scan', '이상 스캔 F9')}</Btn>
        <Btn onClick={escalate}>{t('anom.escalate', '에스컬레이션')}</Btn>
        <Btn onClick={load}>{t('common.query', '조회')} F8</Btn>
      </div>
      <div className="fill-col" style={{ padding: 6, gap: 6, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { l: t('anom.kpiOpenHigh', '미처리 긴급'), v: openHigh, c: 'var(--err)' },
            { l: t('anom.kpiOpen', '미처리 전체'), v: open, c: 'var(--warn)' },
            { l: t('anom.kpiTotal', '표시 건수'), v: rows.length, c: 'var(--title-navy)' },
          ].map((k) => (
            <div key={k.l} className="gb" style={{ textAlign: 'center', padding: '8px 6px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: k.c }}>{k.v}</div>
              <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>{k.l}</div>
            </div>
          ))}
        </div>
        <GroupBox title={t('anom.listTitle', '이상 이벤트 — 통합 (sys_anomaly)')} noPad>
          {rows.length ? (
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.anomalyId}
              selectedKey={sel} onRowClick={(r) => setSel(r.anomalyId)} />
          ) : (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
              {t('anom.empty', '이상 없음 — F9 로 원가·마일스톤 스캔 (QC 불합격은 검사 등록 시 자동 승격)')}
            </div>
          )}
        </GroupBox>
      </div>
    </div>
  )
}
