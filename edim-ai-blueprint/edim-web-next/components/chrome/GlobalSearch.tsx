'use client'

/** ⌘K 통합 검색 (N6 복구) — 화면·코드·문서·파일·부품·프로젝트 → 딥링크 드롭다운.
 *  300ms 디바운스 · Ctrl(⌘)+K = 포커스('edim-focus-search' 이벤트). */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import { HREF_INFO } from './menus'
import { searchQuery, type SearchResults } from './shellActions'

interface Hit { group: string; label: string; href: string }

export function GlobalSearch() {
  const { t } = useI18n()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const focus = () => { inputRef.current?.focus(); inputRef.current?.select() }
    window.addEventListener('edim-focus-search', focus)
    const onDoc = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => { window.removeEventListener('edim-focus-search', focus); document.removeEventListener('mousedown', onDoc) }
  }, [])

  const run = (text: string) => {
    setQ(text)
    if (timer.current) clearTimeout(timer.current)
    if (!text.trim()) { setHits([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      // 1) 화면 레지스트리 (로컬 즉시)
      const screens: Hit[] = Object.entries(HREF_INFO)
        .filter(([, info]) => info.title.toLowerCase().includes(text.toLowerCase()) || info.code.toLowerCase().includes(text.toLowerCase()))
        .slice(0, 5)
        .map(([href, info]) => ({ group: t('search.screens', '화면'), label: `${info.code} ${info.title}`, href }))
      // 2) 서버 검색 (코드·문서·파일·부품·프로젝트)
      const r = await searchQuery(text)
      if (r.error) { setErr(r.error); setHits(screens); setOpen(true); return }
      setErr(null)
      const s: SearchResults = r.result!
      const rows: Hit[] = [
        ...screens,
        ...s.codes.slice(0, 6).map((c) => ({ group: t('search.codes', '코드'), label: `${c.code} — ${c.name}`, href: `/detail/code?code=${encodeURIComponent(c.code)}` })),
        ...s.docs.slice(0, 5).map((d) => ({ group: t('search.docs', '문서'), label: `${d.docNo} ${d.title}`, href: '/cpq/documents' })),
        ...s.files.slice(0, 5).map((f) => ({ group: t('search.files', '파일'), label: `${f.name} (${f.type})`, href: f.type === 'DXF' ? `/detail/cad-viewer?fileId=${f.fileId}` : '/common/folder' })),
        ...(s.parts ?? []).slice(0, 4).map((p) => ({ group: t('search.parts', '부품'), label: `${p.partNo} ${p.name}`, href: `/plm/parts?no=${encodeURIComponent(p.partNo)}` })),
        ...(s.projects ?? []).slice(0, 4).map((p) => ({ group: t('search.projects', '프로젝트'), label: `${p.projectNo} ${p.name}`, href: `/erp/projects?no=${encodeURIComponent(p.projectNo)}` })),
        // F6 확장 — 공급처·창고·Macro·사용자(SETUP 게이트는 서버) 그룹
        ...(s.companies ?? []).slice(0, 4).map((c) => ({ group: t('search.companies', '공급처'), label: c.name, href: `/erp/companies?sel=${c.companyId}` })),
        ...(s.warehouses ?? []).slice(0, 4).map((w) => ({ group: t('search.warehouses', '창고'), label: `${w.code} ${w.name}`, href: '/erp/warehouses' })),
        ...(s.macros ?? []).slice(0, 4).map((m) => ({ group: 'Macro', label: m.name, href: '/toolbox/macros' })),
        ...(s.users ?? []).slice(0, 4).map((u) => ({ group: t('search.users', '사용자'), label: `${u.login} ${u.name}`, href: '/erp/roles' })),
      ]
      setHits(rows)
      setOpen(true)
    }, 300)
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', marginLeft: 'auto' }}>
      <input ref={inputRef} className="in" data-global-search
        placeholder={t('shell.searchPh', '화면·코드·부품·문서 검색 (Ctrl+K)')}
        value={q} onChange={(e) => run(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur() }
          if (e.key === 'Enter' && hits.length) { router.push(hits[0].href); setOpen(false); setQ('') }
        }}
        style={{ width: 230, height: 20, fontSize: 10.5 }} />
      {open ? (
        <div data-search-results style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 90, minWidth: 300, maxHeight: 340,
          overflowY: 'auto', background: '#fff', border: '1px solid var(--line-strong)',
          boxShadow: '0 4px 12px rgba(20,26,40,.22)', fontSize: 11,
        }}>
          {err ? <div style={{ padding: '5px 10px', color: 'var(--err)' }}>{err}</div> : null}
          {hits.length ? hits.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 10px', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#EDF2FA' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
              onClick={() => { router.push(h.href); setOpen(false); setQ('') }}>
              <span style={{ width: 52, color: 'var(--txt-mute)', flex: 'none' }}>{h.group}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.label}</span>
            </div>
          )) : <div style={{ padding: '5px 10px', color: 'var(--txt-mute)' }}>{t('search.noResult', '결과 없음')}</div>}
        </div>
      ) : null}
    </div>
  )
}
