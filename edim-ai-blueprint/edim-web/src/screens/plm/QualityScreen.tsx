/** M-4-5 PLM Quality (B13-2) — 도면 검증 Macro 규칙 (dwg_verification 실 CRUD).
 *  Run/Design Editor 평가 시 규칙 위반 → warning_message 경고 (DWG-018). */
import { useEffect, useMemo, useState } from 'react'
import { verificationService, type VerificationRow } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const DRAWING = 'KDCR 3-13'

export function QualityScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { setStatusMsg } = shell
  const [rows, setRows] = useState<VerificationRow[]>([])
  const [offline, setOffline] = useState(false)
  const [add, setAdd] = useState({ ruleName: '', macroName: 'DIM B (KDCR 3-13)', warning: '' })

  const load = async () => {
    const r = await verificationService.list(DRAWING)
    if (r === null) { setOffline(true); return }
    setOffline(false)
    setRows(r)
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const register = () => {
    if (!add.ruleName.trim() || !add.warning.trim()) {
      setStatusMsg(<span style={{ color: 'var(--err)' }}>필수(노란 셀) — 규칙명·경고 문구</span>)
      return
    }
    void (async () => {
      try {
        if (!await verificationService.add(DRAWING, add)) {
          setStatusMsg(<span style={{ color: 'var(--err)' }}>등록 불가 — 백엔드 연결 필요</span>)
          return
        }
        await load()
        setStatusMsg(`검증 규칙 등록 ✓ — ${add.ruleName} (dwg_verification)`)
        setAdd({ ruleName: '', macroName: 'DIM B (KDCR 3-13)', warning: '' })
      } catch (e) {
        setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '등록 실패'}</span>)
      }
    })()
  }

  useFKeys(active, useMemo(() => ({
    F8: () => { void load(); setStatusMsg('검증 규칙 재조회 (dwg_verification)') },
  }), [])) // eslint-disable-line react-hooks/exhaustive-deps

  const cols: GridColumn<VerificationRow>[] = [
    { key: 'rule', header: '검증 규칙', width: 140, render: (r) => r.rule },
    { key: 'macro', header: 'Macro', width: 130, code: true, render: (r) => r.macro },
    { key: 'warn', header: '경고 문구', render: (r) => r.warning },
    {
      key: 'act', header: '활성', width: 44, align: 'center',
      render: (r) => (r.active ? <Chip tone="ok">ON</Chip> : <Chip tone="warn">OFF</Chip>),
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>도면</label>
        <input className="in ro" style={{ width: 110, fontFamily: 'Consolas, monospace' }}
          value={DRAWING} readOnly aria-label="도면" />
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          검증 Macro = 치수 평가 후 규칙 위반 시 경고 (● 검증 Macro — Design Editor 범례와 동일 도메인)
        </span>
        <span style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox title={`검증 규칙 — ${rows.length}건 (DWG-018)`} noPad style={{ flex: 1 }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>
              백엔드 연결 필요 — 검증 규칙은 실DB(dwg_verification)에서만 조회됩니다
            </div>
          ) : (
            <DenseGrid columns={cols} rows={rows} rowKey={(_, i) => i} />
          )}
        </GroupBox>
        <div className="split-h" />
        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="규칙 등록">
            <div className="frm c2">
              <label>규칙명 *</label>
              <input className="in req" value={add.ruleName} aria-label="규칙명"
                onChange={(e) => setAdd({ ...add, ruleName: e.target.value })} />
              <label>Macro</label>
              <input className="in" value={add.macroName} aria-label="검증 Macro"
                onChange={(e) => setAdd({ ...add, macroName: e.target.value })} />
              <label>경고 문구 *</label>
              <input className="in req" value={add.warning} aria-label="경고 문구"
                onChange={(e) => setAdd({ ...add, warning: e.target.value })} />
            </div>
            <div style={{ textAlign: 'right', marginTop: 6 }}>
              <Btn variant="pri" onClick={register}>등록 F12</Btn>
            </div>
          </GroupBox>
          <GroupBox title="동작 방식">
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
              치수 Macro 평가(F9/Run) → 바인딩 Macro 값 산출 →<br />
              규칙 위반 시 warning_message 를 Run 로그·상태바에 경고<br />
              Macro 는 Macro Studio(S-2-2) 라이브러리에서 참조
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
