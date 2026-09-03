import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { appendAudit } from '@/lib/audit'
import { nowMinute } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { ACCOUNTS, SESSION_COOKIE } from '@/lib/session'
import { ROLE_LABEL } from '@/lib/types'
/** CSP nonce 는 요청마다 새로 만들어지므로 빌드 시점에 굳은 HTML 에는 붙지 않는다.
 *  이 화면이 정적으로 프리렌더되면 미들웨어가 세운 nonce 와 HTML 의 nonce 가 어긋나 인라인
 *  부트스트랩 스크립트가 차단된다(실측: 헤더 nonce 는 있는데 HTML 에는 없었다). 데이터를 읽지
 *  않는 화면이라 매 요청 렌더 비용은 무시할 수 있고, 그 대가로 앱 전체가 같은 엄격 CSP 를 받는다. */
export const dynamic = 'force-dynamic'


async function loginAs(formData: FormData) {
  'use server'
  const login = String(formData.get('login') ?? '')
  const acct = ACCOUNTS.find((a) => a.login === login)
  if (!acct) return
  const jar = await cookies()
  // https 로 들어온 요청에는 secure 를 붙인다 — 이 플래그가 없으면 브라우저는 같은 사이트의 평문 http
  //  요청에도 세션 쿠키를 실어 보낸다. TLS 뒤에 둔 배포에서 이미지 하나, 잘못된 링크 하나가 평문으로
  //  나가면 그 요청에 세션이 통째로 실린다(httpOnly 는 스크립트 접근만 막지, 전송 경로를 고르지 않는다).
  //  프로토콜은 리버스 프록시가 넘기는 x-forwarded-proto 로 판단한다. README 의 기본 배포 절차는 평문
  //  http(3390)이라 무조건 붙이면 그 구성에서 로그인이 되지 않는다 — 조건부여야 둘 다 산다.
  const proto = (await headers()).get('x-forwarded-proto')?.split(',')[0].trim()
  jar.set(SESSION_COOKIE, JSON.stringify(acct), { httpOnly: true, sameSite: 'lax', path: '/', secure: proto === 'https' })
  // 로그인 사실을 대장에 남긴다 — 사용자·그룹 화면의 '최근 로그인'은 시드 값에 멈춰 있어 방금 들어온 사람도
  //  예전 시각으로 보였고(표시가 사실과 다름), 접근 기록(로그인)이 감사 로그에 아예 없었다(ISMS 접근 기록 항목).
  const user = getStore().users.find((u) => u.login === acct.login)
  if (user) user.lastLogin = nowMinute()
  // 권한그룹은 스토어가 단일 출처다(getSession 과 동일 규약) — 목업 IdP 계정에 박힌 역할이 아니라 현재 값으로 남긴다.
  appendAudit({ actor: acct.name, action: `로그인 — ${ROLE_LABEL[user?.role ?? acct.role]}`, target: acct.login })
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
