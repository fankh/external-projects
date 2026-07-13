import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale } from '@/lib/session'
import { SESSION_COOKIE } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { I18nProvider } from '@/components/I18nProvider'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'

// 이관 완료 화면만 네비에 노출(점진 확장). label 은 i18n.
const NAV: { href: string; key: string; ko: string }[] = [
  { href: '/erp/eco-ledger', key: 'menu.plm-eco-ledger', ko: '변경 이력 대장 (D-5L)' },
  { href: '/erp/audit', key: 'menu.erp-audit', ko: '감사 조회 (M-14-6A)' },
]

async function logout() {
  'use server'
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  redirect('/login')
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)

  return (
    <I18nProvider locale={locale} bundle={bundle}>
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="titlebar" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px' }}>
        <b style={{ fontSize: 12.5 }}>EDIM</b>
        <span style={{ fontSize: 10.5, opacity: 0.8 }}>NOVA Solution · Next SSR</span>
        <span style={{ flex: 1 }} />
        <LocaleSwitcher />
        <form action={logout}>
          <button type="submit" className="b" style={{ height: 18, fontSize: 10 }}>로그아웃</button>
        </form>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <nav className="lnav" style={{ width: 220, borderRight: '1px solid var(--line)', overflow: 'auto', padding: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--txt-mute)', padding: '4px 6px' }}>이관 완료 화면</div>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="tn"
              style={{ display: 'block', padding: '4px 8px', fontSize: 11, textDecoration: 'none', color: 'var(--txt)' }}>
              {t(n.key, n.ko)}
            </Link>
          ))}
        </nav>
        <main className="workarea" style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </div>
    </div>
    </I18nProvider>
  )
}
