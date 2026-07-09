/** M-14-7 ERP Process Set-up (W-14, 슬라이드 17·10) — erp_process_def 커스터마이징 ·
 *  System DB 영향 변경은 Platform 승인 필요. */
import { useMemo, useState } from 'react'
import { DEPTS, PROCESS_DEFS, PROCESS_FLOW_1, type ProcessDefRow } from '../../api/mock/dataErp'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function ProcessSetupScreen({ active }: ScreenProps) {
  const shell = useShell()
  const [dept, setDept] = useState('영업')
  const [selCode, setSelCode] = useState<string>('OR')
  const [defs, setDefs] = useState<ProcessDefRow[]>(PROCESS_DEFS)

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
    { key: 'name', header: '프로세스명', render: (r) => r.name },
    { key: 'dept', header: '부서', width: 44, align: 'center', render: (r) => r.dept },
    { key: 'prev', header: '선행', width: 50, align: 'center', code: true, render: (r) => r.prev },
    { key: 'next', header: '후행', width: 64, align: 'center', code: true, render: (r) => r.next },
    { key: 'form', header: '처리 Form', width: 110, render: (r) => r.form },
    {
      key: 'auto', header: '자동', width: 110, align: 'center',
      render: (r) => (r.auto
        ? <Chip tone="ok">☑ Run·이벤트 전이</Chip>
        : <span style={{ color: 'var(--txt-mute)' }}>☐</span>),
    },
  ]

  return (
    <div className="fill-col">
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 168, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <GroupBox title="부서" noPad>
            <div className="tree2">
              {DEPTS.map((d) => (
                <div key={d.dept} className={`tn l2 ${dept === d.dept ? 'sel' : ''}`}
                  onClick={() => setDept(d.dept)}>
                  <span className="pm">·</span>{d.dept} ({d.count})
                </div>
              ))}
            </div>
          </GroupBox>
          <GroupBox title="주의">
            <div style={{ fontSize: 10, color: 'var(--err)', lineHeight: 1.7 }}>
              ※ System DB에 영향을 주는 변경은 Platform 승인 필요
            </div>
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
          <GroupBox title={`프로세스 맵 — ${dept}`}>
            <div className="flow">
              {PROCESS_FLOW_1.map((f, i) => (
                <span key={f.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span className={`fs ${f.st}`} style={{ cursor: 'pointer' }}
                    onClick={() => setSelCode(f.code.split(' ')[0])}>{f.code}</span>
                  {i < PROCESS_FLOW_1.length - 1 ? <span className="ar">→</span> : null}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 3 }}>
              노드 선택 → 하단 정의 편집 · 초기 적재 40종 (슬라이드 10) 테넌트별 커스터마이징
            </div>
          </GroupBox>
          <GroupBox title="프로세스 정의 (erp_process_def / erp_process_edge)" noPad>
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.code}
              selectedKey={selCode} onRowClick={(r) => setSelCode(r.code)} />
          </GroupBox>
          {sel ? (
            <GroupBox title={`정의 편집 — ${sel.code} ${sel.name}`}>
              <div className="frm">
                <label>선행 조건</label>
                <input className="in" value={sel.precondition} aria-label="선행 조건"
                  onChange={(e) => setSel({ precondition: e.target.value })} />
                <label>기한 규칙</label>
                <input className="in" value={sel.deadlineRule} aria-label="기한 규칙"
                  onChange={(e) => setSel({ deadlineRule: e.target.value })} />
                <label>담당 규칙</label>
                <Combo value={sel.ownerRule} options={['Project 담당자', '부서장', '기술 담당', '구매 담당']}
                  onChange={(v) => setSel({ ownerRule: v })} />
                <label>처리 Form</label>
                <Combo value={sel.form} options={['수주 Form v2', '승인도서 Form', '발주요청 Form', '-']}
                  onChange={(v) => setSel({ form: v })} />
              </div>
              <div style={{ textAlign: 'right', marginTop: 6 }}>
                <Btn variant="pri" onClick={save}>저장 → 승인 요청 F12</Btn>
              </div>
            </GroupBox>
          ) : null}
        </div>
        <div className="split-h" />
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="DB Set-up (5-2)">
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
              프로세스별 데이터 항목 정의<br />
              (<code style={{ fontSize: 10 }}>erp_process_event.data</code> JSONB 스키마)
            </div>
          </GroupBox>
          <GroupBox title="Form Set-up (5-3)">
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
              처리 화면은 EDIM Toolbox UI Form 연결<br />→ M-14-9 · TBX-003
            </div>
          </GroupBox>
          <GroupBox title="알림 규칙">
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
              상태 전이 시 알림 대상 설정<br />
              기한 초과 → 이상 경고 (Dashboard 집계)
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
