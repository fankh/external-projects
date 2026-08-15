import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { audit } from '@/lib/audit'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore, nextNo } from '@/lib/store'
import { SECURITY_REVIEW_KINDS } from '@/lib/types'
import type { SecurityReviewKind, SecurityReviewStatus } from '@/lib/types'

const ST_CHIP: Record<SecurityReviewStatus, 'neutral' | 'info' | 'warn' | 'ok'> = {
  계획: 'neutral', 진행: 'info', 조치중: 'warn', 완료: 'ok',
}
const NEXT: Partial<Record<SecurityReviewStatus, SecurityReviewStatus>> = {
  계획: '진행', 진행: '조치중', 조치중: '완료',
}

async function addReview(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/security-review', 'BIZ_MGR', 'ADMIN')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const kind = String(formData.get('kind') ?? '') as SecurityReviewKind
  const target = String(formData.get('target') ?? '').trim().slice(0, 80)
  const plannedAt = String(formData.get('plannedAt') ?? '')
  if (!title || !target || !SECURITY_REVIEW_KINDS.includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(plannedAt)) return
  const s = getStore()
  const id = nextNo('SEC', today().slice(0, 4), s.securityReviews.map((r) => r.id))
  s.securityReviews.unshift({ id, title, kind, target, reviewer: me.name, status: '계획', findings: 0, fixed: 0,
    critFound: 0, critFixed: 0, highFound: 0, highFixed: 0, medFound: 0, medFixed: 0, lowFound: 0, lowFixed: 0, plannedAt })
  revalidatePath('/compliance/security-review')
}

/** 발견·조치 건수 기록 — 진행·조치중 단계에서 취약점 발견 수와 조치 완료 수를 갱신하고 증적을 첨부한다. */
async function recordFindings(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/security-review', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const findings = Number(formData.get('findings'))
  const fixed = Number(formData.get('fixed'))
  const s = getStore()
  const r = s.securityReviews.find((x) => x.id === id && x.status !== '완료')
  if (!r || !Number.isFinite(findings) || findings < 0 || findings > 9999) return
  // 조치 수는 발견 수를 넘지 못한다 — 조치율 100% 초과·음수 방지 (governance 지표 무결성)
  if (!Number.isFinite(fixed) || fixed < 0 || fixed > findings) return
  r.findings = Math.round(findings)
  r.fixed = Math.round(fixed)
  // 취약점 점검·시큐어코딩 결과 보고서 등 자료 제출 (제품안내서 VI장: 자료 제출)
  registerUpload(id, formData.get('file'), me.name)
  revalidatePath('/compliance/security-review')
}

async function advanceReview(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/compliance/security-review', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const r = s.securityReviews.find((x) => x.id === id)
  if (!r) return
  const next = NEXT[r.status]
  if (!next) return
  // 완료 확정은 발견 취약점 전건 조치 후에만 — 미조치 잔여가 있으면 완료로 덮지 못하게 막는다(감사 무결성)
  if (next === '완료' && r.fixed < r.findings) return
  r.status = next
  if (next === '완료') {
    r.completedAt = today()
    audit(me.name, '보안성 검토 완료', `${r.id} ${r.title} — 발견 ${r.findings} · 조치 ${r.fixed}`)
  }
  revalidatePath('/', 'layout')
}

