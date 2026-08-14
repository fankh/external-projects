import Link from 'next/link'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { effectiveRoles, requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { SR_CHIP, srStatusLabel } from '../sr/chips'

interface Hit {
  href: string
  code: string
  title: string
  meta: string
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const { q } = await searchParams
  const query = (q ?? '').trim()
  const s = getStore()
  const canViewFinance = me.role !== 'USER'  // 재무(계약·실적)는 관리자급만 — 화면 스코핑과 동일
  // 검색은 화면 가드(requireMenu→effectiveRoles)와 동일한 런타임 권한을 따라야 한다 — me.role 리터럴로
  // 게이트하면 메뉴권한(menuOverrides) 런타임 제한을 무시해, 화면에서 차단된 역할이 검색으로 데이터를
  // 열람하는 우회 경로가 된다(요구 72행 통제 무력화). 각 도메인은 소속 화면 href 의 유효권한으로 게이트한다.
  const canAccess = (href: string) => effectiveRoles(href).includes(me.role)
  // 손상 데이터(문자열이어야 할 필드가 숫자 등)로 includes 가 500 나지 않도록 문자열로 강제 후 매칭
  const has = (...fields: (string | undefined)[]) => query !== '' && fields.some((f) => String(f ?? '').includes(query))

  // 각 도메인의 화면 스코핑·런타임 권한을 그대로 따른다 — 검색이 권한 우회 경로가 되지 않도록
  const groups: { label: string; hits: Hit[] }[] = []

  if (canAccess('/sr/requests')) {
    const srScoped = s.srRequests.filter((r) =>
      me.role === 'USER' ? r.requester === me.name :
      me.role === 'DEPT_MGR' ? r.dept === me.dept : true,
    )
    groups.push({
      label: 'IT Request',
      hits: srScoped.filter((r) => has(r.srNo, r.title, r.system, r.content)).map((r) => ({
        href: `/sr/requests?q=${encodeURIComponent(r.srNo)}`,
        code: r.srNo, title: r.title, meta: `${r.kind} · ${r.system} · ${srStatusLabel(r)}`,
      })),
    })
  }

  groups.push({
    label: '게시판',
    hits: [
      ...(canAccess('/board/notices') ? s.notices.filter((n) => has(n.title)).map((n) => ({
        href: '/board/notices', code: n.id, title: n.title, meta: `공지 · ${n.category} · ${n.postedAt}`,
      })) : []),
      ...(canAccess('/board/qna') ? s.qna.filter((x) => has(x.title, x.answer)).map((x) => ({
        href: '/board/qna', code: x.id, title: x.title, meta: `QnA · ${x.answer ? '답변완료' : '답변 대기'}`,
      })) : []),
    ],
  })

  if (canViewFinance) {
    // 계약은 종류별로 소속 화면이 다르다(투자→/finance/invest, 비용→/finance/expense) — 각 화면 유효권한으로 게이트
    groups.push({
      label: 'IT 투자/비용',
      hits: s.investContracts
        .filter((c) => has(c.id, c.title, c.vendor) && canAccess(c.kind === '투자' ? '/finance/invest' : '/finance/expense'))
        .map((c) => ({
          href: c.kind === '투자' ? '/finance/invest' : '/finance/expense',
          code: c.id, title: c.title, meta: `${c.kind} 계약 · ${c.vendor} · ${c.amount.toLocaleString('ko-KR')}만원`,
        })),
    })
  }

  groups.push({
    label: '인프라 운영',
    hits: [
      ...(canAccess('/infra/incidents') ? s.incidents.filter((i) => has(i.id, i.title, i.system)).map((i) => ({
        href: '/infra/incidents', code: i.id, title: i.title, meta: `장애 · ${i.system} · ${i.status}`,
      })) : []),
      ...(canAccess('/infra/changes') ? s.changes.filter((c) => has(c.id, c.title, c.srNo)).map((c) => ({
        href: '/infra/changes', code: c.id, title: c.title, meta: `${c.kind}변경 · ${c.status}`,
      })) : []),
    ],
  })

  if (canAccess('/projects/status')) {
    groups.push({
      label: '프로젝트',
      hits: s.projects.filter((p) => has(p.id, p.title)).map((p) => ({
        href: '/projects/status', code: p.id, title: p.title, meta: `PM ${p.manager} · 진척 ${p.progress}% · ${p.status}`,
      })),
    })
  }

  const nonEmpty = groups.filter((g) => g.hits.length > 0)
  const total = nonEmpty.reduce((sum, g) => sum + g.hits.length, 0)

  return (
    <>
      <ScreenHeader kicker="Search" title="통합 검색"
        desc={query ? `"${query}" 검색 결과 — 화면별 권한·데이터 스코핑이 그대로 적용된다.` : '타이틀바 검색창에 번호·제목·시스템명을 입력하세요.'} />

      <div className="stat-row">
        <Stat value={total} label="검색 결과" note={query ? `검색어: ${query}` : '검색어 없음'} />
        <Stat value={nonEmpty.length} label="도메인" />
      </div>

      {query === '' ? (
        <div className="callout">
          <b>통합 검색</b> — SR·공지·QnA·계약{canAccess('/infra/incidents') || canAccess('/projects/status') ? '·장애·변경·프로젝트' : ''} 를 한 번에 찾는다.
          예: <span className="mono">SR-2026</span>, <span className="mono">ERP</span>, <span className="mono">보안패치</span>
        </div>
      ) : total === 0 ? (
        <Card title="결과 없음" kicker="No Results">
          <div className="empty">"{query}" 에 해당하는 항목이 없습니다 — 권한 범위 밖이거나 존재하지 않는 항목입니다.</div>
        </Card>
      ) : (
        nonEmpty.map((g) => (
          <Card key={g.label} title={g.label} kicker={`${g.hits.length}건`} pad={false}>
            <div className="tbl-wrap">
              <table className="tbl">
                <tbody>
                  {g.hits.map((h) => (
                    <tr key={`${g.label}-${h.code}`}>
                      <td className="code" style={{ width: 130 }}>{h.code}</td>
                      <td className="strong"><Link href={h.href}>{h.title}</Link></td>
                      <td className="dim">{h.meta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}
    </>
  )
}
