/** 스텁 화면 카탈로그 — 제품안내서 LV3 화면 목록.
 *  권한은 components/chrome/menus.ts 의 NAV 가 단일 원천이고, 여기는 화면 설명·예정 기능만 담는다.
 *  화면을 실제 구현할 때는 해당 경로에 page.tsx 를 만들면 캐치올 스텁보다 우선한다. */

export interface StubScreen {
  desc: string
  features: { name: string; detail: string }[]
}

export const SCREENS: Record<string, StubScreen> = {
  '/settings/menus': {
    desc: '메뉴·기능 관리 — 포털 메뉴 체계와 화면 내 기능 단위를 관리한다.',
    features: [
      { name: '메뉴 관리', detail: 'LV1~LV3 메뉴 등록·정렬·사용 여부' },
      { name: '기능 관리', detail: '화면 내 버튼·기능 단위 정의' },
    ],
  },
  '/settings/permissions': {
    desc: '메뉴권한 — 권한그룹 × 메뉴·기능 매트릭스를 관리한다.',
    features: [
      { name: '권한 매트릭스', detail: '그룹별 메뉴 접근·기능 사용 권한' },
      { name: '서버사이드 가드', detail: '직접 URL 진입 차단과 동일 기준 적용' },
    ],
  },
  '/settings/codes': {
    desc: '공통코드·객체 — 업무 공통코드와 코드 객체를 관리한다.',
    features: [
      { name: '공통코드', detail: '코드그룹·코드값 관리 (장애등급·SR유형 등)' },
      { name: '객체 관리', detail: '코드 참조 객체 매핑' },
    ],
  },
  '/settings/forms': {
    desc: '엑셀양식 관리 — 결재 자동첨부에 쓰는 엑셀 양식을 관리한다.',
    features: [
      { name: '양식 등록', detail: '업무별 엑셀 양식 업로드·버전 관리' },
      { name: '자동첨부 매핑', detail: '결재 문서 유형별 양식 연결' },
    ],
  },
}
