import type { User } from './api/types'
import { Shell } from './shell/Shell'
import { ShellProvider, type ModuleId } from './shell/ShellContext'

function initialModule(): ModuleId {
  const p = window.location.pathname
  if (p.startsWith('/plm')) return 'plm'
  if (p.startsWith('/code')) return 'code'
  if (p.startsWith('/erp')) return 'erp'
  return 'cpq'
}

// 인증은 게이트웨이(Basic Auth)가 담당 — 앱 자체 로그인 화면 없음.
// 실 API 전환 시 게이트웨이 JWT 의 사용자 정보로 대체한다.
const GATEWAY_USER: User = {
  userId: 'edim', name: 'YS.Gang', department: '기술연구소',
  userLevel: 'SETUP', tenantId: 'nova',
}

export default function App() {
  return (
    <ShellProvider initialModule={initialModule()}>
      <Shell user={GATEWAY_USER} />
    </ShellProvider>
  )
}
