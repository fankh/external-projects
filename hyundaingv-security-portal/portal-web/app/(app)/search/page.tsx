import Link from 'next/link'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
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
  const canManage = me.role === 'BIZ_MGR' || me.role === 'ADMIN'
  const has = (...fields: (string | undefined)[]) => query !== '' && fields.some((f) => f?.includes(query))

  // 각 도메인의 화면 스코핑을 그대로 따른다 — 검색이 권한 우회 경로가 되지 않도록
  const groups: { label: string; hits: Hit[] }[] = []

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

  groups.push({
    label: '게시판',
    hits: [
      ...s.notices.filter((n) => has(n.title)).map((n) => ({
        href: '/board/notices', code: n.id, title: n.title, meta: `공지 · ${n.category} · ${n.postedAt}`,
      })),
      ...s.qna.filter((x) => has(x.title, x.answer)).map((x) => ({
        href: '/board/qna', code: x.id, title: x.title, meta: `QnA · ${x.answer ? '답변완료' : '답변 대기'}`,
      })),
    ],
  })

  groups.push({
    label: 'IT 투자/비용',
    hits: s.investContracts.filter((c) => has(c.id, c.title, c.vendor)).map((c) => ({
      href: c.kind === '투자' ? '/finance/invest' : '/finance/expense',
      code: c.id, title: c.title, meta: `${c.kind} 계약 · ${c.vendor} · ${c.amount.toLocaleString('ko-KR')}만원`,
    })),
  })

  if (canManage) {
    groups.push({
      label: '인프라 운영',
      hits: [
        ...s.incidents.filter((i) => has(i.id, i.title, i.system)).map((i) => ({
          href: '/infra/incidents', code: i.id, title: i.title, meta: `장애 · ${i.system} · ${i.status}`,
        })),
        ...s.changes.filter((c) => has(c.id, c.title, c.srNo)).map((c) => ({
          href: '/infra/changes', code: c.id, title: c.title, meta: `${c.kind}변경 · ${c.status}`,
        })),
      ],
    })
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
          <b>통합 검색</b> — SR·공지·QnA·계약{canManage ? '·장애·변경·프로젝트' : ''} 를 한 번에 찾는다.
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
