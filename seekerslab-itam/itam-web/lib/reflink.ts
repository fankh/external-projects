/** 발송 이력·감사 로그의 참조 ID(ref/target) → 대상 화면 링크. ID 접두어로 대상을 판별한다.
 *  매핑되지 않는 값(부서명·'공지'·'Discovery' 등 라벨)은 null → 링크 없이 텍스트로 남긴다.
 *  클라이언트 안전(스토어·서버 모듈 비의존) — NotificationLog·AuditLog 가 공유한다. */
export function entityHref(ref?: string): { href: string; external?: boolean } | null {
  if (!ref) return null
  if (ref.startsWith('AST-')) return { href: `/assets/register?sel=${encodeURIComponent(ref)}` }
  if (ref.startsWith('APR-')) return { href: `/workflow/approvals?sel=${encodeURIComponent(ref)}` }
  if (ref.startsWith('CT-') || ref.startsWith('LIC-')) return { href: `/inventory/contracts?sel=${encodeURIComponent(ref)}` }
  if (ref.startsWith('RPT-')) return { href: `/api/reports/${encodeURIComponent(ref)}?format=md`, external: true }
  if (ref.startsWith('NTC-')) return { href: `/board/notices?sel=${encodeURIComponent(ref)}` }
  if (ref.startsWith('QNA-')) return { href: `/board/qna?sel=${encodeURIComponent(ref)}` }
  if (ref.startsWith('SAS-')) return { href: '/settings/saas-catalog' }
  if (ref.startsWith('DSP-')) return { href: '/assets/disposal' }
  if (ref.startsWith('LOT-') || ref.startsWith('IN-')) return { href: '/assets/intake' }
  if (ref.startsWith('DSC-')) return { href: '/discovery/found' }
  return null
}
