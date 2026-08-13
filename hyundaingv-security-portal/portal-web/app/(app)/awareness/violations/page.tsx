import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { draftApproval } from '@/lib/approvals'
import { attachCount, registerUpload } from '@/lib/attachments'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { sendVia } from '@/lib/integrations/registry'
import { getStore, nextNo } from '@/lib/store'
import type { ViolationType } from '@/lib/types'

const TYPES: ViolationType[] = ['출력물 방치', '화면 미잠금', '인가되지 않은 USB 사용']
const ST_CHIP = { 징구중: 'warn', 결재중: 'info', 완료: 'ok' } as const

async function addViolation(formData: FormData) {
  'use server'
  const me = await requireRole('BIZ_MGR', 'ADMIN')
  const name = String(formData.get('name') ?? '')
  const type = String(formData.get('type') ?? '') as ViolationType
  const detail = String(formData.get('detail') ?? '').trim().slice(0, 300)
  const s = getStore()
  const person = s.people.find((p) => p.name === name)
  if (!person || !TYPES.includes(type) || !detail) return

  const id = nextNo('VL', today().slice(0, 4), s.violations.map((v) => v.id))
  s.violations.unshift({
    id, name: person.name, dept: person.dept, type, detail, occurredAt: today(), status: '징구중',
  })
  // 결재제외자 확인서 스캔 등 증빙 업로드 (첨부 시트: 보안위반관리)
  registerUpload(id, formData.get('file'), me.name)
  // 폐쇄 루프 — 등록과 동시에 위반자에게 확인서 제출 안내메일 (그룹웨어 메일 어댑터 경유)
  await sendVia('groupware-mail', [person.name], `[보안위반] 사실확인서 제출 안내 — ${type}`)
  revalidatePath('/', 'layout')
}

async function submitStatement(formData: FormData) {
  'use server'
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const statement = String(formData.get('statement') ?? '').trim().slice(0, 500)
  if (!statement) return
  const s = getStore()
  // 위반자 본인 자료만 상신 가능 (결재 시트 14번)
  const v = s.violations.find((x) => x.id === id && x.name === me.name && x.status === '징구중')
  if (!v) return
  v.statement = statement
  v.status = '결재중'

  draftApproval({ docType: '보안위반 확인서', title: `[보안위반사실확인서] ${v.type} — ${me.name}`, ref: v.id, drafter: me })
  revalidatePath('/', 'layout')
}

export default async function ViolationsPage() {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const s = getStore()
  const canManage = me.role === 'BIZ_MGR' || me.role === 'ADMIN'

  const rows = canManage ? s.violations : s.violations.filter((v) => v.name === me.name)
  const myPending = s.violations.filter((v) => v.name === me.name && v.status === '징구중')

  return (
    <>
      <ScreenHeader kicker="임직원 의식제고" title="보안위반 관리"
        desc={canManage
          ? '위반 등록 → 확인서 제출 안내메일 → 위반자 본인 확인서 결재 → 완료까지 추적한다.'
          : '내 보안위반 내역을 확인하고 사실확인서를 작성해 부서장 결재를 신청한다.'} />

      <div className="stat-row">
        <Stat value={rows.length} label={canManage ? '전체 위반' : '내 위반 내역'} />
        <Stat value={rows.filter((v) => v.status === '징구중').length} label="확인서 징구중" tone={rows.some((v) => v.status === '징구중') ? 'warn' : undefined} />
        <Stat value={rows.filter((v) => v.status === '결재중').length} label="결재중" />
        <Stat value={rows.filter((v) => v.status === '완료').length} label="완료" />
      </div>

      {canManage && (
        <Card title="위반 등록 — 확인서 요청" kicker="New Violation">
          <form action={addViolation} className="hstack">
            <select className="select" name="name">
              {s.people.map((p) => <option key={p.name} value={p.name}>{p.name} ({p.dept})</option>)}
            </select>
            <select className="select" name="type">
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <input className="input" name="detail" required maxLength={300} placeholder="위반 내용" style={{ flex: 1 }} />
            <input className="input" type="file" name="file" style={{ width: 150, paddingTop: 4 }} title="확인서 스캔 등 증빙 첨부" />
            <button type="submit" className="btn pri">등록 · 안내메일 발송</button>
          </form>
        </Card>
      )}

      <Card title={canManage ? '위반 내역' : '내 위반 내역 — 사실확인서'} kicker="Violations" pad={false}
        actions={<a className="btn sm" href="/api/export?type=violations">엑셀 다운로드</a>}>
        {rows.length === 0 ? (
          <div className="empty">위반 내역이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>번호</th><th>위반자</th><th>유형</th><th>내용</th><th>발생일</th><th>상태</th><th className="c">사실확인서</th></tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td className="code">{v.id}</td>
                    <td>{v.name} <span className="mut">· {v.dept}</span></td>
                    <td><Chip tone="err" bare>{v.type}</Chip></td>
                    <td className="strong" style={{ maxWidth: 280 }}>{v.detail}<Clip count={attachCount(v.id)} title="증빙" /></td>
                    <td className="tnum">{v.occurredAt}</td>
                    <td><Chip tone={ST_CHIP[v.status]}>{v.status}</Chip></td>
                    <td className="c" style={{ maxWidth: 380 }}>
                      {v.status === '징구중' && v.name === me.name ? (
                        <form action={submitStatement} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                          <input type="hidden" name="id" value={v.id} />
                          <input className="input" name="statement" required maxLength={500} placeholder="사실확인 · 재발방지 서약" style={{ height: 25, fontSize: 11.5, width: 220 }} />
                          <button type="submit" className="btn sm pri">확인서 결재신청</button>
                        </form>
                      ) : v.statement ? (
                        <span className="dim" title={v.statement}>{v.statement}</span>
                      ) : (
                        <span className="mut">{v.status === '징구중' ? '위반자 본인 작성 대기' : '-'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {myPending.length > 0 && (
        <div className="callout warn">
          <b>사실확인서 제출 대상입니다</b> — 안내메일로 통지된 위반 내역 {myPending.length}건에 대해
          확인서를 작성해 부서장 결재를 신청하세요.
        </div>
      )}
    </>
  )
}
