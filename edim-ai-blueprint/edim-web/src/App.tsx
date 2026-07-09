import { useState } from 'react'
import type { User } from './api/types'
import { LoginScreen } from './screens/common/LoginScreen'
import { Shell } from './shell/Shell'
import { ShellProvider, type ModuleId } from './shell/ShellContext'

function initialModule(): ModuleId {
  return window.location.pathname.startsWith('/plm') ? 'plm' : 'cpq'
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)

  if (!user) return <LoginScreen onLogin={setUser} />

  return (
    <ShellProvider initialModule={initialModule()}>
      <Shell user={user} />
    </ShellProvider>
  )
}
