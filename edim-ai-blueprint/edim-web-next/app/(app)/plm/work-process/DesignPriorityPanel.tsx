'use client'

/** U17 설계우선순위 테이블 (슬라이드 44, S-4-1-2) — 치수별 설계/자료 우선순위·기준점·오류체크 편집. */
import { useState, useTransition } from 'react'
import { GroupBox, Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { saveDesignParams, type DesignParamRow } from './actions'

export function DesignPriorityPanel({ code, initial }: { code: string; initial: DesignParamRow[] }) {
  const { t } = useI18n()
  const [rows, setRows] = useState<DesignParamRow[]>(initial)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [pending, start] = useTransition()

  const patch = (no: string, p: Partial<DesignParamRow>) => {
    setRows((rs) => rs.map((r) => (r.no === no ? { ...r, ...p } : r)))
    setDirty(true)
  }
  const save = () => start(async () => {
    const r = await saveDesignParams(code, rows)
    if (r.error) { setMsg({ text: r.error, err: true }); return }
    setDirty(false); setMsg({ text: `설계 파라미터 저장 ✓ — ${rows.length}행 (${code})` })
  })
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
      right={<button className="b run" data-dp-save disabled={!dirty || pending} style={{ height: 18, fontSize: 10 }} onClick={save}>{t('common.save', '저장')}</button>}>
      <div data-design-priority style={{ overflow: 'auto' }}>
        <table className="g" style={{ width: '100%', fontSize: 10 }}>
          <thead><tr>
            <th>Dim.</th><th>{t('wp.dpKind', '구분')}</th>
            <th>{t('wp.dpPriority', '설계우선 순위')}</th><th>{t('wp.dpUpper', '상위설계 우선자료')}</th>
            <th>{t('wp.dpBase', '설계 기준점 설정')}</th><th>{t('wp.dpError', '설계 오류 체크')}</th><th>{t('wp.remarksCol', '비고')}</th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.no}>
              <td className="c code">{r.no}</td>
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
