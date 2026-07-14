/** 근무일/휴일 캘린더 (M-8-6) — cal_holiday CRUD + 영업일 기한 계산기.
 *  마일스톤 지연/기한을 영업일(주말·공휴일 제외) 기준으로 산정하는 기준 데이터. SETUP 이상. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { calendarService, type HolidayRow } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { usePermission } from '../../shell/PermissionContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function HolidayCalendarScreen({ active }: ScreenProps) {
  const shell = useShell()
  const perm = usePermission()
  const { setStatusMsg } = shell
  const [rows, setRows] = useState<HolidayRow[]>([])
  const [offline, setOffline] = useState(false)
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  // 영업일 기한 계산기
  const [calcStart, setCalcStart] = useState(new Date().toISOString().slice(0, 10))
  const [calcDays, setCalcDays] = useState('10')
  const [calcDue, setCalcDue] = useState<string | null>(null)

  const canWrite = perm.canWrite('erp-calendar')
  const load = useCallback(() => {
    void calendarService.holidays().then((r) => {
      if (r === null) { setOffline(true); return }
      setOffline(false); setRows(r)
    })
  }, [])
  useEffect(() => { load() }, [load])

  const add = () => {
    if (!date.trim() || !name.trim()) { setStatusMsg(<span style={{ color: 'var(--err)' }}>필수 — 날짜·명칭</span>); return }
    void calendarService.addHoliday(date.trim(), name.trim())
      .then((okc) => { if (okc) { setDate(''); setName(''); load(); setStatusMsg(`공휴일 등록 ✓ — ${date} ${name}`) } })
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }
  const remove = (r: HolidayRow) => {
    void calendarService.removeHoliday(r.holidayId).then((okc) => { if (okc) { load(); setStatusMsg(`삭제 ✓ — ${r.date}`) } })
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }
  const calc = () => {
    const nd = Number(calcDays)
    if (!calcStart.trim() || Number.isNaN(nd)) { setStatusMsg(<span style={{ color: 'var(--err)' }}>시작일·영업일수 확인</span>); return }
    void calendarService.due(calcStart.trim(), nd).then((r) => {
      setCalcDue(r?.due ?? null)
      if (r) setStatusMsg(`${calcStart} + ${nd}영업일 = ${r.due}`)
    }).catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  useFKeys(active, useMemo(() => ({ F8: load, F2: () => { if (canWrite) document.getElementById('hol-date')?.focus() } }), [load, canWrite]))

  const cols: GridColumn<HolidayRow>[] = [
    { key: 'date', header: '날짜', width: 120, code: true, render: (r) => r.date },
    { key: 'dow', header: '요일', width: 50, align: 'center', render: (r) => ['일', '월', '화', '수', '목', '금', '토'][new Date(r.date).getDay()] },
    { key: 'name', header: '명칭', render: (r) => r.name },
    { key: 'act', header: '', width: 52, align: 'center', noSort: true, render: (r) => <Btn style={{ height: 18, fontSize: 9.5 }} disabled={!canWrite} onClick={() => remove(r)}>삭제</Btn> },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>공휴일 등록</label>
        <input id="hol-date" className="in req" type="date" style={{ width: 140 }} value={date} aria-label="날짜"
          onChange={(e) => setDate(e.target.value)} />
        <input className="in req" style={{ width: 160 }} value={name} placeholder="명칭 (예: 신정)" aria-label="명칭"
          onChange={(e) => setName(e.target.value)} />
        <Btn variant="pri" disabled={!canWrite} onClick={add}>＋ 등록</Btn>
        <span style={{ flex: 1 }} />
        <Btn onClick={load}>조회 F8</Btn>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        <GroupBox title={`공휴일 — ${rows.length}건`} noPad style={{ flex: 1, minHeight: 0 }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>백엔드 연결 필요</div>
          ) : rows.length ? (
            <DenseGrid prefKey="holidays" columns={cols} rows={rows} rowKey={(r) => r.holidayId} />
          ) : (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>등록된 공휴일 없음 — 주말은 자동 제외됩니다</div>
          )}
        </GroupBox>
        <GroupBox title="영업일 기한 계산기" style={{ width: 300, flex: 'none' }}>
          <div style={{ fontSize: 10.5, lineHeight: 2 }}>
            <div style={{ color: 'var(--txt-dim)', marginBottom: 4 }}>시작일 + N영업일 = 납기 (주말·공휴일 제외)</div>
            <div className="frm c2">
              <label>시작일</label>
              <input className="in" type="date" value={calcStart} aria-label="시작일" onChange={(e) => setCalcStart(e.target.value)} />
              <label>영업일 수</label>
              <input className="in" value={calcDays} aria-label="영업일 수" onChange={(e) => setCalcDays(e.target.value)} />
            </div>
            <div style={{ textAlign: 'right', marginTop: 6 }}>
              <Btn variant="pri" onClick={calc}>계산</Btn>
            </div>
            {calcDue ? (
              <div style={{ marginTop: 8, textAlign: 'center' }}>
                <Chip tone="ok">납기: {calcDue}</Chip>
                <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 3 }}>
                  {['일', '월', '화', '수', '목', '금', '토'][new Date(calcDue).getDay()]}요일
                </div>
              </div>
            ) : null}
          </div>
        </GroupBox>
      </div>
    </div>
  )
}
