import { LoginForm } from './LoginForm'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' && sp.next.startsWith('/') ? sp.next : '/erp/eco-ledger'
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg, #dfe4ec)',
    }}>
      <LoginForm next={next} />
    </div>
  )
}
