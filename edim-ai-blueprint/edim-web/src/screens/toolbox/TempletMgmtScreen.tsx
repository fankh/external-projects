/** S-2-3 Templet 관리 (B13) — 동작/데이터/양식 Templet 대장 + JSON 정의 편집.
 *  tbx_templet 실 CRUD — 저장 = DRAFT 회귀, 승인 요청은 범용 승인 API (TBX-002). */
import { useEffect, useMemo, useState } from 'react'
import { approvalService, templetService, type TempletRow } from '../../api/services'
import { Btn, Chip, Combo, Fx, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function TempletMgmtScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { setStatusMsg } = shell
  const [rows, setRows] = useState<TempletRow[]>([])
  const [offline, setOffline] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [defText, setDefText] = useState('')
  const [ttype, setTtype] = useState('COMMAND')
  const [dirty, setDirty] = useState(false)

  const load = async () => {
    const r = await templetService.list()
    if (r === null) { setOffline(true); return }
    setRows(r)
    if (r.length && !sel) selectRow(r[0])
  }
  const selectRow = (r: TempletRow) => {
    setSel(r.name)
    setTtype(r.templetType)
    setDefText(JSON.stringify(r.definition, null, 2))
    setDirty(false)
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (!sel) {
      setStatusMsg('저장 — Templet 을 선택하거나 신규 이름을 입력하십시오')
      return
    }
    let def: Record<string, unknown>
    try {
      def = JSON.parse(defText || '{}') as Record<string, unknown>
    } catch {
      setStatusMsg(<span style={{ color: 'var(--err)' }}>정의 JSON 구문 오류 — 저장 불가</span>)
      return
    }
    void (async () => {
      try {
        if (!await templetService.save(sel, ttype, def)) {
          setStatusMsg(<span style={{ color: 'var(--err)' }}>저장 불가 — 백엔드 연결 필요</span>)
          return
        }
        await load()
        setDirty(false)
        setStatusMsg(`Templet 저장 ✓ — ${sel} (DRAFT 회귀 · 승인 후 게시)`)
      } catch (e) {
        setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '저장 실패'}</span>)
      }
    })()
  }

  const requestApproval = () => {
    if (!sel) return
    void approvalService.request('tbx_templet', `Templet 승인 — ${sel} (${ttype})`)
      .then((ok) => setStatusMsg(ok
        ? `승인 요청 ✓ — ${sel} (승인함 M-15-2 등록)`
        : <span style={{ color: 'var(--err)' }}>승인 요청 불가 — 백엔드 연결 필요</span>))
  }

  const newTemplet = () => {
    const name = `TPL-${Date.now() % 10000}`
    setSel(name)
    setTtype('COMMAND')
    setDefText(JSON.stringify({ action: '', target: '' }, null, 2))
    setDirty(true)
    setStatusMsg(`신규 Templet — ${name} (정의 편집 후 F12 저장)`)
  }

  useFKeys(active, useMemo(() => ({
    F2: newTemplet,
    F8: () => { void load(); setStatusMsg('Templet 재조회 (tbx_templet)') },
    F12: save,
  }), [sel, ttype, defText])) // eslint-disable-line react-hooks/exhaustive-deps

  const cols: GridColumn<TempletRow>[] = [
    { key: 'name', header: 'Templet', width: 100, code: true, render: (r) => r.name },
    { key: 'type', header: '유형', width: 70, align: 'center', render: (r) => r.templetType },
    {
      key: 'st', header: '상태', width: 70, align: 'center',
      render: (r) => <Chip tone={r.status === 'APPROVED' ? 'ok' : 'warn'}>{r.status}</Chip>,
    },
    { key: 'sys', header: 'Sys', width: 34, align: 'center', render: (r) => (r.system ? '☑' : '') },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          Templet = UI Designer 위젯 동작·데이터 바인딩·양식의 재사용 단위 (TBX-002)
        </span>
        <span style={{ flex: 1 }} />
        {dirty ? <Chip tone="warn">미저장</Chip> : null}
        <Btn onClick={newTemplet}>＋ 신규 F2</Btn>
        <Btn variant="pri" onClick={save}>저장 F12</Btn>
        <Btn variant="run" onClick={requestApproval}>승인 요청</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox title={`Templet 대장 — ${rows.length}건`} noPad style={{ width: 300, flex: 'none' }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>
              백엔드 연결 필요 — Templet 은 실DB(tbx_templet)에서만 조회됩니다
            </div>
          ) : (
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.name}
              selectedKey={sel} onRowClick={selectRow} />
          )}
        </GroupBox>
        <div className="split-h" />
        <div className="fill-col" style={{ flex: 1, gap: 6 }}>
          <GroupBox title={sel ? `정의 편집 — ${sel}` : '정의 편집'} right={
            <Combo width={100} value={ttype} options={['COMMAND', 'DATA', 'FORM']}
              onChange={(v) => { setTtype(v); setDirty(true) }} />
          }>
            <textarea className="in" spellCheck={false} aria-label="Templet 정의"
              style={{
                width: '100%', height: 220, fontFamily: 'Consolas, monospace', fontSize: 11,
                resize: 'vertical',
              }}
              value={defText}
              onChange={(e) => { setDefText(e.target.value); setDirty(true) }} />
            <div style={{ fontSize: 10, color: 'var(--txt-mute)', marginTop: 3 }}>
              JSONB definition — 저장 시 DRAFT 회귀, 승인(M-15-2) 후 위젯 바인딩 가능
            </div>
          </GroupBox>
          <GroupBox title="바인딩 문법">
            <Fx>{'Button → { action, target, data }  ·  Combo → { table, binding, keyColumn }  ·  Form → { form, placeholders[] }'}</Fx>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
