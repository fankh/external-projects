/** M-14-7 ERP Process Set-up (W-14, 슬라이드 17·10) — erp_process_def 커스터마이징 ·
 *  System DB 영향 변경은 Platform 승인 필요. */
import { useEffect, useMemo, useState } from 'react'
import { DEPTS, PROCESS_DEFS, PROCESS_FLOW_1, type ProcessDefRow } from '../../api/mock/dataErp'
import { processDefService } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'
import { FLOW_STEP_KEYS } from './DashboardScreen'

export function ProcessSetupScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [dept, setDept] = useState('영업')
  const [selCode, setSelCode] = useState<string>('OR')
  const [defs, setDefs] = useState<ProcessDefRow[]>(PROCESS_DEFS)

  // 공정 정의 실데이터 (erp_process_def + edge) — form 은 mock 보강 (DB 미보유 컬럼)
  useEffect(() => {
    void processDefService.get().then((r) => {
      if (!r || r.defs.length === 0) return
      const codeOf = new Map(r.defs.map((d) => [d.id, d.code]))
      setDefs(r.defs.map((d) => {
        const mock = PROCESS_DEFS.find((m) => m.code === d.code)
        return {
          code: d.code, name: d.name, dept: d.dept,
          prev: r.edges.filter((e) => e.to === d.id).map((e) => codeOf.get(e.from)).join(',') || '—',
          next: r.edges.filter((e) => e.from === d.id).map((e) => codeOf.get(e.to)).join(',') || '—',
          form: mock?.form ?? '—',
          auto: d.auto,
          // 규칙 컬럼은 DB 미보유 — mock 보강 (고객 협의 후 스키마 확장 대상)
          precondition: mock?.precondition ?? '—',
          deadlineRule: mock?.deadlineRule ?? '—',
          ownerRule: mock?.ownerRule ?? '—',
        }
      }))
      shell.setStatusMsg(`공정 정의 로드 — ${r.defs.length}건 (erp_process_def·edge ${r.edges.length})`)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sel = defs.find((d) => d.code === selCode) ?? null
  const rows = defs.filter((d) => dept === '전체' || d.dept === dept
    || (dept === '영업' && d.dept === '기술'))  // 영업 맵은 연결 프로세스(PL) 포함 표시

  const save = () => {
    shell.setStatusMsg(
      <span style={{ color: 'var(--warn)' }}>저장 → Platform 승인 대기 (System DB 영향 변경)</span>,
    )
  }

  useFKeys(active, useMemo(() => ({ F12: save }), [])) // eslint-disable-line react-hooks/exhaustive-deps

  const setSel = (patch: Partial<ProcessDefRow>) => {
    setDefs((prev) => prev.map((d) => (d.code === selCode ? { ...d, ...patch } : d)))
  }

  const cols: GridColumn<ProcessDefRow>[] = [
    { key: 'code', header: 'Code', width: 44, align: 'center', code: true, render: (r) => r.code },
    { key: 'name', header: t('procset.processName', '프로세스명'), render: (r) => r.name },
    { key: 'dept', header: t('dash.dept', '부서'), width: 44, align: 'center', render: (r) => r.dept },
    { key: 'prev', header: t('procset.prev', '선행'), width: 50, align: 'center', code: true, render: (r) => r.prev },
    { key: 'next', header: t('procset.next', '후행'), width: 64, align: 'center', code: true, render: (r) => r.next },
    { key: 'form', header: t('procset.form', '처리 Form'), width: 110, render: (r) => r.form },
    {
      key: 'auto', header: t('procset.auto', '자동'), width: 110, align: 'center',
      render: (r) => (r.auto
        ? <Chip tone="ok">{t('procset.autoTransition', '☑ Run·이벤트 전이')}</Chip>
        : <span style={{ color: 'var(--txt-mute)' }}>☐</span>),
    },
  ]

  return (
    <div className="fill-col">
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 168, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <GroupBox title={t('dash.dept', '부서')} noPad>
            <div className="tree2">
              {DEPTS.map((d) => (
                <div key={d.dept} className={`tn l2 ${dept === d.dept ? 'sel' : ''}`}
                  onClick={() => setDept(d.dept)}>
                  <span className="pm">·</span>{d.dept} ({d.count})
                </div>
              ))}
            </div>
          </GroupBox>
          <GroupBox title={t('procset.caution', '주의')}>
            <div style={{ fontSize: 10, color: 'var(--err)', lineHeight: 1.7 }}>
              {t('procset.cautionText', '※ System DB에 영향을 주는 변경은 Platform 승인 필요')}
            </div>
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
          <GroupBox title={t('procset.processMap', '프로세스 맵 — {n}').replace('{n}', dept)}>
            <div className="flow">
              {PROCESS_FLOW_1.map((f, i) => (
                <span key={f.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span className={`fs ${f.st}`} style={{ cursor: 'pointer' }}
                    onClick={() => setSelCode(f.code.split(' ')[0])}>
                    {FLOW_STEP_KEYS[f.code] ? t(FLOW_STEP_KEYS[f.code], f.code) : f.code}
                  </span>
                  {i < PROCESS_FLOW_1.length - 1 ? <span className="ar">→</span> : null}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 3 }}>
              {t('procset.mapHint', '노드 선택 → 하단 정의 편집 · 초기 적재 40종 (슬라이드 10) 테넌트별 커스터마이징')}
            </div>
          </GroupBox>
          <GroupBox title={t('procset.defTitle', '프로세스 정의 (erp_process_def / erp_process_edge)')} noPad>
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.code}
              selectedKey={selCode} onRowClick={(r) => setSelCode(r.code)} />
          </GroupBox>
          {sel ? (
            <GroupBox title={t('procset.editDef', '정의 편집 — {n}').replace('{n}', `${sel.code} ${sel.name}`)}>
              <div className="frm">
                <label>{t('procset.precondition', '선행 조건')}</label>
                <input className="in" value={sel.precondition} aria-label="선행 조건"
                  onChange={(e) => setSel({ precondition: e.target.value })} />
                <label>{t('procset.deadlineRule', '기한 규칙')}</label>
                <input className="in" value={sel.deadlineRule} aria-label="기한 규칙"
                  onChange={(e) => setSel({ deadlineRule: e.target.value })} />
                <label>{t('procset.ownerRule', '담당 규칙')}</label>
                <Combo value={sel.ownerRule}
                  options={[
                    { value: 'Project 담당자', label: t('procset.ownerProject', 'Project 담당자') },
                    { value: '부서장', label: t('procset.ownerDeptHead', '부서장') },
                    { value: '기술 담당', label: t('procset.ownerTech', '기술 담당') },
                    { value: '구매 담당', label: t('procset.ownerPurchase', '구매 담당') },
                  ]}
                  onChange={(v) => setSel({ ownerRule: v })} />
                <label>{t('procset.form', '처리 Form')}</label>
                <Combo value={sel.form}
                  options={[
                    { value: '수주 Form v2', label: t('procset.formOrder', '수주 Form v2') },
                    { value: '승인도서 Form', label: t('procset.formApproval', '승인도서 Form') },
                    { value: '발주요청 Form', label: t('procset.formPr', '발주요청 Form') },
                    '-',
                  ]}
                  onChange={(v) => setSel({ form: v })} />
              </div>
              <div style={{ textAlign: 'right', marginTop: 6 }}>
                <Btn variant="pri" onClick={save}>{t('procset.saveApprovalF12', '저장 → 승인 요청 F12')}</Btn>
              </div>
            </GroupBox>
          ) : null}
        </div>
        <div className="split-h" />
        <div className="side-scroll" style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GroupBox title="DB Set-up (5-2)">
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
              {t('procset.dbSetupHint', '프로세스별 데이터 항목 정의')}<br />
              (<code style={{ fontSize: 10 }}>erp_process_event.data</code> {t('procset.jsonbSchema', 'JSONB 스키마')})
            </div>
          </GroupBox>
          <GroupBox title="Form Set-up (5-3)">
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
              {t('procset.formSetupHint', '처리 화면은 EDIM Toolbox UI Form 연결')}<br />→ M-14-9 · TBX-003
            </div>
          </GroupBox>
          <GroupBox title={t('procset.notifyRule', '알림 규칙')}>
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
              {t('procset.notifyHint1', '상태 전이 시 알림 대상 설정')}<br />
              {t('procset.notifyHint2', '기한 초과 → 이상 경고 (Dashboard 집계)')}
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
