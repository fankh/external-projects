'use client'

/** U17 설계우선순위 테이블 (슬라이드 44, S-4-1-2) — 치수별 설계/자료 우선순위·기준점·오류체크 편집. */
import { useState, useTransition } from 'react'
import { GroupBox, Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { runErrorCheck, saveDesignParams, type DesignParamRow, type ErrorCheckResult } from './actions'

export function DesignPriorityPanel({ code, initial }: { code: string; initial: DesignParamRow[] }) {
  const { t } = useI18n()
  const [rows, setRows] = useState<DesignParamRow[]>(initial)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [chk, setChk] = useState<ErrorCheckResult | null>(null)
  const [pending, start] = useTransition()

  const patch = (no: string, p: Partial<DesignParamRow>) => {
    setRows((rs) => rs.map((r) => (r.no === no ? { ...r, ...p } : r)))
    setDirty(true)
    setChk(null)   // 편집하면 이전 점검 결과는 무효 — 재점검 유도
  }
  const save = () => start(async () => {
    const r = await saveDesignParams(code, rows)
    if (r.error) { setMsg({ text: r.error, err: true }); return }
    setDirty(false); setMsg({ text: `설계 파라미터 저장 ✓ — ${rows.length}행 (${code})` })
  })
  // U17 잔여 — 오류조건 위반 판정 (저장된 식·현재 치수값 기준)
  const check = () => start(async () => {
    const r = await runErrorCheck(code)
    if (r.error) { setMsg({ text: r.error, err: true }); return }
    setMsg(null); setChk(r.result ?? null)
  })
  const violated = new Set((chk?.violations ?? []).map((v) => v.no))
  const uneval = new Set((chk?.unevaluated ?? []).map((v) => v.no))
  const numIn = (r: DesignParamRow, key: 'designPriority' | 'dataPriority') => (
    <input className="in" type="number" value={r[key] ?? ''} style={{ width: 44, height: 17, fontSize: 10, textAlign: 'right' }}
      onChange={(e) => patch(r.no, { [key]: e.target.value === '' ? null : Number(e.target.value) } as Partial<DesignParamRow>)} />
  )
  const txtIn = (r: DesignParamRow, key: 'basePoint' | 'errorCheck' | 'remarks', w: number, ph = '') => (
    <input className="in" value={(r[key] as string) ?? ''} placeholder={ph} style={{ width: w, height: 17, fontSize: 10 }}
      onChange={(e) => patch(r.no, { [key]: e.target.value } as Partial<DesignParamRow>)} />
  )

  if (!rows.length) return null
  return (
    <GroupBox title={`${t('wp.designPriorityTitle', '설계우선순위 (슬라이드 44)')} — ${code}`} noPad
      right={
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <button className="b" data-dp-check disabled={pending} style={{ height: 18, fontSize: 10 }} onClick={check}
            title={t('wp.dpCheckTip', '저장된 오류조건 식을 현재 치수값으로 평가')}>
            {t('wp.dpCheck', '오류조건 점검')}
          </button>
          <button className="b run" data-dp-save disabled={!dirty || pending} style={{ height: 18, fontSize: 10 }} onClick={save}>{t('common.save', '저장')}</button>
        </span>
      }>
      {chk ? (
        <div data-dp-check-result style={{ padding: '4px 6px', fontSize: 10, lineHeight: 1.6,
          background: chk.violations.length ? 'var(--err-bg, #FDECEC)' : 'var(--panel, #F4F6FA)',
          borderBottom: '1px solid var(--line)' }}>
          {chk.violations.length ? (
            <>
              <b style={{ color: 'var(--err)' }}>⚠ {t('wp.dpViolation', '설계 오류조건 위반')} {chk.violations.length}건</b>
              {chk.violations.map((v) => (
                <div key={v.no} data-dp-violation>· <b>{v.no}</b> — {v.rule} ({v.detail})</div>
              ))}
            </>
          ) : !chk.found ? (
            // '점검하지 않음' 을 '이상 없음' 으로 보이게 하지 않는다
            <span data-dp-notfound style={{ color: 'var(--warn, #B4820B)' }}>
              {t('wp.dpNotFound', '도면을 찾을 수 없어 점검하지 못했습니다')} — {chk.drawing}
            </span>
          ) : chk.checked === 0 ? (
            <span data-dp-norule style={{ color: 'var(--txt-mute)' }}>
              {t('wp.dpNoRule', '설정된 오류조건이 없습니다 — 오류 체크 열에 조건식을 입력하고 저장하십시오')}
            </span>
          ) : (
            <span style={{ color: 'var(--run)' }}>✓ {t('wp.dpNoViolation', '오류조건 위반 없음')} — {t('wp.dpChecked', '점검')} {chk.checked}건</span>
          )}
          {chk.unevaluated.length ? (
            <div style={{ color: 'var(--txt-mute)', marginTop: 2 }}>
              {t('wp.dpUneval', '미평가')} {chk.unevaluated.length}건: {chk.unevaluated.map((u) => `${u.no}(${u.detail})`).join(' · ')}
            </div>
          ) : null}
        </div>
      ) : null}
      <div data-design-priority style={{ overflow: 'auto' }}>
        <table className="g" style={{ width: '100%', fontSize: 10 }}>
          <thead><tr>
            <th>Dim.</th><th>{t('wp.dpKind', '구분')}</th>
            <th>{t('wp.dpPriority', '설계우선 순위')}</th><th>{t('wp.dpUpper', '상위설계 우선자료')}</th>
            <th>{t('wp.dpBase', '설계 기준점 설정')}</th><th>{t('wp.dpError', '설계 오류 체크')}</th><th>{t('wp.remarksCol', '비고')}</th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.no} {...(violated.has(r.no) ? { 'data-dp-row-violation': true } : {})}
              style={violated.has(r.no) ? { background: 'var(--err-bg, #FDECEC)' } : undefined}>
              <td className="c code">
                {violated.has(r.no) ? <span title={t('wp.dpViolation', '설계 오류조건 위반')} style={{ color: 'var(--err)' }}>⚠ </span>
                  : uneval.has(r.no) ? <span title={t('wp.dpUneval', '미평가')} style={{ color: 'var(--txt-mute)' }}>· </span> : null}
                {r.no}
              </td>
              <td className="c"><Chip tone={r.kind === 'KEY' ? 'info' : 'ok'}>{r.kind}</Chip></td>
              <td className="c">{numIn(r, 'designPriority')}</td>
              <td className="c">{numIn(r, 'dataPriority')}</td>
              <td>{txtIn(r, 'basePoint', 130, 'Inlet Cone – Bearing')}</td>
              <td>{txtIn(r, 'errorCheck', 90, '④ > 300')}</td>
              <td>{txtIn(r, 'remarks', 110)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {msg ? <div style={{ padding: 4, fontSize: 10, color: msg.err ? 'var(--err)' : 'var(--run)' }}>{msg.text}</div> : null}
    </GroupBox>
  )
}
