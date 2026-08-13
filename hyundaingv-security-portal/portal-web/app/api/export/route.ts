/** 엑셀 다운로드 API — 요구사항 '엑셀 ◎' 화면의 목록을 CSV(BOM)로 내린다.
 *  화면과 동일한 권한·데이터 스코핑을 서버에서 재적용한다(시큐어 코딩). */
import { csvResponse } from '@/lib/csv'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import type { Role } from '@/lib/types'

const YEAR = '2026'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return new Response('unauthorized', { status: 401 })
  const type = new URL(req.url).searchParams.get('type') ?? ''
  const s = getStore()
  const role: Role = session.role
  const isMgr = role === 'BIZ_MGR' || role === 'ADMIN'

  if (type === 'invest-actual' || type === 'expense-actual') {
    // 계획대비실적(투자·비용) — 조회·엑셀 전 권한 (요구사항 조회 ●, 엑셀 ◎)
    const kind = type === 'invest-actual' ? '투자' : '비용'
    const confirmed = s.investPlans.filter((p) => p.kind === kind && p.status === '확정')
    const rows: (string | number)[][] = [['과제번호', '과제명', '담당', '계획액(만원)', '계약액(만원)', '집행액(만원)', '집행률(%)']]
    for (const p of confirmed) {
      const cts = s.investContracts.filter((c) => c.planId === p.id)
      const contracted = cts.reduce((sum, c) => sum + c.amount, 0)
      const paid = cts.reduce((sum, c) => sum + s.settlements
        .filter((x) => x.contractId === c.id && x.status === '지급완료')
        .reduce((sm, x) => sm + x.amount, 0), 0)
      rows.push([p.id, p.title, `${p.owner}(${p.dept})`, p.amount, contracted, paid, p.amount ? Math.round((paid / p.amount) * 100) : 0])
    }
    return csvResponse(`${kind}_계획대비실적`, rows)
  }

  if (type === 'education-records') {
    if (!isMgr) return new Response('forbidden', { status: 403 })
    const done = s.educationCourses.filter((c) => c.status === '완료')
    const rows: (string | number)[][] = [['이름', '부서', ...done.map((c) => c.title), '이수율(%)']]
    for (const p of s.people) {
      const marks = done.map((c) => s.educationRecords.some((r) => r.courseId === c.id && r.name === p.name) ? '이수' : '미이수')
      const n = marks.filter((m) => m === '이수').length
      rows.push([p.name, p.dept, ...marks, done.length ? Math.round((n / done.length) * 100) : 0])
    }
    return csvResponse('보안교육_이수현황', rows)
  }

  if (type === 'pledge-status') {
    if (role === 'USER') return new Response('forbidden', { status: 403 })
    const revisedAt = s.pledgeForms.find((f) => f.kind === '일반')?.revisedAt ?? '0000-00-00'
    const signed = new Map(s.pledges.filter((p) => p.year === YEAR && p.kind === '일반' && p.signedAt >= revisedAt).map((p) => [p.name, p]))
    // 부서담당은 소속 부서만 — 화면과 동일 스코핑
    const scope = s.people.filter((p) => role !== 'DEPT_MGR' || p.dept === session.dept)
    const rows: (string | number)[][] = [['이름', '부서', '상태', '제출일', '방식']]
    for (const p of scope) {
      const sig = signed.get(p.name)
      rows.push([p.name, p.dept, sig ? '서약 완료' : '미서약', sig?.signedAt ?? '-', sig?.method ?? '-'])
    }
    return csvResponse('보안서약_현황', rows)
  }

  if (type === 'remote-status') {
    if (role === 'USER') return new Response('forbidden', { status: 403 })
    const period = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7)
    const submitted = s.remoteChecks.filter((r) => r.period === period)
    const scope = s.people.filter((p) => role !== 'DEPT_MGR' || p.dept === session.dept)
    const rows: (string | number)[][] = [['이름', '부서', `${period} 상태`, '제출일']]
    for (const p of scope) {
      const r = submitted.find((x) => x.name === p.name)
      rows.push([p.name, p.dept, r ? '제출' : '미제출', r?.submittedAt ?? '-'])
    }
    return csvResponse('재택근무_체크리스트_현황', rows)
  }

  if (type === 'audit') {
    if (role !== 'ADMIN') return new Response('forbidden', { status: 403 })
    const rows: (string | number)[][] = [['일시', '행위자', '행위', '상세']]
    for (const l of s.auditLogs) rows.push([l.at, l.actor, l.action, l.detail])
    return csvResponse('감사_이력', rows)
  }

  return new Response('unknown type', { status: 400 })
}
