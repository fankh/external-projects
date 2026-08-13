import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { audit } from '@/lib/audit'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { getStore, isCodeActive } from '@/lib/store'

async function toggleCode(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/codes', 'ADMIN')
  const groupId = String(formData.get('groupId') ?? '')
  const code = String(formData.get('code') ?? '')
  const s = getStore()
  const group = s.codeGroups.find((g) => g.id === groupId)
  const value = group?.values.find((v) => v.code === code)
  if (!group || !value) return
  value.enabled = !value.enabled
  audit(me.name, '공통코드 변경', `${group.name}(${groupId}) ${code}: ${value.enabled ? '사용' : '중지'}`)
  revalidatePath('/', 'layout')
}

/** 사용기간(종료일) 설정 — 빈 값이면 상시 사용으로 되돌린다 (요구사항 73행: 사용여부·사용기간) */
async function setCodePeriod(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/codes', 'ADMIN')
  const groupId = String(formData.get('groupId') ?? '')
  const code = String(formData.get('code') ?? '')
  const until = String(formData.get('until') ?? '')
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) return
  const s = getStore()
  const group = s.codeGroups.find((g) => g.id === groupId)
  const value = group?.values.find((v) => v.code === code)
  if (!group || !value) return
  value.until = until || undefined
  audit(me.name, '공통코드 변경', `${group.name}(${groupId}) ${code}: 사용기간 ${until || '상시'}`)
  revalidatePath('/', 'layout')
}

/** 코드값 추가 — 그룹 내 중복 금지 (요구사항 73행 저장 ◎) */
async function addCodeValue(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/codes', 'ADMIN')
  const groupId = String(formData.get('groupId') ?? '')
  const code = String(formData.get('code') ?? '').trim().slice(0, 40)
  const s = getStore()
  const group = s.codeGroups.find((g) => g.id === groupId)
  if (!group || !code || group.values.some((v) => v.code === code)) return
  group.values.push({ code, enabled: true })
  audit(me.name, '공통코드 변경', `${group.name}(${groupId}) ${code}: 추가`)
  revalidatePath('/', 'layout')
}

/** 코드값 삭제 — 기존 업무 데이터의 코드 문자열은 유지된다 (요구사항 73행 삭제 ◎) */
async function deleteCodeValue(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/codes', 'ADMIN')
  const groupId = String(formData.get('groupId') ?? '')
  const code = String(formData.get('code') ?? '')
  const s = getStore()
  const group = s.codeGroups.find((g) => g.id === groupId)
  if (!group || !group.values.some((v) => v.code === code)) return
  group.values = group.values.filter((v) => v.code !== code)
  audit(me.name, '공통코드 변경', `${group.name}(${groupId}) ${code}: 삭제`)
  revalidatePath('/', 'layout')
}

export default async function CodesPage() {
  await requireMenu('/settings/codes')
  const s = getStore()
  const total = s.codeGroups.reduce((sum, g) => sum + g.values.length, 0)
  const inactive = s.codeGroups.reduce((sum, g) => sum + g.values.filter((v) => !isCodeActive(v)).length, 0)

  return (
    <>
      <ScreenHeader kicker="환경설정" title="공통코드"
        desc="장애등급·SR유형·주기 등 업무 코드의 단일 원천 — 사용중지·기간만료 코드는 업무 화면의 선택지에서 즉시 사라진다." />

      <div className="stat-row">
        <Stat value={s.codeGroups.length} label="코드그룹" />
        <Stat value={total} label="코드값" />
        <Stat value={inactive} label="중지·기간만료" tone={inactive > 0 ? 'warn' : undefined} />
      </div>

      <div className="cols c2">
        {s.codeGroups.map((g) => (
          <Card key={g.id} title={g.name} kicker={g.id} pad={false}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>코드값</th><th>상태</th><th>사용기간</th><th className="c">제어</th></tr></thead>
                <tbody>
                  {g.values.map((v) => (
                    <tr key={v.code}>
                      <td className="strong">{v.code}</td>
                      <td>
                        {!v.enabled ? <Chip tone="err" bare>중지</Chip> :
                         isCodeActive(v) ? <Chip tone="ok" bare>사용</Chip> : <Chip tone="warn" bare>기간만료</Chip>}
                      </td>
                      <td>
                        <form action={setCodePeriod} className="hstack" style={{ gap: 4 }}>
                          <input type="hidden" name="groupId" value={g.id} />
                          <input type="hidden" name="code" value={v.code} />
                          <input className="input" type="date" name="until" defaultValue={v.until ?? ''}
                            title="사용 종료일 — 비우면 상시" style={{ height: 25, fontSize: 11, width: 118 }} />
                          <button type="submit" className="btn sm">기간 저장</button>
                        </form>
                      </td>
                      <td className="c">
                        <span className="hstack" style={{ justifyContent: 'center' }}>
                          <form action={toggleCode} style={{ display: 'inline' }}>
                            <input type="hidden" name="groupId" value={g.id} />
                            <input type="hidden" name="code" value={v.code} />
                            <button type="submit" className={`btn sm ${v.enabled ? 'danger' : 'pri'}`}>{v.enabled ? '중지' : '사용'}</button>
                          </form>
                          <form action={deleteCodeValue} style={{ display: 'inline' }}>
                            <input type="hidden" name="groupId" value={g.id} />
                            <input type="hidden" name="code" value={v.code} />
                            <button type="submit" className="btn sm">삭제</button>
                          </form>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ borderTop: '1px solid var(--line)', padding: '8px 12px' }}>
              <form action={addCodeValue} className="hstack">
                <input type="hidden" name="groupId" value={g.id} />
                <input className="input" name="code" required maxLength={40} placeholder="새 코드값" style={{ flex: 1, height: 26, fontSize: 11.5 }} />
                <button type="submit" className="btn sm pri">코드 추가</button>
              </form>
            </div>
          </Card>
        ))}
      </div>

      <div className="callout">
        <b>코드 중심 운영</b> — 장애등급(FAULT_GRADE)은 장애 등록 화면이 이 코드그룹을 직접 읽는다.
        코드를 중지하거나 사용기간이 지나면 신규 등록 선택지에서 사라지고, 기존 데이터는 유지된다.
      </div>
    </>
  )
}
