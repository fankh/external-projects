/** SAML 테스트 픽스처 생성기 — samlSso 참조 어댑터의 서명 규약(Assertion 직렬 바이트에 대한 RSA-SHA256)에
 *  맞춰 서명된 SAMLResponse(base64)를 만든다. e2e(sc_sso_saml)가 호출한다.
 *  사용: node scripts/saml_gen.mjs <keyfile> <nameId> <audience> <acsUrl> <notOnOrAfter> [--tamper]
 *  --tamper 는 서명 후 Assertion 바이트를 변조해(서명 불일치) 검증 거부 경로를 시험한다. */
import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

const [, , keyFile, nameId, audience, _acsUrl, notOnOrAfter, flag] = process.argv
const key = readFileSync(keyFile, 'utf8')

const assertion =
  `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_a1" Version="2.0" IssueInstant="${notOnOrAfter}">`
  + `<saml:Issuer>https://idp.example/entity</saml:Issuer>`
  + `<saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">${nameId}</saml:NameID></saml:Subject>`
  + `<saml:Conditions NotOnOrAfter="${notOnOrAfter}"><saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions>`
  + `<saml:AttributeStatement>`
  + `<saml:Attribute Name="dept"><saml:AttributeValue>정보기획팀</saml:AttributeValue></saml:Attribute>`
  + `<saml:Attribute Name="email"><saml:AttributeValue>${nameId}@narae.example</saml:AttributeValue></saml:Attribute>`
  + `</saml:AttributeStatement>`
  + `</saml:Assertion>`

// 서명 — Assertion 직렬 바이트에 대한 RSA-SHA256 (참조 어댑터가 검증하는 대상과 동일 바이트).
const signer = createSign('RSA-SHA256')
signer.update(Buffer.from(assertion, 'utf8'))
const sig = signer.sign(key).toString('base64')

// 변조 — 서명 후 Assertion 내용을 바꿔 서명이 더 이상 맞지 않게 한다(거부 경로 시험).
const emitted = flag === '--tamper' ? assertion.replace('정보기획팀', '변조부서') : assertion

const response =
  `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" ID="_r1" Version="2.0">`
  + `<ds:SignatureValue>${sig}</ds:SignatureValue>`
  + emitted
  + `</samlp:Response>`

process.stdout.write(Buffer.from(response, 'utf8').toString('base64'))
