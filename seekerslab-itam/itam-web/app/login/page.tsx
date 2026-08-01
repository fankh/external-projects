import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ACCOUNTS, SESSION_COOKIE } from '@/lib/session'
import { ROLE_LABEL } from '@/lib/types'

async function loginAs(formData: FormData) {
  'use server'
  const login = String(formData.get('login') ?? '')
  const acct = ACCOUNTS.find((a) => a.login === login)
  if (!acct) return
  const jar = await cookies()
  jar.set(SESSION_COOKIE, JSON.stringify(acct), { httpOnly: true, sameSite: 'lax', path: '/' })
  redirect('/dashboard')
}

const ROLE_CHIP: Record<string, string> = { USER: 'neutral', ASSET_MGR: 'info', SEC_MGR: 'warn', ADMIN: 'err' }

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <aside className="login-hero">
        <div>
          <div className="brand" style={{ padding: 0, border: 'none' }}>
            <div className="wordmark">SEEKERSLAB</div>
            <div className="sub">AI Asset Management Platform</div>
          </div>
          <h1>발견되지 않은 자산까지,<br />단일 플랫폼에서.</h1>
          <p>
            자산 수명주기 관리, Shadow IT Discovery, AI 자산 인텔리전스를 통합합니다.
            관리 대장에 있는 자산을 넘어, 발견되지 않은 자산을 찾아 대장에
            편입시키는 것까지를 관리 범위로 하는 차세대 ITAM 플랫폼입니다.
          </p>
          <div className="tags">
            <span>자산 수명주기 관리</span>
            <span>Shadow IT Discovery</span>
            <span>CMDB 자동 대사</span>
            <span>AI 자산 인텔리전스</span>
            <span>전자결재 워크플로우</span>
          </div>
        </div>
        <div className="foot">
          <div>Platform<b>On-Premises · Web</b></div>
          <div>Detection Channels<b>6종 병렬 수집</b></div>
          <div>AI Functions<b>5대 기능</b></div>
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
