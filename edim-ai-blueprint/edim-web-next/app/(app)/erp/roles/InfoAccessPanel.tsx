'use client'

/** 1.5 — 정보 접근 권한 매트릭스 + 임시 열람 (요구 #4/#6).
 *
 * 작업 권한(RoleMatrix)과 분리: 조회는 되지만 원가·단가는 마스킹 같은 통제를 역할 단위로 설정한다.
 */
import { useState, useTransition } from 'react'
import { Chip, GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { grantTempAccess, revokeTempAccess, setInfoAccess, type ActState } from './actions'

export interface InfoGroup { key: string; label: string }
export interface InfoRule { roleName: string; infoGroup: string; mode: string }
export interface TempRow {
  id: number; login: string; infoGroup: string; mode: string
  reason: string; validTo: string; revoked: boolean; active: boolean
}
export interface InfoAccessData {
  groups: InfoGroup[]; modes: string[]; roles: string[]; rules: InfoRule[]
  mine: Record<string, string>
}

const MODE_TONE: Record<string, 'ok' | 'warn' | 'err' | 'info'> = {
  full: 'ok', no_download: 'info', masked: 'warn', summary: 'warn', hidden: 'err',
}

export function InfoAccessPanel({ data, temps }: { data: InfoAccessData; temps: TempRow[] }) {
  const { t } = useI18n()
  const [rules, setRules] = useState<InfoRule[]>(data.rules)
  const [msg, setMsg] = useState<ActState>({})
  const [busy, start] = useTransition()
  const [gLogin, setGLogin] = useState('')
  const [gGroup, setGGroup] = useState(data.groups[0]?.key ?? 'cost')
  const [gHours, setGHours] = useState('8')
  const [gReason, setGReason] = useState('')

  const modeOf = (role: string, group: string) =>
    rules.find((r) => r.roleName === role && r.infoGroup === group)?.mode ?? 'full'

  const change = (role: string, group: string, mode: string) => start(async () => {
    const r = await setInfoAccess(role, group, mode)
    setMsg(r)
    if (!r.error) {
      setRules((prev) => [...prev.filter((x) => !(x.roleName === role && x.infoGroup === group)),
        ...(mode === 'full' ? [] : [{ roleName: role, infoGroup: group, mode }])])
    }
  })

  const grant = () => start(async () => {
    setMsg(await grantTempAccess(gLogin, gGroup, Number(gHours) || 8, gReason))
    setGReason('')
  })

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <GroupBox title={t('info.matrixTitle', '정보 접근 권한 (열람·마스킹)')} data-info-matrix
        style={{ flex: '1 1 460px' }}>
        <div style={{ padding: '4px 6px', fontSize: 10.5, color: 'var(--txt-mute)' }}>
          {t('info.hint', '작업 권한과 별개 — 조회는 되지만 금액·거래처는 가릴 수 있습니다. full 외 모드는 다운로드가 차단됩니다')}
        </div>
        <table className="g">
          <thead><tr><th>{t('info.group', '정보그룹')}</th>
            {data.roles.map((r) => <th key={r}>{r}</th>)}
            <th>{t('info.mine', '내 모드')}</th></tr></thead>
          <tbody>
            {data.groups.map((g) => (
              <tr key={g.key}>
                <td>{t(`info.group.${g.key}`, g.label)}</td>
                {data.roles.map((role) => (
                  <td key={role} className="c">
                    <select className="in" data-info-cell={`${role}:${g.key}`} disabled={busy}
                      value={modeOf(role, g.key)} onChange={(e) => change(role, g.key, e.target.value)}
                      style={{ width: 108, fontSize: 10.5 }}>
                      {data.modes.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                ))}
                <td className="c"><Chip tone={MODE_TONE[data.mine[g.key]] ?? 'info'}>{data.mine[g.key]}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
        {msg.error ? <div style={{ padding: 6, fontSize: 11, color: 'var(--err)' }}>{msg.error}</div> : null}
        {msg.ok ? <div style={{ padding: 6, fontSize: 11, color: 'var(--run)' }}>{msg.ok}</div> : null}
      </GroupBox>

      <GroupBox title={t('info.tempTitle', '임시 열람 (기간 한정)')} data-temp-access
        style={{ flex: '1 1 380px' }}>
        <div style={{ display: 'flex', gap: 4, padding: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11 }}>
          <input className="in" placeholder={t('info.loginPh', '사번')} style={{ width: 90 }}
            value={gLogin} onChange={(e) => setGLogin(e.target.value)} />
          <select className="in" style={{ width: 110 }} value={gGroup} onChange={(e) => setGGroup(e.target.value)}>
            {data.groups.map((g) => <option key={g.key} value={g.key}>{t(`info.group.${g.key}`, g.label)}</option>)}
          </select>
          <input className="in" type="number" min={1} max={720} style={{ width: 58 }}
            value={gHours} onChange={(e) => setGHours(e.target.value)} title={t('info.hours', '시간')} />
          <input className="in req" placeholder={t('info.reasonPh', '사유 (감사 기록)')} style={{ width: 150 }}
            value={gReason} onChange={(e) => setGReason(e.target.value)} />
          <button className="b run" data-temp-grant disabled={busy || !gLogin.trim() || !gReason.trim()}
            onClick={grant}>{t('info.grant', '임시 부여')}</button>
        </div>
        <table className="g">
          <thead><tr><th>{t('info.user', '사용자')}</th><th>{t('info.group', '정보그룹')}</th>
            <th>{t('info.mode', '모드')}</th><th>{t('info.until', '만료')}</th><th /></tr></thead>
          <tbody>
            {temps.length ? temps.map((r) => (
              <tr key={r.id}>
                <td className="code">{r.login}</td><td>{r.infoGroup}</td>
                <td className="c">{r.mode}</td>
                <td className="c">{r.active ? r.validTo : <Chip tone="warn">{r.revoked ? '회수' : '만료'}</Chip>}</td>
                <td className="c">
                  {r.active ? <button className="b" data-temp-revoke disabled={busy}
                    onClick={() => start(async () => setMsg(await revokeTempAccess(r.id)))}>
                    {t('info.revoke', '회수')}</button> : null}
                </td>
              </tr>
            )) : <tr><td colSpan={5} style={{ color: 'var(--txt-mute)', padding: 8 }}>
              {t('info.noTemp', '부여 이력 없음')}</td></tr>}
          </tbody>
        </table>
      </GroupBox>
    </div>
  )
}
