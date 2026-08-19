import { ssoLoginAvailable } from '@/lib/integrations/registry'
import { spMetadata } from '@/lib/integrations/saml'

export const dynamic = 'force-dynamic'

/** SP SAML 메타데이터 — IdP 관리자가 신뢰 구성을 위해 임포트한다(EntityID·ACS·바인딩).
 *  실 SSO 채널이 가동된 프로필에서만 제공한다(데모 목업 프로필은 404). */
export async function GET(req: Request) {
  if (!ssoLoginAvailable()) return new Response('Not Found', { status: 404 })
  const acsUrl = new URL('/api/sso/acs', req.url).toString()
  return new Response(spMetadata(acsUrl), {
    status: 200,
    headers: { 'Content-Type': 'application/samlmetadata+xml; charset=utf-8' },
  })
}
