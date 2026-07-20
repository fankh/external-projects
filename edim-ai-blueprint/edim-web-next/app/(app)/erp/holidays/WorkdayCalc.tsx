'use client'

/** 영업일 계산기 (M-8-6) — 구간 영업일 수(/calendar/workdays)·N영업일 후 납기(/calendar/due).
 *  주말·공휴일 제외 — 등록된 공휴일이 실계산에 반영됨을 화면에서 확인하는 용도. */
import { useState, useTransition } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { calcDue, calcWorkdays } from './actions'

export function WorkdayCalc() {
  const { t } = useI18n()
  const today = new Date().toISOString().slice(0, 10)
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [days, setDays] = useState('5')
  const [out, setOut] = useState<{ text: string; err?: boolean } | null>(null)
  const [pending, startT] = useTransition()

  return (
    <div data-workday-calc style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 8px', fontSize: 11, flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
      <b style={{ color: 'var(--title-navy)' }}>{t('cal.calcTitle', '영업일 계산기')}</b>
      <input className="in" type="date" value={start} aria-label="시작일" onChange={(e) => setStart(e.target.value)} style={{ height: 20, fontSize: 10.5 }} />
      <span>→</span>
      <input className="in" type="date" value={end} aria-label="종료일" onChange={(e) => setEnd(e.target.value)} style={{ height: 20, fontSize: 10.5 }} />
      <button className="b" data-calc-workdays disabled={pending} onClick={() => startT(async () => {
        const r = await calcWorkdays(start, end)
        setOut(r.error ? { text: r.error, err: true } : { text: `${t('cal.workdaysOut', '영업일')} ${r.workdays}${t('cal.dayUnit', '일')} (${start} → ${end})` })
      })}>{t('cal.calcRange', '구간 영업일')}</button>
      <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)' }} />
      <input className="in" value={days} aria-label="영업일 수" onChange={(e) => setDays(e.target.value)} style={{ width: 44, height: 20, fontSize: 10.5, textAlign: 'right' }} />
      <button className="b" data-calc-due disabled={pending} onClick={() => startT(async () => {
        const r = await calcDue(start, Number(days) || 0)
        setOut(r.error ? { text: r.error, err: true } : { text: `${t('cal.dueOut', '납기')} ${r.due} (${start} + ${days}${t('cal.workdayUnit', '영업일')})` })
      })}>{t('cal.calcDue', 'N영업일 후 납기')}</button>
      {out ? <span data-calc-out style={{ color: out.err ? 'var(--err)' : 'var(--run)', fontWeight: 600 }}>{out.text}</span> : null}
      <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>{t('cal.calcHint', '주말·등록 공휴일 제외')}</span>
    </div>
  )
}
