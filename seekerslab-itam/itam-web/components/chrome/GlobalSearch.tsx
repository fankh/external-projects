'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type Item = { label: string; sub: string; href: string }
type Group = { kind: string; items: Item[] }

/** 전역 통합 검색 — 타이틀바에서 자산·계약·발견·사용자·결재를 한 번에 찾아 해당 화면으로 점프.
 *  기존 검색은 무엇을 입력하든 자산 대장으로만 보냈다. 이제 ID 접두어·키워드로 교차 엔티티를 찾는다. */
export function GlobalSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // 평탄화된 결과 — 키보드 이동·Enter 점프에 쓴다
  const flat = groups.flatMap((g) => g.items)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setGroups([]); return }
    let alive = true
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`)
        if (!r.ok) return
        const data = await r.json()
        if (alive) { setGroups(data.groups ?? []); setActive(0); setOpen(true) }
      } catch { /* 무시 — 검색 실패는 조용히 */ }
    }, 180)
    return () => { alive = false; clearTimeout(t) }
  }, [q])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const go = (href: string) => { setOpen(false); setQ(''); setGroups([]); router.push(href) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (flat[active]) go(flat[active].href)
      else if (q.trim()) go(`/assets/register?q=${encodeURIComponent(q.trim())}`)
    } else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); setOpen(true) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  let idx = -1
  return (
    <div className="gsearch" ref={boxRef} style={{ position: 'relative' }}>
      <input
        className="search"
        placeholder="통합 검색 — 자산·계약·발견·사용자·결재 (ID·이름)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (flat.length) setOpen(true) }}
        onKeyDown={onKey}
        aria-label="전역 통합 검색"
      />
      {open && q.trim().length >= 2 && (
        <div className="gsearch-pop" role="listbox">
          {flat.length === 0 ? (
            <div className="gsearch-empty">일치하는 항목이 없습니다</div>
          ) : (
            groups.map((g) => (
              <div key={g.kind} className="gsearch-group">
                <div className="gsearch-kind">{g.kind}</div>
                {g.items.map((it) => {
                  idx += 1
                  const cur = idx
                  return (
                    <button
                      key={it.href + it.label}
                      role="option"
                      aria-selected={cur === active}
                      className={`gsearch-item ${cur === active ? 'on' : ''}`}
                      onMouseEnter={() => setActive(cur)}
                      onClick={() => go(it.href)}
                    >
                      <span className="gsearch-label">{it.label}</span>
                      <span className="gsearch-sub">{it.sub}</span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
