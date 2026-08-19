import { today } from '@/lib/dates'
import { inNoticeAudience } from '@/lib/notice'
import { assetHref, contractHref, noticeHref, qnaHref } from '@/lib/reflink'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'

/** 전역 통합 검색 — 자산·계약·발견·Shadow SaaS·사용자·결재·게시판·폐기·입고를 한 번에 훑어 해당 화면으로 점프한다.
 *  권한 스코핑은 각 화면 가드와 동일하게 적용한다: 사용자(USER)는 본인 자산·본인 결재만,
 *  계약·발견·사용자 목록은 그 화면 접근 권한이 있는 역할에게만 노출된다(제품안내서 §02 최소권한). */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase()
  if (q.length < 2) return Response.json({ groups: [] })

  const s = getStore()
  const role = session.role
  const isUser = role === 'USER'
  const can = (roles: string[]) => roles.includes(role)
  const hit = (...fields: (string | undefined)[]) => fields.some((f) => f?.toLowerCase().includes(q))
  const LIMIT = 6

  const groups: { kind: string; items: { label: string; sub: string; href: string }[] }[] = []

  // 자산 — 사용자는 본인 보유만
  const assets = (isUser ? s.assets.filter((a) => a.owner === session.name) : s.assets)
    .filter((a) => hit(a.assetNo, a.model, a.owner, a.dept, a.ip, a.serial, a.location, a.contractId))
    .slice(0, LIMIT)
    .map((a) => ({ label: `${a.assetNo} · ${a.model}`, sub: `${a.owner} · ${a.dept} · ${a.status}`, href: assetHref(a.assetNo) }))
  if (assets.length) groups.push({ kind: '자산', items: assets })

  // 계약·라이선스 — 계약 화면 권한(자산담당·Admin)
  if (can(['ASSET_MGR', 'ADMIN'])) {
    const contracts = s.contracts.filter((c) => hit(c.id, c.name, c.vendor, c.ownerDept)).slice(0, LIMIT)
      .map((c) => ({ label: `${c.id} · ${c.name}`, sub: `${c.vendor} · ${c.ownerDept}${c.status === '해지' ? ' · 해지' : ''}`, href: contractHref(c.id) }))
    const lics = s.licenses.filter((l) => hit(l.id, l.name, l.vendor)).slice(0, LIMIT)
      .map((l) => ({ label: `${l.id} · ${l.name}`, sub: `${l.vendor} · 보유 ${l.purchased}/사용 ${l.used}`, href: '/inventory/contracts' }))
    const merged = [...contracts, ...lics].slice(0, LIMIT)
    if (merged.length) groups.push({ kind: '계약·라이선스', items: merged })
  }

  // 발견 자산 — 발견 화면 권한(자산담당·보안담당·Admin)
  if (can(['ASSET_MGR', 'SEC_MGR', 'ADMIN'])) {
    const disc = s.discovered.filter((d) => hit(d.id, d.hostname, d.ip, d.mac, d.type)).slice(0, LIMIT)
      .map((d) => ({ label: `${d.id} · ${d.hostname}`, sub: `${d.type} · ${d.ip} · ${d.state}`, href: `/discovery/found?sel=${d.id}` }))
    if (disc.length) groups.push({ kind: '발견 자산', items: disc })
  }

  // Shadow SaaS — 발견 화면 권한(자산담당·보안담당·Admin). 서비스명·분류·부서로 찾아 Shadow SaaS 현황으로 점프.
  if (can(['ASSET_MGR', 'SEC_MGR', 'ADMIN'])) {
    const saas = s.saas.filter((x) => hit(x.service, x.category, x.dept)).slice(0, LIMIT)
      .map((x) => ({ label: x.service, sub: `${x.category} · ${x.dept} · ${x.sanctioned ? '인가' : '미인가'}`, href: '/discovery/saas' }))
    if (saas.length) groups.push({ kind: 'Shadow SaaS', items: saas })
  }

  // 사용자 — 사용자 관리 화면 권한(Admin)
  if (can(['ADMIN'])) {
    const users = s.users.filter((u) => hit(u.login, u.name, u.dept, u.group)).slice(0, LIMIT)
      .map((u) => ({ label: `${u.name} (${u.login})`, sub: `${u.dept} · ${u.group}`, href: `/settings/users` }))
    if (users.length) groups.push({ kind: '사용자', items: users })
  }

  // 폐기·입고 — 자산관리 처리 권한(자산담당·Admin). 폐기는 자산·사유·확인서번호, 입고는 SR·발주·모델로 찾는다.
  if (can(['ASSET_MGR', 'ADMIN'])) {
    const disp = s.disposals.filter((d) => hit(d.id, d.assetNo, d.model, d.reason, d.certNo)).slice(0, LIMIT)
      .map((d) => ({ label: `${d.id} · ${d.assetNo}`, sub: `${d.model} · ${d.status}`, href: '/assets/disposal' }))
    const lots = s.intakeLots.filter((l) => hit(l.id, l.model, l.srNo, l.contractId, l.vendor)).slice(0, LIMIT)
      .map((l) => ({ label: `${l.id} · ${l.model}`, sub: `${l.vendor} · ${l.status}${l.srNo ? ` · SR ${l.srNo}` : ''}`, href: '/assets/intake' }))
    const merged = [...disp, ...lots].slice(0, LIMIT)
    if (merged.length) groups.push({ kind: '폐기·입고', items: merged })
  }

  // 결재 — 사용자는 본인 기안분 + 우리 부서로 온 소유자 확인 요청(응답 대상). 결재함 화면(page.tsx)의 USER 스코핑과 동일 — 검색만 좁아 사용자가 응답할 건을 못 찾던 공백을 닫는다.
  const aprs = (isUser ? s.approvals.filter((a) => a.requester === session.name || (a.kind === '소유자 확인' && a.dept === session.dept)) : s.approvals)
    .filter((a) => hit(a.id, a.title, a.requester, a.kind)).slice(0, LIMIT)
    .map((a) => ({ label: `${a.id} · ${a.title}`, sub: `${a.kind} · ${a.requester} · ${a.status}`, href: '/workflow/approvals' }))
  if (aprs.length) groups.push({ kind: '결재', items: aprs })

  // 게시판 — 공지·QnA (전 권한그룹 열람). 공지는 발행 도래분만(관리자는 예약분 포함), QnA 전체. 특정 게시글로 딥링크(?sel=).
  const t = today()
  const posts = s.posts
    // 공지 스코핑을 화면·대시보드와 동일하게 — 발행 도래분만(관리자는 예약분 포함) + 대상 부서 스코핑(inNoticeAudience).
    // 부서 지정 공지가 검색으로 대상 밖 사용자에게 제목·본문이 유출되던 정합 공백을 닫는다(QnA 는 전 권한그룹 열람이라 예외).
    .filter((p) => p.kind === 'QnA' || (role === 'ADMIN'
      ? true
      : (!p.publishAt || p.publishAt <= t) && inNoticeAudience(p, session.dept)))
    .filter((p) => hit(p.id, p.title, p.body, p.author, p.category))
    .slice(0, LIMIT)
    .map((p) => ({
      label: `${p.kind === '공지' ? '[공지]' : '[QnA]'} ${p.title}`,
      sub: `${p.category ? `${p.category} · ` : ''}${p.author} · ${p.createdAt}`,
      href: p.kind === '공지' ? noticeHref(p.id) : qnaHref(p.id),
    }))
  if (posts.length) groups.push({ kind: '게시판', items: posts })

  return Response.json({ groups })
}
