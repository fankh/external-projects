/** S-2-1 Toolbox UI Designer (W-08, 슬라이드 27·28) — Widget 팔레트 클릭 배치 ·
 *  Object Inspector · layout_def 저장→승인→게시 (TBX-001~004). */
import { useEffect, useMemo, useState } from 'react'
import { INITIAL_WIDGETS, WIDGET_PALETTE, type Widget } from '../../api/mock/dataMore'
import { aiService, approvalService, uiFormService } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useEditHistory } from '../../shell/useEditHistory'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

let widgetSeq = 5

const FORM_NAME = 'CPQ-Selection'   // 경로 세그먼트 — '/' 는 라우팅 충돌 (%2F 디코딩)

export function UiDesignerScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [widgets, setWidgets] = useState<Widget[]>(INITIAL_WIDGETS)
  const [selId, setSelId] = useState<string | null>('w1')
  const [dirty, setDirty] = useState(false)
  const [version, setVersion] = useState(1)
  const [aiText, setAiText] = useState('')
  const [showPreview, setShowPreview] = useState(false)   // B21 — 동적 렌더 미리보기

  const sel = widgets.find((w) => w.id === selId) ?? null

  // 저장된 layout_def 복원 (tbx_ui_form)
  useEffect(() => {
    void uiFormService.get(FORM_NAME).then((r) => {
      if (r && Array.isArray(r.layout) && r.layout.length) {
        setWidgets(r.layout as Widget[])
        setVersion(r.version)
        widgetSeq = r.layout.length + 5
      }
    })
  }, [])

  const saveLayout = async (): Promise<boolean> => {
    const r = await uiFormService.save(FORM_NAME, widgets)
    if (r) {
      setDirty(false)
      setVersion(r.version)
      shell.setStatusMsg(`레이아웃 저장 ✓ — tbx_ui_form v${r.version} (layout_def JSONB)`)
      return true
    }
    shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>저장 불가 — 백엔드 연결 필요</span>)
    return false
  }

  useFKeys(active, useMemo(() => ({ F12: () => { void saveLayout() } }), [widgets])) // eslint-disable-line react-hooks/exhaustive-deps

  // 위젯 배치 이력 (B12)
  const hist = useEditHistory(active, widgets, setWidgets, (kind) => {
    setDirty(true)
    shell.setStatusMsg(`${kind === 'undo' ? '실행 취소' : '다시 실행'} — 위젯 배치 이력`)
  })

  const addWidget = (kind: string) => {
    hist.push()
    const id = `w${widgetSeq++}`
    setWidgets((prev) => [...prev, {
      id, kind, label: kind,
      x: 30 + (prev.length % 4) * 80, y: 260 - (prev.length % 3) * 40, w: 96, h: 24,
    }])
    setSelId(id)
    setDirty(true)
    shell.setStatusMsg(`위젯 배치 — ${kind} (동작은 Set-up Templet 창에서 연결, TBX-002)`)
  }

  return (
    <div className="fill-col">
      <div className="qband">
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          Form — CPQ / Selection v{version} {dirty ? '*' : ''}
        </span>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => setShowPreview(true)}>{t('common.preview', '미리보기')}</Btn>
        {showPreview ? (
          <div data-ui-preview style={{
            position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => setShowPreview(false)}>
            <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 520, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
              onClick={(e) => e.stopPropagation()}>
              <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
                <b>Form 미리보기 — {FORM_NAME} v{version} (동적 렌더, TBX-003)</b><span className="sp" />
                <span style={{ cursor: 'pointer' }} onClick={() => setShowPreview(false)}>✕</span>
              </div>
              {/* layout_def 를 그대로 렌더 — 배치 좌표·크기·라벨이 실 폼으로 */}
              <div style={{ position: 'relative', height: 340, margin: 10, border: '1px solid var(--line)', background: '#FAFBFC', overflow: 'hidden' }}>
                {widgets.map((w) => (
                  <div key={w.id} style={{ position: 'absolute', left: w.x, top: w.y, width: w.w }}>
                    {w.kind === 'Button' ? <Btn style={{ width: '100%', justifyContent: 'center' }}>{w.label}</Btn>
                      : w.kind === 'Combo' ? (
                        <select className="in" style={{ width: '100%', height: w.h }} aria-label={w.label}>
                          <option>{w.label}</option>
                        </select>
                      ) : w.kind === 'Check' ? (
                        <label style={{ fontSize: 11 }}><input type="checkbox" /> {w.label}</label>
                      ) : (
                        <input className="in" style={{ width: '100%', height: w.h }}
                          placeholder={w.label} aria-label={w.label} />
                      )}
                  </div>
                ))}
              </div>
              <div style={{ padding: '0 10px 10px', fontSize: 10, color: 'var(--txt-mute)' }}>
                위젯 {widgets.length}개 — 게시(승인) 후 처리 Form 으로 사용됩니다 (tbx_ui_form v{version}).
              </div>
            </div>
          </div>
        ) : null}
        <Btn onClick={() => { void saveLayout() }}>{t('uidsn.saveF12', '저장 F12')}</Btn>
        <Btn variant="pri" onClick={() => {
          void (async () => {
            // 게시 = 현재 레이아웃 저장 후 승인 요청 (TBX-004)
            if (!await saveLayout()) return
            const ok = await approvalService.request(
              'tbx_ui_form', `UI Form 게시 — ${FORM_NAME} v${version + 1} layout_def`)
            shell.setStatusMsg(ok
              ? '게시 승인 요청 ✓ — 승인함(M-15-2) 등록 · 승인 후 게시 (TBX-004)'
              : <span style={{ color: 'var(--err)' }}>승인 요청 불가 — 백엔드 연결 필요</span>)
          })()
        }}>
          {t('uidsn.publish', '게시 (승인 후)')}
        </Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 190, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none', overflow: 'auto' }}>
          <GroupBox title="Work Hierarchy" noPad>
            <div className="tree2">
              <div className="tn"><span className="pm">−</span>CPQ</div>
              <div className="tn l2 sel"><span className="pm">·</span>Selection</div>
              <div className="tn l2"><span className="pm">·</span>Technical · Document</div>
              <div className="tn"><span className="pm">+</span>TLM</div>
              <div className="tn"><span className="pm">+</span>Print Form</div>
            </div>
          </GroupBox>
          <GroupBox title={t('uidsn.widgetBox', 'Widget Box — 클릭=배치')} noPad>
            <div className="tree2">
              {WIDGET_PALETTE.map((g) => (
                <div key={g.group}>
                  <div className="tn"><span className="pm">−</span><b>{g.group}</b></div>
                  {g.items.map((it) => (
                    <div key={it} className="tn l2" onClick={() => addWidget(it)}>
                      <span className="pm">·</span>{it}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 4 }}>
          <div className="cvs" style={{ flex: 1, minHeight: 300 }}>
            {widgets.map((w) => (
              <div key={w.id}
                className={`m2 ${selId === w.id ? 'sel' : ''}`}
                style={{ left: w.x, top: w.y, width: w.w, height: w.h }}
                onClick={() => setSelId(w.id)}>
                {w.label}
              </div>
            ))}
            <div style={{ position: 'absolute', left: 10, bottom: 6, fontSize: 9.5, color: 'var(--txt-mute)' }}>
              {t('uidsn.flowHint', '팔레트 클릭 배치 → 속성 편집 → 동작 Templet 바인딩 → 저장·버전 → 승인·게시')}
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
            {t('uidsn.bindHint', 'Button → Command Templet (복사·대상·Data) · Combo → Data Set-up (Table 바인딩)')}
          </div>
        </div>
        <div className="split-h" />
        <div className="side-scroll" style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GroupBox title="Object Inspector" noPad>
            <table className="g">
              <thead><tr><th>Object</th><th>Class</th></tr></thead>
              <tbody>
                {widgets.map((w) => (
                  <tr key={w.id} className={selId === w.id ? 'sel' : undefined}
                    onClick={() => setSelId(w.id)}>
                    <td className="code">{w.id}</td>
                    <td>{w.kind}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title={`Property Editor — ${sel?.id ?? '—'}`} noPad>
            <table className="g">
              <thead><tr><th>Property</th><th>Value</th></tr></thead>
              <tbody>
                <tr><td>class</td><td className="code">{sel?.kind ?? '-'}</td></tr>
                <tr><td>text</td><td>{sel?.label ?? '-'}</td></tr>
                <tr><td>geometry</td><td className="code">{sel ? `${sel.x},${sel.y} ${sel.w}×${sel.h}` : '-'}</td></tr>
                <tr><td>font</td><td>Pretendard 11.5</td></tr>
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title={t('uidsn.aiTitle', '[ UI 개발 AI ]')}>
            <input className="in" style={{ width: '100%' }} value={aiText} aria-label="AI 설명"
              placeholder={t('uidsn.aiPlaceholder', '개발할 Application 설명 입력…')}
              onChange={(e) => setAiText(e.target.value)} />
            <div style={{ textAlign: 'right', marginTop: 4 }}>
              <Btn variant="run" onClick={() => {
                if (!aiText.trim()) return
                void (async () => {
                  const r = await aiService.uiSuggest(aiText)
                  if (r === null) {
                    addWidget('Form')
                    shell.setStatusMsg('AI 초안 (mock) — 백엔드 불가')
                    return
                  }
                  setWidgets((prev) => [...prev, ...r.widgets.map((w, i) => ({
                    id: `ai${Date.now()}${i}`, kind: w.kind, label: w.label,
                    x: w.x, y: w.y, w: w.w, h: w.h,
                  }))])
                  setDirty(true)
                  shell.setStatusMsg(r.mode === 'live'
                    ? `AI 초안 ✓ (Claude) — 위젯 ${r.widgets.length}개: ${r.notes.slice(0, 60)}`
                    : `AI 초안 (${r.mode === 'sample' ? '샘플 모드 — API 키 미설정' : `오류: ${r.error}`}) — 위젯 ${r.widgets.length}개`)
                })()
              }}>{t('uidsn.aiDraft', 'UI 초안 제안')}</Btn>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 4 }}>
              {t('uidsn.aiHint', '→ 용도 / 항목 / 필요 DB Table 정리 후 Templet 제안 · 호출하여 Customizing')}
            </div>
          </GroupBox>
          {dirty ? <Chip tone="warn">{t('uidsn.unsaved', '미저장 변경')}</Chip> : null}
        </div>
      </div>
    </div>
  )
}
