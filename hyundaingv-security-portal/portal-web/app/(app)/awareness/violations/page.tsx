import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { audit } from '@/lib/audit'
import { draftApproval } from '@/lib/approvals'
import { attachCount, registerUpload } from '@/lib/attachments'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { sendVia } from '@/lib/integrations/registry'
import { importSecurityEvents } from '@/lib/secmon'
import { activeCodes, getStore, nextNo } from '@/lib/store'
import { CHANNELS } from '@/portal.config'
import type { ViolationType } from '@/lib/types'

const ST_CHIP = { 징구중: 'warn', 결재중: 'info', 완료: 'ok' } as const

async function addViolation(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/awareness/violations', 'BIZ_MGR', 'ADMIN')
  const name = String(formData.get('name') ?? '')
  const type = String(formData.get('type') ?? '') as ViolationType
  const detail = String(formData.get('detail') ?? '').trim().slice(0, 300)
  const s = getStore()
  const person = s.people.find((p) => p.name === name)
  if (!person || !activeCodes(s, 'VIOLATION_TYPE').includes(type) || !detail) return

  const id = nextNo('VL', today().slice(0, 4), s.violations.map((v) => v.id))
  s.violations.unshift({
    id, name: person.name, dept: person.dept, type, detail, occurredAt: today(), status: '징구중',
  })
  // 이력추적성(§VI) — 위반 등록은 타인 기록에 대한 관리 행위라 등록자(actor)를 감사 이력에 남긴다.
  // 위반 레코드 자체엔 등록자 필드가 없어(첨부 증빙은 선택) 감사 로그가 유일한 등록자 추적 지점.
  audit(me.name, '보안위반 등록', `${id} ${person.name}(${person.dept}) — ${type}`)
  // 결재제외자 확인서 스캔 등 증빙 업로드 (첨부 시트: 보안위반관리)
  registerUpload(id, formData.get('file'), me.name)
  // 폐쇄 루프 — 등록과 동시에 위반자에게 확인서 제출 안내메일 (그룹웨어 메일 어댑터 경유)
  await sendVia('groupware-mail', [person.name], `[보안위반] 사실확인서 제출 안내 — ${type}`)
  // 급보 문자 병행 (제품안내서 §V: 홈페이지 서버 경유 SMS) — 프로필에 SMS 채널이 있을 때만
  if (CHANNELS.some((c) => c.id === 'sms-gateway' && !c.planned)) {
    await sendVia('sms-gateway', [person.name], `[보안위반] 사실확인서 제출 안내 — ${type}`)
  }
  revalidatePath('/', 'layout')
}

async function submitStatement(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/awareness/violations', 'USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
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

// 결재제외 별도관리 (요구사항: "결재제외자는 별도 관리 — 확인서 징구 후 스캔해서 증빙으로 업로드").
// 녹스계정 없어 온라인 결재가 불가한 위반자는 업무담당자가 스캔 확인서를 업로드해 결재 없이 완료 처리한다.
async function closeExempt(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/awareness/violations', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const v = s.violations.find((x) => x.id === id && x.status === '징구중')
  if (!v) return
  // 스캔 증빙 필수 — 별도관리는 스캔 확인서가 결재를 대신하므로 첨부 없이는 완료할 수 없다
  const uploaded = registerUpload(id, formData.get('file'), me.name)
  if (!uploaded) return
  v.status = '완료'
  v.exempt = true
  // 폐쇄 루프 — 확인서 반려로 생겼을 수 있는 위반자의 '재상신' 할일을 함께 닫는다. 결재제외 완료로 재상신
  // (submitStatement=징구중 필요) 경로가 사라지면 할일이 고아로 남고 notify '반려 방치'가 무한 발송된다
  // (deleteSettlement·inspection registerResult 와 동일 유형+ref 선두 닫기).
  for (const t of s.todos) {
    if (!t.done && t.kind === '재상신' && t.title.startsWith(`[보안위반 확인서] ${v.id} `)) t.done = true
  }
  audit(me.name, '보안위반 등록', `${v.id} 결재제외 별도관리 완료 (스캔 확인서) — ${v.name}(${v.dept})`)
  revalidatePath('/', 'layout')
}

/** 보안관제 이벤트 수동 이관 — DLP·EDR 탐지를 보안위반(징구중)으로 편입한다(일배치와 동일 로직·중복 방지).
 *  일배치 자동 이관과 별개로, 담당자가 필요 시 즉시 당겨온다(secdata 수동 이관과 대칭). */
async function importSecmon() {
  'use server'
  const me = await requireMenuRole('/awareness/violations', 'BIZ_MGR', 'ADMIN')
  await importSecurityEvents(me.name)
  revalidatePath('/', 'layout')
}

export default async function ViolationsPage() {
  const me = await requireMenu('/awareness/violations')
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
        <Card title="위반 등록 — 확인서 요청"
          actions={CHANNELS.some((c) => c.id === 'sec-monitor' && !c.planned)
            ? <form action={importSecmon}><button type="submit" className="btn sm" title="보안관제(DLP·EDR) 탐지 이벤트를 위반으로 편입 — 채널 중지 시 무동작">보안관제 이벤트 가져오기</button></form>
            : undefined}>
          <form action={addViolation} className="hstack">
            <select aria-label="이름" className="select" name="name">
              {s.people.map((p) => <option key={p.name} value={p.name}>{p.name} ({p.dept})</option>)}
            </select>
            <select aria-label="type" className="select" name="type">
              {activeCodes(s, 'VIOLATION_TYPE').map((t) => <option key={t}>{t}</option>)}
            </select>
            <input aria-label="위반 내용" className="input" name="detail" required maxLength={300} placeholder="위반 내용" style={{ flex: 1 }} />
            <input className="input" type="file" name="file" style={{ width: 150, paddingTop: 4 }} title="확인서 스캔 등 증빙 첨부" />
            <button type="submit" className="btn pri">등록 · 안내메일 발송</button>
          </form>
        </Card>
      )}

      <Card title={canManage ? '위반 내역' : '내 위반 내역 — 사실확인서'} pad={false}
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
                    <td><Chip tone={ST_CHIP[v.status]}>{v.status}</Chip>{v.exempt && <Chip tone="neutral" bare>결재제외</Chip>}</td>
                    <td className="c" style={{ maxWidth: 380 }}>
                      {v.status === '징구중' && v.name === me.name ? (
                        <form action={submitStatement} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                          <input type="hidden" name="id" value={v.id} />
                          <input aria-label="사실확인 · 재발방지 서약" className="input" name="statement" required maxLength={500} placeholder="사실확인 · 재발방지 서약" style={{ height: 25, fontSize: 11.5, width: 220 }} />
                          <button type="submit" className="btn sm pri">확인서 결재신청</button>
                        </form>
                      ) : v.status === '징구중' && canManage ? (
                        // 결재제외 별도관리 — 녹스계정 없는 위반자는 업무담당자가 스캔 확인서로 결재 없이 완료
                        <form action={closeExempt} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                          <input type="hidden" name="id" value={v.id} />
                          <input className="input" type="file" name="file" required style={{ height: 25, fontSize: 11, width: 170, paddingTop: 2 }} title="스캔 확인서 증빙" />
                          <button type="submit" className="btn sm">결재제외 완료(스캔)</button>
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
