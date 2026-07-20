'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { loginAction, type LoginState } from './actions'

export interface LoginLabels {
  title: string; userId: string; password: string; submit: string; checking: string; tenant: string
}

const LOCALES = ['ko', 'en', 'ja', 'zh']

/** 로그인 다이얼로그 — 레거시 SPA LoginScreen 이식 (로케일 스위처·테넌트·모듈 칩·버전 상태바). */
export function LoginForm({ next, labels, locale, version, host }: {
  next: string; labels: LoginLabels; locale: string; version: string; host: string
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {})
  return (
    <form action={action} className="login-dlg" style={{
      width: 320, background: '#fff', border: '1px solid var(--line-strong)',
      boxShadow: '0 8px 30px rgba(20,26,40,.35)', padding: 0,
    }}>
      <div className="titlebar" style={{ padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="lg">E</span><b>EDIM</b>
        <span style={{ color: '#8FA5CC' }}>— NOVA Solution</span>
        <span style={{ flex: 1 }} />
        {/* 로케일 스위처 — 쿠키 설정 후 서버 재렌더 (라벨 SSR 번역) */}
        <select aria-label="locale" data-login-locale defaultValue={locale}
          onChange={(e) => {
            document.cookie = `edim_locale=${e.target.value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
            router.refresh()
          }}
          style={{ background: '#1E3560', color: '#B9C7E2', border: '1px solid #3A5488', borderRadius: 2, fontSize: 10.5, height: 18, padding: '0 2px' }}>
          {LOCALES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
        </select>
      </div>
      <div className="frm c2" style={{ padding: 12 }}>
        <input type="hidden" name="next" value={next} />
        <label htmlFor="userId">{labels.userId}</label>
        <input id="userId" name="userId" className="in" defaultValue="edim" autoFocus />
        <label htmlFor="password">{labels.password}</label>
        <input id="password" name="password" type="password" className="in" defaultValue="edim" />
        {/* 트리아지 #10 — MFA 활성 사용자 2단계 (opt-in — 비활성 사용자는 미노출) */}
        {state.mfaRequired ? (
          <>
            <label htmlFor="otp">OTP</label>
            <input id="otp" name="otp" className="in" data-login-otp inputMode="numeric"
              maxLength={6} placeholder="6자리 인증 코드" autoFocus />
          </>
        ) : null}
        <label htmlFor="tenant">{labels.tenant}</label>
        <input id="tenant" className="in ro" value="NOVA Solution" readOnly />
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '0 12px' }}>
        {['CPQ', 'PLM', 'Code', 'ERP'].map((m) => (
          <span key={m} className="st info" style={{ fontSize: 10 }}>{m}</span>
        ))}
        <span style={{ flex: 1 }} />
        {state.error ? <span style={{ color: 'var(--err)', fontSize: 11 }}>{state.error}</span> : null}
      </div>
      <div style={{ padding: '6px 12px 12px', textAlign: 'right' }}>
        <button type="submit" className="b pri" disabled={pending} style={{ height: 26 }}>
          {pending ? labels.checking : labels.submit}
        </button>
      </div>
      <div className="statusbar" data-login-status style={{ padding: '3px 12px', display: 'flex', fontSize: 10 }}>
        <span className="cell">EDIM v{version}</span>
        <span style={{ flex: 1 }} />
        <span className="cell">{host}</span>
      </div>
    </form>
  )
}
