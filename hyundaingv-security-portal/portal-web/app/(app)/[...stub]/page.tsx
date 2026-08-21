import { notFound } from 'next/navigation'
import { NAV, TITLE_BY_HREF } from '@/components/chrome/menus'
import { Card, ScreenHeader } from '@/components/ui'
import { effectiveRoles, requireRole } from '@/lib/authz'
import { SCREENS } from '@/lib/screens'

/** 캐치올 스텁 — 아직 구현되지 않은 화면을 카탈로그(lib/screens.ts)로 렌더한다.
 *  화면을 실제 구현하면 해당 경로에 page.tsx 를 만들며, 정적 라우트가 이 캐치올보다 우선한다.
 *  권한은 menus.ts NAV 를 단일 원천으로 서버사이드에서 검증한다. */
export default async function StubPage({ params }: { params: Promise<{ stub: string[] }> }) {
  const { stub } = await params
  const href = '/' + stub.join('/')
  const nav = NAV.flatMap((g) => g.items).find((i) => i.href === href)
  const screen = SCREENS[href]
  if (!nav || !screen) notFound()

  await requireRole(...effectiveRoles(href))
  const info = TITLE_BY_HREF[href]

  return (
    <>
      <ScreenHeader kicker={info.group} title={nav.label} desc={screen.desc} />
      <div className="callout">
        <b>구현 예정 화면</b> — 셸·메뉴 체계·권한 게이트까지 반영된 스텁입니다. 아래 기능이 이후
        버전에서 폐쇄 루프(신청 → 결재 → 처리 → 집계) 단위로 구현됩니다.
      </div>
      <Card title="주요 기능 (제품안내서 기준)" pad={false}>
        <div className="stub-list">
          {screen.features.map((f) => (
            <div className="it" key={f.name}>
              <span className="nm">{f.name}</span>
              <span className="ds">{f.detail}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
