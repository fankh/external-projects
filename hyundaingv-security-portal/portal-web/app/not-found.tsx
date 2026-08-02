import Link from 'next/link'

/** 브랜디드 404 — 미정의 경로·권한 밖 딥링크에서 기본 영문 화면 대신 노출된다 */
export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--canvas)' }}>
      <div className="card" style={{ width: 420, padding: '28px 30px', textAlign: 'center', gap: 10 }}>
        <div className="kicker">404 — Not Found</div>
        <div style={{ fontSize: 19, fontWeight: 800 }}>화면을 찾을 수 없습니다</div>
        <p className="dim" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          주소가 잘못되었거나 메뉴 체계에 없는 경로입니다.
          권한이 필요한 화면은 로그인 후 내비게이션으로 이동하세요.
        </p>
        <div style={{ marginTop: 6 }}>
          <Link className="btn pri" href="/dashboard">개인별현황으로 이동</Link>
        </div>
      </div>
    </div>
  )
}
