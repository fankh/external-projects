/** D5 설계 변경 관리 (ECO/ECN) — Rev-up 을 공식 절차로.
 *  변경요청(ECR) 등록 시 영향 분석(Where-Used) 자동 첨부 → 승인함(단계 승인) →
 *  승인 시 Rev-up 자동 적용 + 변경 통지(ECN). 승인은 공통>승인함에서 처리. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ecoService, type EcoChange } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'info' | 'err'> = {
  DRAFT: 'warn', SUBMITTED: 'info', APPROVED: 'ok', APPLIED: 'ok', REJECTED: 'err',
}
const STATUS_LABEL: Record<string, string> = {
  DRAFT: '작성', SUBMITTED: '승인대기', APPROVED: '승인', APPLIED: '적용완료', REJECTED: '반려',
}

export function EcoChangeScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [rows, setRows] = useState<EcoChange[]>([])
  const [ttype, setTtype] = useState('DRAWING')
  const [sel, setSel] = useState<string | null>(null)

  const load = useCallback(() => {
    void ecoService.list().then((r) => { if (r) setRows(r) })
  }, [])
  useEffect(() => { load() }, [load])

  const raise = useCallback(() => {
    const targetNo = window.prompt(
      ttype === 'DRAWING' ? '대상 도면번호 (예: KDCR 3-13)' : '대상 코드 (예: AHU 5)')?.trim()
    if (!targetNo) return
    const title = window.prompt('변경 제목 (예: 케이싱 두께 상향)')?.trim()
    if (!title) return
    const reason = window.prompt('변경 사유 (생략 가능)', '')?.trim() || undefined
    // D5 — 도면 대체: 신 도면번호 지정 시 승인 후 Rev-up 대신 Supersedure 자동 등록
    const newDrawingNo = ttype === 'DRAWING'
      ? (window.prompt('대체 도면번호 (다른 도면으로 대체 시 입력, 비우면 Rev-up)', '')?.trim() || undefined)
      : undefined
    void ecoService.create({ title, targetType: ttype, targetNo, reason, newDrawingNo })
      .then((r) => {
        if (r === false) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
        load()
        const n = (r.impact?.whereUsedCount ?? r.impact?.revCount ?? 0) as number
        shell.setStatusMsg(`ECR 등록 ✓ — ${r.ecoNo} (영향 ${n}건 자동 첨부, 승인함에서 단계 승인 → Rev-up)`)
      })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [ttype, load, shell])

  useFKeys(active, useMemo(() => ({ F8: load, F2: raise }), [load, raise]))

  const cols: GridColumn<EcoChange>[] = [
    { key: 'no', header: 'ECO No', width: 84, code: true, render: (r) => r.ecoNo },
    { key: 'title', header: t('eco.title', '변경 제목'), render: (r) => r.title },
    { key: 'tt', header: t('eco.target', '대상'), width: 130, render: (r) => `${r.targetType === 'DRAWING' ? '도면' : '코드'} ${r.targetNo}` },
    { key: 'imp', header: t('eco.impact', '영향'), width: 60, align: 'right', render: (r) => `${r.impactCount}건` },
    {
      key: 'rev', header: t('eco.rev', 'Rev'), width: 74, align: 'center',
      render: (r) => (r.revFrom && r.revTo ? `${r.revFrom}→${r.revTo}` : '-'),
    },
    {
      key: 'st', header: t('eco.status', '상태'), width: 82, align: 'center',
      render: (r) => <Chip tone={STATUS_TONE[r.status] ?? 'info'}>{STATUS_LABEL[r.status] ?? r.status}</Chip>,
    },
    { key: 'at', header: t('eco.at', '등록'), width: 92, align: 'center', render: (r) => r.createdAt },
  ]

  const cnt = (s: string[]) => rows.filter((r) => s.includes(r.status)).length

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('eco.header', '설계 변경 관리')}</label>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          {t('eco.hint', 'ECR 등록(영향 분석 자동 첨부)→승인함 단계 승인→Rev-up·ECN 자동 (D5)')}
        </span>
        <span style={{ flex: 1 }} />
        <Combo value={ttype} onChange={setTtype} width={110} options={[
          { value: 'DRAWING', label: '도면 변경' },
          { value: 'CODE', label: '코드 변경' },
        ]} />
        <Btn onClick={raise}>{t('eco.raiseF2', 'ECR 등록 F2')}</Btn>
        <Btn onClick={load}>{t('common.query', '조회')} F8</Btn>
      </div>
      <div className="fill-col" style={{ padding: 6, gap: 6, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { l: t('eco.kpiPending', '승인대기'), v: cnt(['SUBMITTED']), c: 'var(--title-navy)' },
            { l: t('eco.kpiApplied', '적용완료'), v: cnt(['APPLIED', 'APPROVED']), c: 'var(--ok)' },
            { l: t('eco.kpiRejected', '반려'), v: cnt(['REJECTED']), c: 'var(--err)' },
          ].map((k) => (
            <div key={k.l} className="gb" style={{ textAlign: 'center', padding: '8px 6px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: k.c }}>{k.v}</div>
              <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>{k.l}</div>
            </div>
          ))}
        </div>
        <GroupBox title={t('eco.listTitle', '설계변경 목록 — ECR·승인·Rev-up (eco_change)')} noPad>
          {rows.length ? (
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.ecoNo}
              selectedKey={sel} onRowClick={(r) => setSel(r.ecoNo)} />
          ) : (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
              {t('eco.empty', '설계변경 없음 — F2 로 ECR 등록 (영향 분석 자동 첨부)')}
            </div>
          )}
        </GroupBox>
        <div style={{ fontSize: 10.5, color: 'var(--txt-mute)', padding: '2px 4px' }}>
          {t('eco.note', '※ 단계 승인은 [공통 > 승인함]에서 처리 — 승인 시 도면 Rev-up 자동 적용 + 영향 부서 ECN 통지')}
        </div>
      </div>
    </div>
  )
}
