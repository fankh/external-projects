/** 화면 딥링크 단일 원천 — 특정 레코드로 진입하는 ?sel= 링크는 전부 여기서 만든다.
 *  화면별로 문자열을 손조립하면 경로·인코딩이 화면마다 어긋나므로(계약 링크의
 *  encodeURIComponent 누락 사례) 빌더를 공유한다.
 *  클라이언트 안전(스토어·서버 모듈 비의존) — 검색 API·대시보드·상세 화면·로그가 공유한다. */
export const assetHref = (assetNo: string) => `/assets/register?sel=${encodeURIComponent(assetNo)}`
export const approvalHref = (id: string) => `/workflow/approvals?sel=${encodeURIComponent(id)}`
export const contractHref = (id: string) => `/inventory/contracts?sel=${encodeURIComponent(id)}`
export const noticeHref = (id: string) => `/board/notices?sel=${encodeURIComponent(id)}`
export const qnaHref = (id: string) => `/board/qna?sel=${encodeURIComponent(id)}`

/** 발송 이력·감사 로그의 참조 ID(ref/target) → 대상 화면 링크. ID 접두어로 대상을 판별한다.
 *  매핑되지 않는 값(부서명·'공지'·'Discovery' 등 라벨)은 null → 링크 없이 텍스트로 남긴다. */
export function entityHref(ref?: string): { href: string; external?: boolean } | null {
  if (!ref) return null
  if (ref.startsWith('AST-')) return { href: assetHref(ref) }
  if (ref.startsWith('APR-')) return { href: approvalHref(ref) }
  if (ref.startsWith('CT-') || ref.startsWith('LIC-')) return { href: contractHref(ref) }
  if (ref.startsWith('RPT-')) return { href: `/api/reports/${encodeURIComponent(ref)}?format=md`, external: true }
  if (ref.startsWith('NTC-')) return { href: noticeHref(ref) }
  if (ref.startsWith('QNA-')) return { href: qnaHref(ref) }
  if (ref.startsWith('SAS-')) return { href: '/settings/saas-catalog' }
  if (ref.startsWith('DSP-')) return { href: '/assets/disposal' }
  if (ref.startsWith('LOT-') || ref.startsWith('IN-')) return { href: '/assets/intake' }
  if (ref.startsWith('DSC-')) return { href: '/discovery/found' }
  // AI 제안 — 승인·반려 판정이 감사 로그에 target: INS-… 로 남는데 매핑이 없어 텍스트로만 찍혔다(판정 화면이 있는데 진입 경로가 없음).
  if (ref.startsWith('INS-')) return { href: '/ai/insights' }
  // 발견 화면의 채널별 발견 표 — 계정(휴면·권한), USB 반출, 로컬 VM, 클라우드 리소스, 미인가 SW.
  //  이 신호들도 escalate/dispatch 로 통지·감사에 ref 가 남는데 매핑이 없어 링크 없는 텍스트로만 보였다(조치 화면이 있는데 진입 경로가 없음).
  //  두 화면 모두 표를 다섯·네 개씩 쌓아 두므로 화면 맨 위로만 보내면 통지가 가리킨 그 건을 스크롤해 찾아야 한다 —
  //  각 표의 '미조치만 보기' 필터(?open=)를 켠 채 열어 통지가 말한 집합을 바로 보여 준다.
  const FOUND_TABLE: Record<string, string> = { 'ACCT-': 'accounts', 'USW-': 'sw', 'USB-': 'usb', 'LVM-': 'localvm', 'CLD-': 'cloud' }
  for (const [prefix, open] of Object.entries(FOUND_TABLE)) {
    if (ref.startsWith(prefix)) return { href: `/discovery/found?open=${open}` }
  }
  // 외부 위협·노출 화면 — 외부 공격표면(EXT·EASM), IOC 상관, 크리덴셜 노출, 다크웹 유출.
  //  EASM- 은 재탐지 대상(도메인)이라 조치 표가 없다 — 화면 상단의 재탐지 콘솔이 그 판정을 그대로 보여 준다.
  const EXTERNAL_TABLE: Record<string, string> = { 'EXT-': 'exposure', 'CRED-': 'creds', 'IOC-': 'ioc', 'LEAK-': 'leaks' }
  for (const [prefix, open] of Object.entries(EXTERNAL_TABLE)) {
    if (ref.startsWith(prefix)) return { href: `/discovery/external?open=${open}` }
  }
  if (ref.startsWith('EASM-')) return { href: '/discovery/external' }
  // 재물조사 회차 — 회차 딥링크(?round=)가 이미 있는데 기한 경과 독촉 통지의 ref 만 텍스트로 남았다.
  if (ref.startsWith('INV-')) return { href: `/inventory/survey?round=${encodeURIComponent(ref)}` }
  // 보증 만료 임박 통지 — 자산마다 보내지 않고 부서 단위로 묶어 보내므로 참조 ID 가 WRT-{부서}다(lib/expiry).
  //  계약·라이선스 통지는 CT-·LIC- 로 대상 화면이 열리는데 보증만 링크가 없어, 통지를 받은 쪽이 어느 자산인지
  //  찾아 들어갈 경로가 없었다. 대장의 보증 임박 필터에 그 부서를 얹어 통지가 가리킨 집합 그대로 연다.
  if (ref.startsWith('WRT-')) return { href: `/assets/register?warranty=soon&q=${encodeURIComponent(ref.slice(4))}` }
  // 안전재고 미달 발주 요청 — 유형 여러 종을 한 통에 묶어 보내 대상 ID 가 없다. 재고 화면이 그 판정을 그대로 보여준다.
  if (ref === 'STOCK') return { href: '/inventory/stock' }
  return null
}
