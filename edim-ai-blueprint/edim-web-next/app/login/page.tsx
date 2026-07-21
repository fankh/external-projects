import { headers } from 'next/headers'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import pkg from '../../package.json'
import { LoginForm } from './LoginForm'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams
  // 기본 랜딩 = 대시보드 (종전 /erp/eco-ledger 는 변경 이력 대장이라 첫 화면으로 부적절)
  const next = typeof sp.next === 'string' && sp.next.startsWith('/') ? sp.next : '/erp/dashboard'
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const host = (await headers()).get('host') ?? 'edim.seekerslab.com'
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg, #dfe4ec)',
    }}>
      <LoginForm next={next} locale={locale} version={pkg.version} host={host} labels={{
        title: t('login.title', 'EDIM 로그인'),
        userId: t('login.userId', '사번'),
        password: t('login.password', '비밀번호'),
        submit: t('login.submit', '로그인 (Enter)'),
        checking: t('login.checking', '확인 중…'),
        tenant: t('login.tenant', '테넌트'),
      }} />
    </div>
  )
}
