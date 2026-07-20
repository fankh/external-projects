import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { AccessDenied } from '@/components/AccessDenied'
import { hasLevel } from '@/lib/auth'
import { RoleMatrix, UsersPanel, type RoleRow, type UserRow } from './AdminPanels'
import { InfoAccessPanel, type InfoAccessData, type TempRow } from './InfoAccessPanel'

export const dynamic = 'force-dynamic'

export default async function RolesPage() {
  if (!(await hasLevel('SETUP'))) return <AccessDenied minLevel="SETUP" />
  const bundle = bundleFor(await getLocale())
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let roles: RoleRow[] = []
  let users: UserRow[] = []
  let info: InfoAccessData | null = null
  let temps: TempRow[] = []
  let err: string | null = null
  try {
    ;[roles, users, info, temps] = await Promise.all([
      apiServer<RoleRow[]>('/roles'),
      apiServer<UserRow[]>('/users').catch(() => []),
      apiServer<InfoAccessData>('/access/info').catch(() => null),
      apiServer<TempRow[]>('/access/temp').catch(() => []),
    ])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('access.title', '사용자·권한')} (M-14-6)`} count={err ? undefined : users.length} countLabel={t('access.userUnit', '사용자')} source="/users · /roles" />
      {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
        <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <UsersPanel rows={users} />
          {/* key = 역할 구성 — 역할 생성/삭제 시 로컬 매트릭스 상태 재초기화 */}
          <RoleMatrix key={roles.map((r) => r.name).join('|')} roles={roles} />
          {info ? <InfoAccessPanel data={info} temps={temps} /> : null}
        </div>
      )}
    </div>
  )
}
