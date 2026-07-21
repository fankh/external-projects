'use client'

/** 우측 Accordion Template Host (4.1 — 요구 #16 "접고 펼치는 복수 Template").
 *
 * 종전 우측 패널은 Template 4종이 **항상 펼쳐진 채** 세로로 쌓여 있어, 화면이 좁으면
 * 아래 Template 은 스크롤해야만 닿았고 개별로 접을 수도 없었다.
 * 여기서는 각 Template 을 개별 접기/펼치기 단위로 만들고(다중 펼침 허용) 상태를 보존한다.
 *
 * 표시 대상은 활성 Head 의 RIGHT 바인딩(#17)이 정의돼 있으면 그것을 따르고,
 * 없으면 전체를 보여준다 — Head 미정의 테넌트에서도 종전과 동일하게 동작한다.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { AccordionCtx } from '@/components/controls'
import { getHead, listHeads } from '@/lib/headActions'

const OPEN_KEY = 'edim.swp.open'
const HEAD_KEY = 'edim.headCode'

export interface AccordionSection { id: string; title: string; node: ReactNode }

export function AccordionHost({ sections }: { sections: AccordionSection[] }) {
  const { t } = useI18n()
  // 기본: 첫 Template 만 펼침 — 좁은 화면에서도 우측이 한눈에 들어온다
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({}))
  const [ready, setReady] = useState(false)
  const [allow, setAllow] = useState<string[] | null>(null)   // null = 제한 없음(Head 바인딩 부재)

  useEffect(() => {
    let init: Record<string, boolean> | null = null
    try {
      const raw = window.localStorage.getItem(OPEN_KEY)
      if (raw) init = JSON.parse(raw) as Record<string, boolean>
    } catch { /* noop */ }
    setOpen(init ?? Object.fromEntries(sections.map((s, i) => [s.id, i === 0])))
    setReady(true)
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // 활성 Head 의 RIGHT TEMPLATE 바인딩으로 표시 대상·순서 결정 (#16 × #17)
  useEffect(() => {
    let live = true
    void (async () => {
      let code = ''
      try { code = window.localStorage.getItem(HEAD_KEY) ?? '' } catch { /* noop */ }
      const heads = await listHeads()
      const head = heads.find((h) => h.headCode === code) ?? heads[0]
      if (!head) return
      const d = await getHead(head.headId)
      const refs = (d?.bindings ?? [])
        .filter((b) => b.panel === 'RIGHT' && b.targetKind === 'TEMPLATE')
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((b) => b.targetRef)
      // 'todo' 처럼 우측 패널 밖의 Template 참조는 무시하고, 실제 존재하는 것만 반영
      const known = refs.filter((r) => sections.some((s) => s.id === r))
      if (live && known.length) setAllow(known)
    })()
    return () => { live = false }
  }, [sections])

  const shown = allow
    ? allow.map((id) => sections.find((s) => s.id === id)!).filter(Boolean)
    : sections

  const toggle = (id: string) => setOpen((cur) => {
    const next = { ...cur, [id]: !cur[id] }
    try { window.localStorage.setItem(OPEN_KEY, JSON.stringify(next)) } catch { /* noop */ }
    return next
  })
  const setAll = (v: boolean) => setOpen(() => {
    const next = Object.fromEntries(shown.map((s) => [s.id, v]))
    try { window.localStorage.setItem(OPEN_KEY, JSON.stringify(next)) } catch { /* noop */ }
    return next
  })

  if (!ready) return null
  const openCount = shown.filter((s) => open[s.id]).length

  return (
    <div data-accordion-host style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: 'var(--txt-mute)' }}>
        <span>{t('panel.templates', 'Template')} {shown.length}</span>
        <span style={{ flex: 1 }} />
        <span className="b ic" data-acc-expand-all title={t('panel.expandAll', '모두 펼치기')}
          style={{ cursor: 'pointer' }} onClick={() => setAll(true)}>⌄</span>
        <span className="b ic" data-acc-collapse-all title={t('panel.collapseAll', '모두 접기')}
          style={{ cursor: 'pointer' }} onClick={() => setAll(false)}>⌃</span>
      </div>
      {shown.map((s) => (
        // 헤더는 각 Template 자신의 GroupBox 제목줄이 담당한다(컨텍스트 주입) —
        // 별도 헤더를 덧대면 제목이 두 번 나온다.
        <div key={s.id} data-acc-section={s.id}>
          <AccordionCtx.Provider value={{ open: Boolean(open[s.id]), toggle: () => toggle(s.id) }}>
            {s.node}
          </AccordionCtx.Provider>
        </div>
      ))}
      {openCount === 0 ? (
        <div style={{ fontSize: 10, color: 'var(--txt-mute)', padding: '2px 4px' }}>
          {t('panel.allCollapsed', '모든 Template 접힘 — 제목을 클릭하면 펼쳐집니다')}
        </div>
      ) : null}
    </div>
  )
}
