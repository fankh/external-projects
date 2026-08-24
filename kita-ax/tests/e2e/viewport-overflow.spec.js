/**
 * 가로 오버플로 회귀 — 화면이 좁아졌을 때 페이지가 옆으로 밀리는지 검사한다.
 *
 * 페이지가 가로로 스크롤되면 우측 콘텐츠(표의 끝 열, 액션 버튼)가 화면 밖으로 나가고
 * 사용자는 그것이 존재하는지조차 알기 어렵다. 표 자체가 자기 컨테이너 안에서 가로
 * 스크롤되는 것은 설계된 동작이므로 통과시키고, 문서 전체가 밀리는 경우만 잡는다.
 *
 * 자매 프로젝트(거버넌스 포털·itam)는 카드 경계 이탈을 검사하지만, 이 앱의 EJS 뷰는
 * .card 컨테이너를 쓰지 않아 같은 규칙을 그대로 옮기면 검사 대상이 0건이 되어 항상
 * 통과하는 무의미한 게이트가 된다. 그래서 이 앱에 실제로 성립하는 명제(문서가 옆으로
 * 밀리지 않는다)로 바꿔 검사한다.
 *
 * 전제: 서버가 이미 떠 있어야 한다(playwright.config.ts 의 webServer: undefined).
 *   npm run db:setup && npm start   후   npx playwright test viewport-overflow
 */
const { test, expect } = require('@playwright/test')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@seekerslab.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPassword123!'

// 사내 노트북·태블릿 상용 폭 — 폭마다 레이아웃이 달라 기준 폭 하나로는 특정 구간에서만
// 나는 이탈을 놓친다(포털에서 1280·768 에서만 나던 결함이 각각 있었다).
const WIDTHS = [768, 1024, 1280, 1440]

// src/routes 의 res.render 대상 중 목록·상세 화면 (id 파라미터가 필요한 편집 화면은 제외)
const ROUTES = [
  '/admin/dashboard',
  '/admin/users',
  '/admin/agents',
  '/admin/documents',
  '/admin/access-policies',
  '/admin/audit-logs',
  '/admin/settings',
]

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(ADMIN_EMAIL)
  await page.locator('input[type="password"], input[name="password"]').first().fill(ADMIN_PASSWORD)
  await page.locator('button[type="submit"], input[type="submit"]').first().click()
  await page.waitForLoadState('networkidle')
}

test.describe('가로 오버플로', () => {
  test.setTimeout(120000)

  for (const width of WIDTHS) {
    test(`${width}px — 문서가 옆으로 밀리지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await login(page)

      const offenders = []
      for (const route of ROUTES) {
        const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' })

        // 무의미한 통과 방지 — 리다이렉트되거나 빈 페이지면 검사 자체가 성립하지 않는다.
        // (자매 프로젝트에서 검사 대상이 0건인데 통과하던 사례가 있었다.)
        expect(res?.status(), `${route} 응답 상태`).toBeLessThan(400)
        const probe = await page.evaluate(() => ({
          path: location.pathname,
          bodyChildren: document.body.children.length,
          docScroll: document.documentElement.scrollWidth,
          docClient: document.documentElement.clientWidth,
          // 문서를 넘긴 가장 넓은 요소 — 진단용. 자기 컨테이너 안에서 스크롤되는 것은 제외한다.
          widest: (() => {
            let worst = null
            for (const el of document.querySelectorAll('body *')) {
              const r = el.getBoundingClientRect()
              if (r.width === 0 && r.height === 0) continue
              const over = Math.round(r.right - document.documentElement.clientWidth)
              if (over <= 1) continue
              let n = el.parentElement, scrollable = false
              while (n && n !== document.body) {
                const cs = getComputedStyle(n)
                if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 2) { scrollable = true; break }
                n = n.parentElement
              }
              if (scrollable) continue
              if (!worst || over > worst.over) {
                worst = { over, tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 40) }
              }
            }
            return worst
          })(),
        }))

        // 로그인 실패로 login 으로 튕겼거나 본문이 비면 검사가 성립하지 않는다 — 명시적으로 실패시킨다.
        expect(probe.path, `${route}: 로그인 세션이 유지되지 않았다`).not.toContain('/login')
        expect(probe.bodyChildren, `${route}: 본문이 비어 검사 불가`).toBeGreaterThan(0)

        const over = probe.docScroll - probe.docClient
        if (over > 4) {
          const w = probe.widest
          offenders.push(`${route}: 문서가 ${over}px 넘침` + (w ? ` (최대 이탈: <${w.tag} class="${w.cls}"> ${w.over}px)` : ''))
        }
      }

      expect(offenders, `w=${width} 가로 오버플로:\n  ${offenders.join('\n  ')}`).toEqual([])
    })
  }
})
