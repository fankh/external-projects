'use client'

/** 우측 공용 패널 접기/펼치기 (U13) — localStorage 영속, 접힘 = 세로 레일. */
import { useEffect, useState, type ReactNode } from 'react'
import { useI18n } from '@/components/I18nProvider'

export function SwpCollapse({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try { setCollapsed(localStorage.getItem('edim-swp-collapsed') === '1') } catch { /* quota */ }
  }, [])
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem('edim-swp-collapsed', c ? '0' : '1') } catch { /* quota */ }
    return !c
  })

  if (collapsed) {
    return (
      <div data-swp-expand onClick={toggle} title={t('shell.expand', '펼치기')}
        style={{ width: 22, flexShrink: 0, borderLeft: '1px solid var(--line)', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 6,
          background: 'var(--panel, #F4F6FA)' }}>
        <span style={{ fontSize: 11 }}>«</span>
        <span style={{ writingMode: 'vertical-rl', fontSize: 9.5, color: 'var(--txt-mute)' }}>{t('panel.tools', '도구')}</span>
      </div>
    )
  }
  return (
    <div data-subworkplace style={{ width: 268, flexShrink: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span className="b ic" data-swp-collapse title={t('shell.collapse', '접기')}
          style={{ cursor: 'pointer', fontSize: 11 }} onClick={toggle}>»</span>
      </div>
      {children}
    </div>
  )
}
