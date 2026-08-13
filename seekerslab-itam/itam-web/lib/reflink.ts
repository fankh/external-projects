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
  return null
}
