import Link from 'next/link'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireMenu } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore } from '@/lib/store'
import type { TodoItem } from '@/lib/types'

/** 할일은 체크박스로 지우는 게 아니라 해당 업무 화면에서 처리해야 닫힌다 —
 *  결재는 결재함에서, 서약은 서약서 제출에서. 여기서는 모아 보고 바로가기만 제공한다. */
const KIND_HREF: Record<TodoItem['kind'], { href: string; label: string }> = {
  보안서약서: { href: '/pledge/my', label: '서약서 제출' },
  보안교육: { href: '/compliance/education', label: '교육 이수' },
  '재택 체크리스트': { href: '/awareness/remote', label: '체크리스트 제출' },
  '출력물 폐기확인': { href: '/awareness/prints', label: '폐기현황 상신' },
  'SR 처리': { href: '/sr/ci', label: 'SR 처리' },
  결재: { href: '/work/approvals', label: '결재함 이동' },
  재상신: { href: '/sr/requests', label: '재상신하기' },
}

/** 반려 재상신 할일은 제목의 문서 유형 태그로 해당 업무 화면을 찾는다 (태그 없는 과거 할일은 SR 기본) */
const RESUBMIT_HREF: [string, string][] = [
  ['SR 신청', '/sr/requests'],
  ['투자 정산품의', '/finance/invest'],
  ['비용 정산품의', '/finance/expense'],
  ['장애보고 상신', '/infra/incidents'],
  ['변경계획 상신', '/infra/changes'],
  ['변경결과 상신', '/infra/changes'],
  ['점검결과 상신', '/compliance/inspection'],
  ['출력물폐기 상신', '/awareness/prints'],
  ['보안위반 확인서', '/awareness/violations'],
  ['서약 현황 상신', '/pledge/manage'],
  ['부서서약 현황 상신', '/pledge/dept'],
]

function todoLink(x: TodoItem): { href: string; label: string } {
  if (x.kind === '재상신') {
    const hit = RESUBMIT_HREF.find(([tag]) => x.title.startsWith(`[${tag}]`))
    if (hit) return { href: hit[1], label: '재상신하기' }
  }
  return KIND_HREF[x.kind]
}

export default async function TodoPage() {
  const me = await requireMenu('/work/todo')
  const s = getStore()
  const t = today()

  const mine = s.todos.filter((x) => x.owner === me.name)
  const open = mine.filter((x) => !x.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const overdue = open.filter((x) => x.dueDate < t)
  const done = mine.filter((x) => x.done)

  return (
    <>
      <ScreenHeader kicker="My Work" title="나의 할일"
        desc="서약·교육·체크리스트·SR·결재 — 각 업무 화면에서 처리하면 할일이 자동으로 닫힌다." />

      <div className="stat-row">
        <Stat value={open.length} label="미처리" tone={open.length > 0 ? 'warn' : undefined} />
        <Stat value={overdue.length} label="기한 경과" tone={overdue.length > 0 ? 'err' : undefined} note={`오늘 ${t}`} />
        <Stat value={done.length} label="처리 완료" />
      </div>

      <Card title="미처리 할일" kicker="Open" pad={false}>
        {open.length === 0 ? (
          <div className="empty">처리할 할일이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>유형</th><th>제목</th><th>기한</th><th className="c">바로가기</th></tr></thead>
              <tbody>
                {open.map((x) => (
                  <tr key={x.id}>
                    <td><Chip tone="neutral" bare>{x.kind}</Chip></td>
                    <td className="strong">{x.title}</td>
                    <td className="tnum">
                      {x.dueDate}{' '}
                      {x.dueDate < t && <Chip tone="err" bare>기한 경과</Chip>}
                    </td>
                    <td className="c">
                      <Link className="btn sm" href={todoLink(x).href}>{todoLink(x).label}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="처리 완료" kicker="Done" pad={false}>
        {done.length === 0 ? (
          <div className="empty">처리한 할일이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>유형</th><th>제목</th><th>기한</th></tr></thead>
              <tbody>
                {done.map((x) => (
                  <tr key={x.id}>
                    <td><Chip tone="ok" bare>{x.kind}</Chip></td>
                    <td className="mute" style={{ textDecoration: 'line-through' }}>{x.title}</td>
                    <td className="tnum mute">{x.dueDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
