/** C-3 CPQ Document Template (W-17, 슬라이드 8) — Input→Macro 계산→Output ·
 *  습공기 선도 · Print Form 출력. Density mock 계산 실동작. */
import { useMemo, useState } from 'react'
import { renderService } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { Cvs } from '../../components/Cvs'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

/** 건공기 밀도 근사 — 승인 Macro(TBX-011) 실행 mock */
function density(tempC: number, humidity: number): number {
  const rho = 353.05 / (273.15 + tempC) * (1 - 0.0035 * (humidity - 50) / 50)
  return Math.round(rho * 1000) / 1000
}

export function DocTemplateScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [temp, setTemp] = useState('20')
  const [humid, setHumid] = useState('50')
  const [rho, setRho] = useState<number | null>(1.204)

  const calc = () => {
    const t = Number(temp)
    const h = Number(humid)
    if (Number.isNaN(t) || Number.isNaN(h)) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>숫자 입력 필요</span>)
      return
    }
    const r = density(t, h)
    setRho(r)
    shell.setStatusMsg(`Macro 계산 ✓ — Density ${r} kg/m³ (승인 Macro 실행, TBX-011)`)
  }

  useFKeys(active, useMemo(() => ({ F9: calc }), [temp, humid])) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Project</label>
        <Combo width={110} value={shell.activeProject?.name ?? 'Micron #7'}
          options={[shell.activeProject?.name ?? 'Micron #7']} />
        <label>Document</label>
        <Combo width={130} value="밀도 계산서" options={[
          { value: '밀도 계산서', label: t('doctpl.densityCalcDoc', '밀도 계산서') },
          { value: 'Fan 성능 Report', label: t('doctpl.fanPerfReport', 'Fan 성능 Report') },
        ]} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          {t('doctpl.formDef', 'Form 정의: Document Set-up S-3-3 (CPQ-012)')}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
          <GroupBox title={t('doctpl.inputOutput', 'Input Data → Output Data (Macro 계산)')}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 600 }}>Temperature<i style={{ color: 'var(--err)', fontStyle: 'normal' }}>*</i></label>
              <input className="in req" style={{ width: 64 }} value={temp} aria-label="Temperature"
                onChange={(e) => setTemp(e.target.value)} />
              <span className="unit">℃</span>
              <label style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 600 }}>Humidity<i style={{ color: 'var(--err)', fontStyle: 'normal' }}>*</i></label>
              <input className="in req" style={{ width: 64 }} value={humid} aria-label="Humidity"
                onChange={(e) => setHumid(e.target.value)} />
              <span className="unit">%</span>
              <Btn variant="run" onClick={calc}>{t('doctpl.macroCalcF9', '▶ Macro 계산 F9')}</Btn>
              <span style={{ color: 'var(--txt-mute)' }}>→</span>
              <label style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 600 }}>Density</label>
              <input className="in ro" style={{ width: 76, border: '1.5px solid var(--err)', textAlign: 'right' }}
                value={rho ?? ''} readOnly aria-label="Density" />
              <span className="unit">kg/m³</span>
            </div>
          </GroupBox>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, flex: 1, minHeight: 0 }}>
            <GroupBox title={t('doctpl.psychroChart', '습공기 선도 — 계산점 표시 (그래프 Templet)')}>
              <Cvs blocks={rho != null ? [{
                id: 'pt', name: `${temp}℃/${humid}%`, sub: `ρ=${rho}`,
                x: 40 + Number(temp) * 4, y: 150 - Number(humid), w: 74, h: 30,
              }] : []} style={{ height: '100%', minHeight: 180 }} />
            </GroupBox>
            <GroupBox title={t('doctpl.spreadsheet', '스프레드시트 (A~L — 중간 계산)')} noPad>
              <table className="g">
                <thead><tr><th></th><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead>
                <tbody>
                  <tr><td className="c"><b>1</b></td><td>T(K)</td><td className="num">{(Number(temp) + 273.15).toFixed(2)}</td><td>RH</td><td className="num">{humid}%</td></tr>
                  <tr><td className="c"><b>2</b></td><td>P(kPa)</td><td className="num">101.325</td><td>{t('doctpl.correction', '보정')}</td><td className="num">{(1 - 0.0035 * (Number(humid) - 50) / 50).toFixed(4)}</td></tr>
                  <tr><td className="c"><b>3</b></td><td>ρ(kg/m³)</td><td className="num edit">{rho ?? '—'}</td><td></td><td></td></tr>
                </tbody>
              </table>
            </GroupBox>
          </div>
        </div>
        <div className="split-h" />
        <div className="side-scroll" style={{ width: 290, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GroupBox title="Document Code">
            <input className="in ro" style={{ width: '100%', fontFamily: 'Consolas, monospace' }}
              value="EU-3-2020-450-6-21-4-SR-7" readOnly aria-label="Document Code" />
          </GroupBox>
          <GroupBox title={t('doctpl.printPreview', 'Print 미리보기')} right={<Btn style={{ height: 18, fontSize: 10 }}
            onClick={() => {
              // 계산값 포함 실렌더 (SVC-11 — Print Form 규칙)
              void renderService.pdf('Technical Data Sheet — 습공기 밀도', [
                `Temperature: ${temp} ℃`,
                `Humidity: ${humid} %RH`,
                `Density ρ = ${rho ?? '—'} kg/m³ (승인 Macro TBX-011 계산값)`,
                '',
                'Print Form(S-3-4) 표준 Templet · 머리글/바닥글 적용',
              ], { subtitle: 'C-3 Document Templet — Input→Macro→Output 실렌더' })
                .then((url) => {
                  if (url) {
                    window.open(url, '_blank')
                    shell.setStatusMsg(`Print ✓ — Density ${rho} 포함 실렌더 (SVC-11)`)
                  } else {
                    shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>렌더 불가 — 백엔드 연결 필요</span>)
                  }
                })
            }}>🖨</Btn>}>
            <div className="cvs" style={{ height: 150 }}>
              <div style={{ position: 'absolute', inset: 8, border: '1px dashed var(--line)', fontSize: 9.5, color: 'var(--txt-mute)', padding: 6, lineHeight: 1.8 }}>
                Technical Report<br />
                Customer: Micron · Date: 2026-07-09<br />
                Input: {temp}℃ / {humid}% → ρ = <b>{rho ?? '—'}</b><br />
                {t('doctpl.chartTable', '[차트] · [Table]')}
              </div>
            </div>
          </GroupBox>
          <GroupBox title={t('doctpl.calcRefTable', '계산 참조 Table')}>
            <div style={{ fontSize: 11, lineHeight: 1.9 }}>
              psychro_const (Constant) <Chip tone="ok">{t('common.approve', '승인')}</Chip><br />
              Table12 (Variant) <Chip tone="ok">{t('common.approve', '승인')}</Chip>
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
