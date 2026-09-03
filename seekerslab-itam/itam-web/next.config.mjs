/** @type {import('next').NextConfig} */

/** 모든 응답에 붙는 보안 헤더.
 *
 *  그동안 이 앱은 보안 응답 헤더를 하나도 내보내지 않았다. 결재 승인·반려처럼 한 번의 클릭이
 *  자산 대장을 바꾸는 화면이 있는데도 프레임 삽입을 막는 헤더가 없었다.
 *
 *  - X-Frame-Options: 클릭재킹 차단. 공격자 페이지가 이 앱을 투명 iframe 으로 겹쳐 두면,
 *    결재자는 자기 화면을 누른다고 믿으면서 '승인'을 누르게 된다(UI redress). 앱 자신은
 *    iframe 을 한 곳도 쓰지 않으므로(사용처 0곳 — 인쇄 문서는 target="_blank" 로 연다)
 *    SAMEORIGIN 이 아니라 DENY 로 잠근다.
 *  - X-Content-Type-Options: MIME 스니핑 차단. 인쇄 문서 라우트는 사람이 넣은 모델명·비고·
 *    사유가 섞인 text/html 을 돌려주고, 반출 라우트는 xlsx·csv 바이트를 돌려준다. 브라우저가
 *    선언한 타입을 무시하고 내용을 추측하면 그 경계가 무너진다.
 *  - Referrer-Policy: 이 앱의 URL 에는 식별자가 실린다(?sel=AST-2019-000218 처럼 자산번호,
 *    결재 ID, 사용자 이름). 기본값이면 외부 링크를 눌렀을 때 그 주소가 Referer 로 상대 사이트에
 *    넘어간다. 교차 출처에는 출처만 보낸다.
 *  - Permissions-Policy: 앱이 쓰지 않는 강력한 브라우저 기능을 미리 꺼 둔다.
 *
 *  CSP 는 넣지 않았다 — Next 가 부트스트랩에 인라인 스크립트를 쓰므로 nonce 를 미들웨어까지
 *  배선해야 하고, 반쯤 맞는 CSP 는 화면을 조용히 깨뜨린다. 별도 작업으로 다룬다.
 *  헤더가 실제로 붙는지는 스모크가 실제 응답에서 잰다(설정 파일을 읽어 판정하지 않는다). */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
]

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

export default nextConfig
