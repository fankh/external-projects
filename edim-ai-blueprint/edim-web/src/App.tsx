import { useState } from 'react'
import type { User } from './api/types'
import { I18nProvider } from './i18n/I18nContext'
import { LoginScreen } from './screens/common/LoginScreen'
import { Shell } from './shell/Shell'
import { ShellProvider, type ModuleId } from './shell/ShellContext'

function initialModule(): ModuleId {
  const p = window.location.pathname
  if (p.startsWith('/plm')) return 'plm'
  if (p.startsWith('/code')) return 'code'
  if (p.startsWith('/erp')) return 'erp'
  if (p.startsWith('/toolbox')) return 'toolbox'
  if (p.startsWith('/common')) return 'common'
  return 'cpq'
}

const SESSION_KEY = 'edim-session'

// 앱 로그인(edim/edim) — nginx basic auth 는 앱 경로에서 해제 (auth_basic off).
// 새로고침에도 세션 유지되도록 sessionStorage 사용, 실 API 전환 시 JWT 로 교체.
function loadSession(): User | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) as User : null
  } catch {
    return null
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(loadSession)

  return (
    <I18nProvider>
      {!user ? (
        <LoginScreen onLogin={(u) => {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(u))
          setUser(u)
        }} />
      ) : (
        <ShellProvider initialModule={initialModule()}>
          <Shell user={user} />
        </ShellProvider>
      )}
    </I18nProvider>
  )
}
