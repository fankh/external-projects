import Link from 'next/link'
import { Card, ScreenHeader, Stat } from '@/components/ui'
import { effectiveRoles, requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { srStatusLabel } from '../sr/chips'

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

  if (canAccess('/work/approvals')) {
    // 결재는 역할이 아닌 신원 스코핑 — 기안자·결재자 본인 문서만(work/approvals 상세 열람 가드와 동일).
    // 역할 게이트만으론 전사 결재가 검색으로 유출된다(요구 72행 통제 무력화). id·제목·유형·기안자로 매칭.
    groups.push({
      label: '전자결재',
      hits: s.approvals
        .filter((a) => (a.approver === me.name || a.drafter === me.name) && has(a.id, a.title, a.docType, a.drafter, a.ref))
        .map((a) => ({
          href: `/work/approvals?sel=${encodeURIComponent(a.id)}`,
          code: a.id, title: a.title, meta: `${a.docType} · 기안 ${a.drafter} · ${a.status}`,
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

  if (canAccess('/compliance/security-review')) {
    groups.push({
      label: '보안 컴플라이언스',
      hits: s.securityReviews.filter((r) => has(r.id, r.title, r.target)).map((r) => ({
        href: '/compliance/security-review', code: r.id, title: r.title, meta: `${r.kind} · ${r.target} · ${r.status}`,
      })),
    })
  }

  if (canAccess('/compliance/risks')) {
    groups.push({
      label: '정보보호 위험평가',
      hits: s.riskItems.filter((r) => has(r.id, r.title, r.area, r.threat, r.vulnerability)).map((r) => ({
        href: '/compliance/risks', code: r.id, title: r.title, meta: `${r.area} · ${r.treatment} · ${r.status}`,
      })),
    })
  }

  if (canAccess('/compliance/policies')) {
    groups.push({
      label: '정책·지침',
      hits: s.securityPolicies.filter((p) => has(p.id, p.title, p.category)).map((p) => ({
        href: '/compliance/policies', code: p.id, title: p.title, meta: `${p.category} · ${p.version} · ${p.status}`,
      })),
    })
  }

  if (canAccess('/compliance/inspection')) {
    groups.push({
      label: '정보보호 점검',
      hits: s.inspectionItems.filter((i) => has(i.id, i.control, i.category)).map((i) => ({
        href: '/compliance/inspection', code: i.id, title: i.control, meta: `${i.category} · ${i.cycle} · ${i.source}`,
      })),
    })
  }

  if (canAccess('/compliance/dr')) {
    groups.push({
      label: '재해복구·업무연속성',
      hits: s.drPlans.filter((d) => has(d.id, d.title, d.system)).map((d) => ({
        href: '/compliance/dr', code: d.id, title: d.title, meta: `${d.system} · ${d.tier} · RTO ${d.rtoHours}h`,
      })),
    })
  }

  if (canAccess('/awareness/violations')) {
    // 보안위반은 화면과 동일 스코핑 — BIZ/ADMIN 은 전체, 그 외는 본인 것만(v.name===me.name). 검색이 타인
    // 위반(개인정보)을 여는 우회 경로가 되지 않게 화면 가드(page.tsx:99)를 그대로 따른다.
    const canManageViol = me.role === 'BIZ_MGR' || me.role === 'ADMIN'
    const scoped = canManageViol ? s.violations : s.violations.filter((v) => v.name === me.name)
    groups.push({
      label: '보안위반',
      hits: scoped.filter((v) => has(v.id, v.type, v.detail, v.name)).map((v) => ({
        href: '/awareness/violations', code: v.id, title: `${v.type} — ${v.name}`, meta: `${v.dept} · ${v.status}`,
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
          <b>통합 검색</b> — SR·전자결재·공지·QnA·계약{canAccess('/infra/incidents') || canAccess('/projects/status') ? '·장애·변경·프로젝트' : ''}{canAccess('/compliance/security-review') ? '·보안성검토·위험·정책·점검·재해복구' : ''}·보안위반 을 한 번에 찾는다.
          예: <span className="mono">SR-2026</span>, <span className="mono">ERP</span>, <span className="mono">보안패치</span>
        </div>
      ) : total === 0 ? (
        <Card title="결과 없음">
          <div className="empty">“{query}” 에 해당하는 항목이 없습니다 — 권한 범위 밖이거나 존재하지 않는 항목입니다.</div>
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
