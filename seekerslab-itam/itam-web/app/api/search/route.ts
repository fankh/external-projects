import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'

/** 전역 통합 검색 — 자산·계약·발견·사용자·결재를 한 번에 훑어 해당 화면으로 점프한다.
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
    .map((a) => ({ label: `${a.assetNo} · ${a.model}`, sub: `${a.owner} · ${a.dept} · ${a.status}`, href: `/assets/register?sel=${encodeURIComponent(a.assetNo)}` }))
  if (assets.length) groups.push({ kind: '자산', items: assets })

  // 계약·라이선스 — 계약 화면 권한(자산담당·Admin)
  if (can(['ASSET_MGR', 'ADMIN'])) {
    const contracts = s.contracts.filter((c) => hit(c.id, c.name, c.vendor, c.ownerDept)).slice(0, LIMIT)
      .map((c) => ({ label: `${c.id} · ${c.name}`, sub: `${c.vendor} · ${c.ownerDept}${c.status === '해지' ? ' · 해지' : ''}`, href: `/inventory/contracts?sel=${encodeURIComponent(c.id)}` }))
    const lics = s.licenses.filter((l) => hit(l.id, l.name, l.vendor)).slice(0, LIMIT)
      .map((l) => ({ label: `${l.id} · ${l.name}`, sub: `${l.vendor} · 보유 ${l.purchased}/사용 ${l.used}`, href: '/inventory/contracts' }))
    const merged = [...contracts, ...lics].slice(0, LIMIT)
    if (merged.length) groups.push({ kind: '계약·라이선스', items: merged })
  }

  // 발견 자산 — 발견 화면 권한(자산담당·보안담당·Admin)
  if (can(['ASSET_MGR', 'SEC_MGR', 'ADMIN'])) {
    const disc = s.discovered.filter((d) => hit(d.id, d.hostname, d.ip, d.mac, d.type)).slice(0, LIMIT)
      .map((d) => ({ label: `${d.id} · ${d.hostname}`, sub: `${d.type} · ${d.ip} · ${d.state}`, href: '/discovery/found' }))
    if (disc.length) groups.push({ kind: '발견 자산', items: disc })
  }

  // 사용자 — 사용자 관리 화면 권한(Admin)
  if (can(['ADMIN'])) {
    const users = s.users.filter((u) => hit(u.login, u.name, u.dept, u.group)).slice(0, LIMIT)
      .map((u) => ({ label: `${u.name} (${u.login})`, sub: `${u.dept} · ${u.group}`, href: `/settings/users` }))
    if (users.length) groups.push({ kind: '사용자', items: users })
  }

  // 결재 — 사용자는 본인 기안분만
  const aprs = (isUser ? s.approvals.filter((a) => a.requester === session.name) : s.approvals)
    .filter((a) => hit(a.id, a.title, a.requester, a.kind)).slice(0, LIMIT)
    .map((a) => ({ label: `${a.id} · ${a.title}`, sub: `${a.kind} · ${a.requester} · ${a.status}`, href: '/workflow/approvals' }))
  if (aprs.length) groups.push({ kind: '결재', items: aprs })

  return Response.json({ groups })
}
