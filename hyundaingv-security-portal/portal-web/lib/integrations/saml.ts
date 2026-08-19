/** SSO(SAML 2.0) 참조 어댑터 — SP-initiated 로그인 리다이렉트 생성 + IdP SAMLResponse 검증.
 *
 *  요구사항: "SSO구현 — SAML 적용 (Knox portal 연동)". 이 참조 구현은 연동 계약(SsoAdapter)을 채우고
 *  실제 crypto(RSA-SHA256)로 어설션 서명을 검증한다. 환경변수로 IdP·SP 메타데이터를 주입한다:
 *    PORTAL_SAML_IDP_SSO_URL   — IdP SSO 엔드포인트 (HTTP-Redirect 바인딩)
 *    PORTAL_SAML_IDP_CERT      — IdP 서명 검증용 공개키/인증서 (PEM)
 *    PORTAL_SAML_SP_ENTITY_ID  — SP(포털) EntityID (audience 검증 기준)
 *    PORTAL_SAML_SP_ACS_URL    — SP ACS(Assertion Consumer Service) URL
 *    PORTAL_SAML_IDP_ENTITY_ID — (선택) IdP EntityID (Issuer 검증)
 *
 *  ── 서명 검증 범위(중요) ──
 *  이 참조는 어설션 요소의 '직렬 바이트'에 대한 RSA-SHA256 서명을 검증한다(암호학적으로 실효적). 실 SAML 은
 *  enveloped XML-DSig + Exclusive C14N 정규화를 쓰므로, 실 배포는 검증 라이브러리(@node-saml/node-saml 등)로
 *  교체한다 — 계약(SsoAdapter)은 동일하다. 여기서는 프레임워크 연동 지점과 검증 흐름을 실증한다. */
