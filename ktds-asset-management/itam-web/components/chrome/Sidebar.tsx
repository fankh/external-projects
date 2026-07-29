'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Role } from '@/lib/types'
import { NAV } from './menus'

export function Sidebar(props: { role: Role; badges: { approvals: number; unregistered: number } }) {
  const pathname = usePathname()
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="wordmark">SEEKERSLAB</div>
        <div className="sub">AI Asset Management</div>
      </div>
      <nav className="snav">
        {NAV.map((g) => {
          const items = g.items.filter((i) => i.roles.includes(props.role))
          if (items.length === 0) return null
          return (
            <div key={g.label}>
              <div className="grp">{g.label}</div>
              {items.map((i) => {
                const n = i.badge ? props.badges[i.badge] : 0
                return (
                  <Link key={i.href} href={i.href} className={`item ${pathname.startsWith(i.href) ? 'on' : ''}`}>
                    <span className="ico">{i.ico}</span>
                    {i.label}
                    {n > 0 && <span className="bdg">{n}</span>}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>
      <div className="side-foot">v1.0 · On-Premises<br />SEEKERSLAB.COM</div>
    </aside>
  )
}
