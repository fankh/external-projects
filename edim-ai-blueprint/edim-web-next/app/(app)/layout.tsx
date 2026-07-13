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
  { href: '/erp/dashboard', key: 'menu.erp-dashboard', ko: 'ERP Dashboard' },
  { href: '/erp/companies', key: 'menu.erp-company-master', ko: '거래처 대장 (M-14-2)' },
  { href: '/plm/parts', key: 'menu.plm-parts', ko: '부품 대장 (M-4-7)' },
  { href: '/plm/drawings', key: 'menu.plm-drawings', ko: '도면 대장 (M-4-1)' },
  { href: '/plm/duct', key: 'menu.plm-duct', ko: '건축설비 Duct (M-4-3)' },
  { href: '/plm/arrangement', key: 'menu.plm-arr', ko: 'Arrangement Set-Up (M-4-2)' },
  { href: '/code/groups', key: 'menu.code-hierarchy', ko: '코드 그룹 (S-1)' },
  { href: '/code/materials', key: 'menu.code-raw', ko: 'Raw Material·GPI (M-3-2)' },
  { href: '/code/product-codes', key: 'menu.code-master', ko: '제품 코드 마스터 (M-3-8)' },
  { href: '/erp/prices', key: 'menu.erp-price', ko: '단가 대장 (M-12-5)' },
  { href: '/erp/po', key: 'menu.erp-po', ko: '발주 대장 (G-3)' },
  { href: '/erp/inventory', key: 'menu.erp-inventory', ko: '재고 관리 (D-2)' },
  { href: '/erp/cost-actual', key: 'menu.erp-cost-actual', ko: '원가 실적·차이 (D-6)' },
  { href: '/erp/milestones', key: 'menu.erp-milestone', ko: '일정·마일스톤 (D-7)' },
  { href: '/erp/warehouses', key: 'menu.erp-warehouse', ko: '창고 위치 (M-8-1)' },
  { href: '/erp/holidays', key: 'menu.erp-calendar', ko: '근무일·휴일 캘린더 (M-8-6)' },
  { href: '/erp/finance', key: 'menu.erp-finance', ko: '다통화·세금 마스터 (M-13-1)' },
  { href: '/erp/eco-ledger', key: 'menu.plm-eco-ledger', ko: '변경 이력 대장 (D-5L)' },
  { href: '/erp/anomaly', key: 'menu.erp-anomaly', ko: '이상 이벤트 (M-14-4A)' },
  { href: '/erp/roles', key: 'menu.erp-access', ko: '권한 매트릭스 (M-14-6)' },
  { href: '/cpq/x-review', key: 'menu.cpq-xreview', ko: 'X-code 검토 (C-1X)' },
  { href: '/erp/audit', key: 'menu.erp-audit', ko: '감사 조회 (M-14-6A)' },
  { href: '/cpq/reports', key: 'menu.cpq-reports', ko: 'Report Center (RPT)' },
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