import { createVerify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import type { SsoAdapter, SsoAssertion } from './types'

function env(k: string): string {
  return (process.env[k] ?? '').trim()
}

/** 정규식으로 요소 내용을 뽑는다(참조용 파서) — 실 배포의 XML-DSig 라이브러리 사용 시 불필요. */
function between(xml: string, startTag: string, endTag: string): string | null {
  const i = xml.indexOf(startTag)
  if (i < 0) return null
  const j = xml.indexOf(endTag, i + startTag.length)
  if (j < 0) return null
  return xml.slice(i + startTag.length, j)
}

/** 접두사 무관하게 <...:Assertion ...> ~ </...:Assertion> 원문(서명 대상 바이트)을 잘라낸다. */
function extractAssertion(xml: string): string | null {
  const m = /<([A-Za-z0-9]+:)?Assertion[\s>]/.exec(xml)
  if (!m) return null
  const start = m.index
  const prefix = m[1] ?? ''
  const closeTag = `</${prefix}Assertion>`
  const end = xml.indexOf(closeTag, start)
  if (end < 0) return null
  return xml.slice(start, end + closeTag.length)
}

function attr(el: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`).exec(el)
  return m ? m[1] : null
}

/** SP(포털) SAML 메타데이터 XML — IdP 관리자가 신뢰 관계(EntityID·ACS·바인딩)를 구성할 때 임포트한다.
 *  EntityID 는 PORTAL_SAML_SP_ENTITY_ID, ACS 는 PORTAL_SAML_SP_ACS_URL(미설정 시 인자 acsUrl=요청 기준). */
export function spMetadata(acsUrl: string): string {
  const sp = env('PORTAL_SAML_SP_ENTITY_ID') || 'ngv-governance-portal'
  const acs = env('PORTAL_SAML_SP_ACS_URL') || acsUrl
  return `<?xml version="1.0" encoding="UTF-8"?>`
    + `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${sp}">`
    + `<md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true"`
    + ` protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">`
    + `<md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</md:NameIDFormat>`
    + `<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"`
    + ` Location="${acs}" index="0" isDefault="true"/>`
    + `</md:SPSSODescriptor></md:EntityDescriptor>`
}

export const samlSso: SsoAdapter = {
  loginRedirect(relayState: string): { url: string } {
    // SP-initiated AuthnRequest — HTTP-Redirect 바인딩(DEFLATE + base64 + urlencode). 부작용·네트워크 없음.
    const acs = env('PORTAL_SAML_SP_ACS_URL')
    const sp = env('PORTAL_SAML_SP_ENTITY_ID') || 'ngv-governance-portal'
    const idp = env('PORTAL_SAML_IDP_SSO_URL')
    // id·시각은 요청마다 달라야 하나, 참조/자가진단 안전을 위해 relayState 파생 고정값을 쓴다(Math.random·Date 회피).
    const reqId = `_ngv-${Buffer.from(relayState).toString('hex').slice(0, 16) || 'probe'}`
    const authn = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"`
      + ` xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${reqId}" Version="2.0"`
      + ` ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"`
      + `${acs ? ` AssertionConsumerServiceURL="${acs}"` : ''}>`
      + `<saml:Issuer>${sp}</saml:Issuer></samlp:AuthnRequest>`
    const encoded = encodeURIComponent(deflateRawSync(authn).toString('base64'))
    const sep = idp.includes('?') ? '&' : '?'
    const url = `${idp}${sep}SAMLRequest=${encoded}&RelayState=${encodeURIComponent(relayState)}`
    return { url }
  },

  async verifyResponse(samlResponseB64: string): Promise<SsoAssertion> {
    // 인증서는 환경변수(PEM) 또는 파일 경로(PORTAL_SAML_IDP_CERT_FILE)로 주입한다.
    const certFile = env('PORTAL_SAML_IDP_CERT_FILE')
    const cert = certFile ? readFileSync(certFile, 'utf8') : env('PORTAL_SAML_IDP_CERT')
    if (!cert) throw new Error('SAML IdP 인증서 미설정 (PORTAL_SAML_IDP_CERT)')
    const xml = Buffer.from(samlResponseB64, 'base64').toString('utf8')

    const assertion = extractAssertion(xml)
    if (!assertion) throw new Error('SAMLResponse 에 Assertion 없음')

    // 서명 검증 — Assertion 직렬 바이트에 대한 RSA-SHA256 (SignatureValue). 실패 시 throw.
    const sigB64 = between(xml, '<ds:SignatureValue>', '</ds:SignatureValue>')
      ?? between(xml, '<SignatureValue>', '</SignatureValue>')
    if (!sigB64) throw new Error('SAMLResponse 에 SignatureValue 없음')
    const verifier = createVerify('RSA-SHA256')
    verifier.update(Buffer.from(assertion, 'utf8'))
    const ok = verifier.verify(cert, Buffer.from(sigB64.trim(), 'base64'))
    if (!ok) throw new Error('SAML 어설션 서명 검증 실패')

    // 조건 검증 — 만료(NotOnOrAfter) · audience(SP EntityID) · (선택) Issuer.
    const conditions = between(assertion, '<saml:Conditions', '</saml:Conditions>')
      ?? between(assertion, '<Conditions', '</Conditions>')
    if (conditions) {
      const notOnOrAfter = attr(conditions, 'NotOnOrAfter')
      if (notOnOrAfter && Date.parse(notOnOrAfter) <= Date.parse(env('PORTAL_SAML_NOW') || new Date().toISOString())) {
        throw new Error('SAML 어설션 만료(NotOnOrAfter 경과)')
      }
      const sp = env('PORTAL_SAML_SP_ENTITY_ID')
      if (sp && conditions.includes('Audience') && !conditions.includes(`>${sp}<`)) {
        throw new Error('SAML audience 불일치')
      }
    }
    const idpEntity = env('PORTAL_SAML_IDP_ENTITY_ID')
    if (idpEntity) {
      const issuer = between(assertion, '<saml:Issuer>', '</saml:Issuer>') ?? between(assertion, '<Issuer>', '</Issuer>')
      if (issuer && issuer.trim() !== idpEntity) throw new Error('SAML Issuer 불일치')
    }

    const nameId = (between(assertion, '<saml:NameID', '</saml:NameID>') ?? between(assertion, '<NameID', '</NameID>') ?? '')
      .replace(/^[^>]*>/, '').trim()
    if (!nameId) throw new Error('SAML 어설션에 NameID 없음')

    // 속성 추출 — <saml:Attribute Name="X"><saml:AttributeValue>V</...>
    const attributes: Record<string, string> = {}
    const attrRe = /<(?:[A-Za-z0-9]+:)?Attribute\s+[^>]*Name="([^"]+)"[^>]*>[\s\S]*?<(?:[A-Za-z0-9]+:)?AttributeValue[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?AttributeValue>/g
    let am: RegExpExecArray | null
    while ((am = attrRe.exec(assertion)) !== null) attributes[am[1]] = am[2].trim()

    return { nameId, attributes }
  },
}
