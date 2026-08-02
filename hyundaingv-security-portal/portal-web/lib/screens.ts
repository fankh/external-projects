/** 스텁 화면 카탈로그 — 제품안내서 LV3 화면 목록.
 *  권한은 components/chrome/menus.ts 의 NAV 가 단일 원천이고, 여기는 화면 설명·예정 기능만 담는다.
 *  화면을 실제 구현할 때는 해당 경로에 page.tsx 를 만들면 캐치올 스텁보다 우선한다. */

export interface StubScreen {
  desc: string
  features: { name: string; detail: string }[]
}

export const SCREENS: Record<string, StubScreen> = {
}
