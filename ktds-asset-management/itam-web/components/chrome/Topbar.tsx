'use client'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { TITLE_BY_HREF } from './menus'

export function Topbar(props: { userName: string; roleLabel: string; dept: string; right?: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const info = TITLE_BY_HREF[pathname]
  return (
    <header className="topbar">
      <div className="crumb">
        {info ? (
          <>
            <span>{info.group}</span>
            <span className="sep">/</span>
            <b>{info.title}</b>
          </>
        ) : (
          <b>SEEKERSLAB ITAM</b>
        )}
      </div>
      <div className="sp" />
      <input
        className="search"
        placeholder="자산번호 · 호스트명 · 소유자 검색  (자산 대장으로 이동)"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const q = (e.target as HTMLInputElement).value.trim()
            router.push(q ? `/assets/register?q=${encodeURIComponent(q)}` : '/assets/register')
          }
        }}
      />
      <div className="userchip">
        <span className="avatar">{props.userName.slice(0, 1)}</span>
        <span>
          <div className="nm">{props.userName}</div>
          <div className="rl">{props.dept} · {props.roleLabel}</div>
        </span>
      </div>
      {props.right}
    </header>
  )
}
