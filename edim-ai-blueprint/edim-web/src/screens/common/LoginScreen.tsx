/** 로그인 — dense 다이얼로그. 게이트웨이 Basic Auth 대신 앱 로그인 사용 (edim/edim). */
import { useState } from 'react'
import { authService } from '../../api/services'
import type { User } from '../../api/types'
import { Btn, Chip } from '../../components/controls'
import { LocaleSwitcher, useI18n } from '../../i18n/I18nContext'

export function LoginScreen(props: { onLogin: (u: User) => void }) {
  const { t } = useI18n()
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      props.onLogin(await authService.login(userId, password))
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-bg">
      <div className="login-dlg">
        <div className="titlebar">
          <span className="lg">E</span><b>EDIM</b>
          <span style={{ color: '#8FA5CC' }}>— NOVA Solution {t('login.title', '로그인')}</span>
          <span className="sp" />
          <LocaleSwitcher />
        </div>
        <form className="bd" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <div className="frm c2">
            <label>{t('login.userId', '사번')}<i>*</i></label>
            <input className="in req" value={userId} autoFocus aria-label="사번"
              onChange={(e) => setUserId(e.target.value)} />
            <label>{t('login.password', '비밀번호')}<i>*</i></label>
            <input className="in req" type="password" value={password} aria-label="비밀번호"
              onChange={(e) => setPassword(e.target.value)} />
            <label>{t('login.tenant', '테넌트')}</label>
            <input className="in ro" value="NOVA Solution" readOnly />
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Chip tone="info">CPQ</Chip><Chip tone="info">PLM</Chip>
            <Chip tone="info">Code</Chip><Chip tone="info">ERP</Chip>
            <span style={{ flex: 1 }} />
            {error ? <Chip tone="err">{error}</Chip> : null}
          </div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button type="submit" style={{ display: 'none' }} aria-hidden="true" />
            <Btn variant="pri" disabled={busy} onClick={() => void submit()}>
              {busy ? t('login.checking', '확인 중…') : t('login.submit', '로그인 (Enter)')}
            </Btn>
          </div>
          <div className="statusbar" style={{ margin: '0 -20px -14px', padding: '3px 12px' }}>
            <span className="cell">EDIM v0.2</span>
            <span className="grow" />
            <span className="cell">edim.seekerslab.com</span>
          </div>
        </form>
      </div>
    </div>
  )
}