export default async function SecurityReviewPage() {
  const me = await requireMenu('/compliance/security-review')
  const s = getStore()
  const canManage = me.role === 'BIZ_MGR' || me.role === 'ADMIN'
  const rows = s.securityReviews
  const open = rows.filter((r) => r.status !== '완료')
  // 미조치 잔여 취약점 — 발견 대비 조치 미완료 (열린 검토 기준)
  const openFindings = open.reduce((sum, r) => sum + Math.max(0, r.findings - r.fixed), 0)
  // 평균 조치율 — 발견이 있는 검토만 분모로(발견 0 건은 조치 대상이 없어 제외), div-zero·false-100 방어
  const withFindings = rows.filter((r) => r.findings > 0)
  const totalFindings = withFindings.reduce((sum, r) => sum + r.findings, 0)
  const totalFixed = withFindings.reduce((sum, r) => sum + r.fixed, 0)
  const fixRate = totalFindings > 0 ? (totalFixed >= totalFindings ? 100 : Math.min(99, Math.round((totalFixed / totalFindings) * 100))) : 0

  return (
    <>
      <ScreenHeader kicker="보안 컴플라이언스" title="보안성 검토"
        desc="시큐어코딩·취약점 점검·모의해킹의 계획 → 발견 → 조치 → 완료를 추적하고 증적을 제출한다." />

      <div className="stat-row">
        <Stat value={rows.length} label="전체 검토" note={`진행중 ${open.length}건`} />
        <Stat value={openFindings} label="미조치 취약점" tone={openFindings > 0 ? 'err' : undefined} />
        <Stat value={rows.filter((r) => r.status === '완료').length} label="완료" />
        <Stat value={withFindings.length ? `${fixRate}%` : '-'} label="평균 조치율" note="발견 검토 기준" />
      </div>

      {canManage && (
        <Card title="검토 등록" kicker="New Review">
          <form action={addReview} className="hstack">
            <select aria-label="검토 유형" className="select" name="kind">
              {SECURITY_REVIEW_KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
            <input aria-label="검토 제목" className="input" name="title" required maxLength={120} placeholder="검토 제목" style={{ flex: 1 }} />
            <input aria-label="대상 시스템" className="input" name="target" required maxLength={80} placeholder="대상 시스템·프로젝트" style={{ width: 160 }} />
            <input aria-label="예정일" className="input" type="date" name="plannedAt" required defaultValue={today()} style={{ width: 150 }} />
            <button type="submit" className="btn pri">등록</button>
          </form>
        </Card>
      )}

      <Card title="검토 목록" kicker="Security Reviews" pad={false}
        actions={<a className="btn sm" href="/api/export?type=security-reviews">엑셀 다운로드</a>}>
        {rows.length === 0 ? (
          <div className="empty">등록된 보안성 검토가 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>번호</th><th>유형</th><th>제목</th><th>대상</th><th>검토자</th><th>예정일</th><th className="num">발견/조치</th><th className="num">조치율</th><th>상태</th>{canManage && <th className="c">처리</th>}</tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rate = r.findings > 0 ? (r.fixed >= r.findings ? 100 : Math.min(99, Math.round((r.fixed / r.findings) * 100))) : null
                  const next = NEXT[r.status]
                  return (
                    <tr key={r.id}>
                      <td className="code">{r.id}</td>
                      <td><Chip tone="neutral" bare>{r.kind}</Chip></td>
                      <td className="strong">{r.title}<Clip count={attachCount(r.id)} title="검토 증적" /></td>
                      <td>{r.target}</td>
                      <td>{r.reviewer}</td>
                      <td className="tnum">{r.plannedAt}</td>
                      <td className="num">{r.findings === 0 && r.status === '계획' ? '-' : `${r.fixed} / ${r.findings}`}</td>
                      <td className="num">{rate === null ? <span className="mut">-</span> : <Chip tone={rate >= 100 ? 'ok' : rate < 50 ? 'err' : 'warn'} bare>{rate}%</Chip>}</td>
                      <td><Chip tone={ST_CHIP[r.status]}>{r.status}</Chip>{r.completedAt ? <span className="mut" style={{ fontSize: 10.5 }}> · {r.completedAt}</span> : ''}</td>
                      {canManage && (
                        <td className="c" style={{ maxWidth: 360 }}>
                          {r.status === '완료' ? (
                            <span className="mut">-</span>
                          ) : (
                            <div className="hstack" style={{ justifyContent: 'center', gap: 6 }}>
                              <form action={recordFindings} className="hstack" style={{ gap: 4, padding: '3px 0' }}>
                                <input type="hidden" name="id" value={r.id} />
                                <input aria-label="발견" className="input" name="findings" type="number" min={0} defaultValue={r.findings} title="발견 취약점 수" style={{ height: 25, fontSize: 11.5, width: 54 }} />
                                <input aria-label="조치" className="input" name="fixed" type="number" min={0} defaultValue={r.fixed} title="조치 완료 수" style={{ height: 25, fontSize: 11.5, width: 54 }} />
                                <input className="input" type="file" name="file" style={{ height: 25, fontSize: 11, width: 118, paddingTop: 2 }} title="검토 결과 증적 첨부" />
                                <button type="submit" className="btn sm">기록</button>
                              </form>
                              {next && (
                                <form action={advanceReview} style={{ display: 'inline' }}>
                                  <input type="hidden" name="id" value={r.id} />
                                  <button type="submit" className="btn sm pri" title={next === '완료' ? '발견 전건 조치 후 완료 가능' : undefined}>{next} →</button>
                                </form>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="callout">
        <b>처리 절차</b> — 검토를 계획으로 등록하고, 진행하며 발견·조치 건수와 증적을 기록한다. 발견 취약점을
        전건 조치하면 완료로 확정된다(미조치 잔여가 있으면 완료 불가). 조치율·미조치 취약점으로 보안성 현황을 집계한다.
      </div>
    </>
  )
}
