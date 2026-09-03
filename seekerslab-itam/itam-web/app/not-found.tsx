import Link from 'next/link'
/** CSP nonce 는 요청마다 새로 만들어지므로 빌드 시점에 굳은 HTML 에는 붙지 않는다.
 *  이 화면이 정적으로 프리렌더되면 미들웨어가 세운 nonce 와 HTML 의 nonce 가 어긋나 인라인
 *  부트스트랩 스크립트가 차단된다(실측: 헤더 nonce 는 있는데 HTML 에는 없었다). 데이터를 읽지
 *  않는 화면이라 매 요청 렌더 비용은 무시할 수 있고, 그 대가로 앱 전체가 같은 엄격 CSP 를 받는다. */
export const dynamic = 'force-dynamic'


/** 없는 주소 — Next 기본 화면은 영어 한 줄('This page could not be found')에 돌아갈 길도 없다.
 *  오타·낡은 즐겨찾기·삭제된 레코드 딥링크로 흔히 닿는 자리라, 무엇이 없었는지 한국어로 알리고
 *  대시보드·로그인으로 돌아갈 길을 준다(전역 오류 화면 global-error 와 같은 자립 스타일). */
export default function NotFound() {
  return (
    <div style={{ fontFamily: '-apple-system, "Segoe UI", "Malgun Gothic", sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#f4f5f7', color: '#14161a' }}>
      <div style={{ textAlign: 'center', maxWidth: 460, padding: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: '.08em', color: '#5b6470', fontWeight: 700 }}>SEEKERSLAB ITAM</div>
        <h2 style={{ margin: '8px 0' }}>요청하신 화면을 찾을 수 없습니다</h2>
        <p style={{ color: '#5b6470', fontSize: 14, lineHeight: 1.7 }}>
          주소가 바뀌었거나, 삭제된 항목의 링크일 수 있습니다.
          <br />대시보드에서 다시 찾아보시거나 좌측 메뉴를 이용해 주세요.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
          <Link href="/dashboard" style={{ padding: '8px 16px', border: '1px solid #1f6feb', background: '#1f6feb', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>대시보드로</Link>
          <Link href="/login" style={{ padding: '8px 16px', border: '1px solid #c3c8d0', background: '#fff', color: '#14161a', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>로그인 화면</Link>
        </div>
      </div>
    </div>
  )
}
