import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { getTenantHeadNav, getTenantNav } from '@/components/chrome/shellActions'
import { TenantMenuAdmin } from './TenantMenuAdmin'

export const dynamic = 'force-dynamic'

// U33 — 테넌트 메뉴 관리 (M-14-6B): 관리자가 모듈별 좌측 패널·헤더 드롭다운 기본 구성을 한 화면에서 지정.
export default async function TenantMenusPage() {
  const bundle = bundleFor(await getLocale())
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const [left, head] = await Promise.all([getTenantNav(), getTenantHeadNav()])
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('tmenu.title', '테넌트 메뉴 관리')} (M-14-6B)`}
        source="/tenant/leftnav · /tenant/headnav (sys_tenant.settings)" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        <TenantMenuAdmin initialLeft={left} initialHead={head} />
      </div>
    </div>
  )
}
