import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ACCOUNTS, SESSION_COOKIE, signSession } from '@/lib/session'
import { ROLE_LABEL } from '@/lib/types'

async function loginAs(formData: FormData) {
  'use server'
  const login = String(formData.get('login') ?? '')
  const acct = ACCOUNTS.find((a) => a.login === login)
  if (!acct) return
  const jar = await cookies()
  jar.set(SESSION_COOKIE, signSession(acct), { httpOnly: true, sameSite: 'lax', path: '/' })
  redirect('/dashboard')
}

const ROLE_CHIP: Record<string, string> = { USER: 'neutral', DEPT_MGR: 'info', BIZ_MGR: 'warn', ADMIN: 'err' }

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <aside className="login-hero">
        <div>
          <div>
            <div className="wordmark">GOVERNANCE PORTAL</div>
            <div className="sub">Enterprise IT · Security</div>
          </div>
          <h1>전사 IT·보안 업무를,<br />하나의 통제 평면에서.</h1>
          <p>
            IT 투자·비용, 인프라 운영, 개발 요청(SR), 프로젝트, 그리고 전사 보안
            컴플라이언스 업무를 단일 포털에서 처리합니다. 모든 업무는 공통 전자결재와
            메뉴·기능 권한관리 체계 위에서 운영됩니다.
          </p>
          <div className="tags">
            <span>IT 투자/비용</span>
            <span>IT Request (SR)</span>
            <span>인프라 운영</span>
            <span>프로젝트</span>
            <span>보안서약·의식제고</span>
            <span>보안교육·점검 (ISMS)</span>
          </div>
        </div>
        <div className="foot">
          <div>Platform<b>On-Premises · Web</b></div>
          <div>Domains<b>10대 업무 도메인</b></div>
          <div>Foundation<b>전자결재 · 권한관리</b></div>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <div className="kicker">SAML SSO — Sign in</div>
          <h2>계정을 선택하세요</h2>
          <div className="hint">데모 환경 — SSO(SAML) 인증을 대체하는 권한그룹별 목업 계정입니다.</div>
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
