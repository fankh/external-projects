/** G3 BOM 비교 — 두 코드 구성(code_relationship) diff: 추가/삭제/수량변경/동일.
 *  Rev 스냅샷 부재로 코드 간 비교(구성/개정안 대조)로 제공. */
import { useCallback, useMemo, useState } from 'react'
import { bomService, type BomCompare } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function BomCompareScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [base, setBase] = useState('KDCR 3-13')
  const [target, setTarget] = useState('KAD 900 FW')
  const [res, setRes] = useState<BomCompare | null>(null)

  const run = useCallback(() => {
    if (!base.trim() || !target.trim()) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>기준·대상 코드를 입력하십시오</span>); return }
    void bomService.compare(base.trim(), target.trim()).then((r) => {
      if (!r) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
      setRes(r)
      shell.setStatusMsg(r.identical
        ? `BOM 동일 — ${base} ≡ ${target} (차이 없음)`
        : `BOM 비교 ✓ — 추가 ${r.added.length}·삭제 ${r.removed.length}·변경 ${r.changed.length}·동일 ${r.unchanged}`)
    }).catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [base, target, shell])

  useFKeys(active, useMemo(() => ({ F8: run }), [run]))

  const swap = () => { setBase(target); setTarget(base); setRes(null) }

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('bom.base', '기준(base)')}</label>
        <input className="in" style={{ width: 140 }} value={base} aria-label="기준 코드"
          onChange={(e) => setBase(e.target.value)} />
        <Btn onClick={swap} title="기준/대상 교환">⇄</Btn>
        <label>{t('bom.target', '대상(target)')}</label>
        <input className="in" style={{ width: 140 }} value={target} aria-label="대상 코드"
          onChange={(e) => setTarget(e.target.value)} />
        <span style={{ flex: 1 }} />
        <Btn variant="pri" onClick={run}>{t('bom.compareF8', '비교 F8')}</Btn>
      </div>
      <div className="fill-col" style={{ padding: 6, gap: 6, overflow: 'auto' }}>
        {res ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {[
                { l: t('bom.added', '추가'), v: res.added.length, c: 'var(--ok)' },
                { l: t('bom.removed', '삭제'), v: res.removed.length, c: 'var(--err)' },
                { l: t('bom.changed', '수량변경'), v: res.changed.length, c: 'var(--warn)' },
                { l: t('bom.unchanged', '동일'), v: res.unchanged, c: 'var(--txt-dim)' },
              ].map((k) => (
                <div key={k.l} className="gb" style={{ textAlign: 'center', padding: '8px 6px' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: k.c }}>{k.v}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>{k.l}</div>
                </div>
              ))}
            </div>
            <GroupBox title={t('bom.diffTitle', 'BOM 차이 — {b}({bc}) → {t}({tc})')
              .replace('{b}', res.base).replace('{bc}', String(res.baseCount))
              .replace('{t}', res.target).replace('{tc}', String(res.targetCount))} noPad>
              <table className="g">
                <thead><tr><th>{t('bom.change', '변화')}</th><th>{t('bom.code', '코드')}</th><th>{t('bom.name', '품명')}</th><th>{t('bom.qty', '수량')}</th></tr></thead>
                <tbody>
                  {res.added.map((r) => (
                    <tr key={`a-${r.code}`}><td className="c"><Chip tone="ok">＋추가</Chip></td><td className="code">{r.code}</td><td>{r.name}</td><td className="num">{r.qty}</td></tr>
                  ))}
                  {res.removed.map((r) => (
                    <tr key={`r-${r.code}`}><td className="c"><Chip tone="err">－삭제</Chip></td><td className="code">{r.code}</td><td>{r.name}</td><td className="num">{r.qty}</td></tr>
                  ))}
                  {res.changed.map((r) => (
                    <tr key={`c-${r.code}`}><td className="c"><Chip tone="warn">≠변경</Chip></td><td className="code">{r.code}</td><td>{r.name}</td><td className="num" style={{ color: 'var(--warn)' }}>{r.baseQty} → {r.targetQty}</td></tr>
                  ))}
                  {res.identical ? (
                    <tr><td className="c" colSpan={4} style={{ color: 'var(--ok)' }}>구성 동일 — 차이 없음</td></tr>
                  ) : null}
                </tbody>
              </table>
            </GroupBox>
          </>
        ) : (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>
            {t('bom.hint', '두 코드의 BOM 구성(하위 code_relationship)을 비교합니다 — F8')}
          </div>
        )}
      </div>
    </div>
  )
}
