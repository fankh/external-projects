'use client'

/** 1.3 — 고객사 프로비저닝 패널: 목록 + 생성 폼 + 상태 전환 (플랫폼 운영). */
import { useActionState, useState, useTransition } from 'react'
import { Chip, GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { createTenant, setTenantStatus, type ActState } from './actions'

export interface TenantRow {
  tenantId: number; tenantCode: string; tenantName: string; plan: string
  status: string; createdAt: string; users: number; productCodes: number; projects: number
}

export function TenantPanel({ rows, platformCode }: { rows: TenantRow[]; platformCode: string }) {
  const { t } = useI18n()
  const [st, action, pending] = useActionState(createTenant, {} as ActState)
  const [msg, setMsg] = useState<ActState>({})
  const [busy, start] = useTransition()

  const toggle = (row: TenantRow) => {
    const next = row.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    if (!confirm(`${row.tenantName} 을(를) ${next} 상태로 변경하시겠습니까?`)) return
    start(async () => setMsg(await setTenantStatus(row.tenantCode, next)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
      <GroupBox title={t('tenant.newTitle', '고객사 등록 (온보딩)')} data-tenant-new>
        <form action={action} style={{ display: 'flex', gap: 6, padding: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11 }}>
          <input className="in req" name="tenantCode" placeholder={t('tenant.codePh', '코드 (영문)')} style={{ width: 110 }} />
          <input className="in req" name="tenantName" placeholder={t('tenant.namePh', '고객사명')} style={{ width: 150 }} />
          <select className="in" name="plan" style={{ width: 92 }}>{['SAAS', 'ENTERPRISE', 'TRIAL'].map((p) => <option key={p}>{p}</option>)}</select>
          <span className="sep" />
          <input className="in req" name="adminLogin" placeholder={t('tenant.adminPh', '관리자 사번')} style={{ width: 110 }} />
          <input className="in" name="adminName" placeholder={t('tenant.adminNamePh', '관리자 이름')} style={{ width: 110 }} />
          <input className="in req" name="adminPassword" type="password" placeholder={t('tenant.pwPh', '초기 비밀번호 (6자+)')} style={{ width: 140 }} />
          <button className="b run" type="submit" disabled={pending}>{t('tenant.create', '＋ 고객사 생성')}</button>
          {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
          {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
        </form>
        <div style={{ padding: '0 6px 6px', fontSize: 10.5, color: 'var(--txt-mute)' }}>
          {t('tenant.hint', '생성 시 초기 관리자 계정과 Hierarchy 기본 노드(/C /M /T)가 함께 만들어져 즉시 사용 가능합니다')}
        </div>
      </GroupBox>

      <GroupBox title={`${t('tenant.listTitle', '고객사 목록')} — ${rows.length}`} noPad
        style={{ flex: 1, minHeight: 0, overflow: 'auto' }} data-tenant-list>
        <table className="g">
          <thead><tr>
            <th>{t('tenant.code', '코드')}</th><th>{t('tenant.name', '고객사')}</th><th>Plan</th>
            <th>{t('tenant.status', '상태')}</th><th>{t('tenant.users', '사용자')}</th>
            <th>{t('tenant.codes', '제품코드')}</th><th>{t('tenant.projects', '프로젝트')}</th>
            <th>{t('tenant.created', '생성')}</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tenantId}>
                <td className="code">{r.tenantCode}{r.tenantCode === platformCode ? ' ★' : ''}</td>
                <td>{r.tenantName}</td>
                <td className="c">{r.plan}</td>
                <td className="c">{r.status === 'ACTIVE'
                  ? <Chip tone="ok">{r.status}</Chip> : <Chip tone="warn">{r.status}</Chip>}</td>
                <td className="num">{r.users}</td>
                <td className="num">{r.productCodes}</td>
                <td className="num">{r.projects}</td>
                <td className="c">{r.createdAt}</td>
                <td className="c">
                  <button className="b" data-tenant-toggle disabled={busy || r.tenantCode === platformCode}
                    title={r.tenantCode === platformCode ? t('tenant.platformHint', '플랫폼 운영 테넌트는 중지할 수 없습니다') : ''}
                    onClick={() => toggle(r)}>
                    {r.status === 'ACTIVE' ? t('tenant.suspend', '이용 중지') : t('tenant.resume', '이용 재개')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {msg.error ? <div style={{ padding: 6, fontSize: 11, color: 'var(--err)' }}>{msg.error}</div> : null}
        {msg.ok ? <div style={{ padding: 6, fontSize: 11, color: 'var(--run)' }}>{msg.ok}</div> : null}
      </GroupBox>
    </div>
  )
}
