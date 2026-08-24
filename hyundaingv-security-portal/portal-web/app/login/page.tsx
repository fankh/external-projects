import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ACCOUNTS, cookieSecure, SESSION_COOKIE, signSession } from '@/lib/session'
import { ssoLoginAvailable } from '@/lib/integrations/registry'
import { ROLE_LABEL } from '@/lib/types'
import { PORTAL } from '@/portal.config'

/** 브랜딩이 런타임 프로필(PORTAL_PROFILE)을 따르도록 정적 프리렌더를 끈다 —
 *  빌드 시점 고정이면 한 이미지로 고객사 전환이 불가능해진다 */
export const dynamic = 'force-dynamic'

async function loginAs(formData: FormData) {
  'use server'
  const login = String(formData.get('login') ?? '')
  const acct = ACCOUNTS.find((a) => a.login === login)
  if (!acct) return
  const jar = await cookies()
  // Secure 는 프로덕션 기본 활성(HTTPS 종단 전제) — http 데모·게이트만 PORTAL_COOKIE_SECURE=0 로 해제(cookieSecure)
  jar.set(SESSION_COOKIE, signSession(acct), {
    httpOnly: true, sameSite: 'lax', path: '/', secure: cookieSecure(),
  })
  redirect('/dashboard')
}

const ROLE_CHIP: Record<string, string> = { USER: 'neutral', DEPT_MGR: 'info', BIZ_MGR: 'warn', ADMIN: 'err' }

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <aside className="login-hero">
        <div>
          <div>
            <div className="wordmark">{PORTAL.productName}</div>
            <div className="sub">{PORTAL.productSub}</div>
          </div>
          <h1>전사 IT·보안 업무 포털</h1>
          <p>
            IT 투자·비용, 인프라 운영, 서비스요청(SR), 프로젝트, 보안 컴플라이언스 업무를
            처리합니다. 사내망에서만 접속할 수 있습니다.
          </p>
          <ul className="guide">
            <li>사내 계정(SSO)으로 로그인합니다.</li>
            <li>권한·계정 문의는 정보기획팀(내선 3300).</li>
            <li>장애 신고는 IT운영팀(내선 3450).</li>
          </ul>
        </div>
        <div className="foot">
          {PORTAL.productName} {PORTAL.version} · &copy; {new Date().getFullYear()} {PORTAL.customer}
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <h2>계정을 선택하세요</h2>
          <div className="hint">데모 환경 — SSO(SAML) 인증을 대체하는 권한그룹별 목업 계정입니다.</div>
          {/* 실 SSO 채널이 가동된 배포에서는 IdP 로그인 진입점을 노출한다(데모 목업 프로필은 계정 선택만). */}
          {ssoLoginAvailable() && (
            <a className="btn pri sso-login" href="/api/sso/login?relayState=%2Fdashboard">SSO 로그인 →</a>
          )}
          {ACCOUNTS.map((a) => (
            <form key={a.login} action={loginAs}>
              <input type="hidden" name="login" value={a.login} />
              <button type="submit" className="acct">
                <span className="avatar">{a.name.slice(0, 1)}</span>
                <span>
                  <div className="nm">{a.name}</div>
                  <div className="dt">{a.dept} · {a.login}</div>
                </span>
                <span className={`chip bare ${ROLE_CHIP[a.role]} role`}>{ROLE_LABEL[a.role]}</span>
              </button>
            </form>
          ))}
          <div className="hint" style={{ marginTop: 14 }}>
            권한그룹에 따라 노출되는 메뉴·기능이 다릅니다 — 화면·기능 단위 최소권한 모델.
          </div>
        </div>
      </main>
    </div>
  )
}
