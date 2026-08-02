import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'

async function toggleCode(formData: FormData) {
  'use server'
  await requireRole('ADMIN')
  const groupId = String(formData.get('groupId') ?? '')
  const code = String(formData.get('code') ?? '')
  const s = getStore()
  const value = s.codeGroups.find((g) => g.id === groupId)?.values.find((v) => v.code === code)
  if (!value) return
  value.enabled = !value.enabled
  revalidatePath('/', 'layout')
}

export default async function CodesPage() {
  await requireRole('ADMIN')
  const s = getStore()
  const total = s.codeGroups.reduce((sum, g) => sum + g.values.length, 0)
  const disabled = s.codeGroups.reduce((sum, g) => sum + g.values.filter((v) => !v.enabled).length, 0)

  return (
    <>
      <ScreenHeader kicker="환경설정" title="공통코드 · 객체"
        desc="장애등급·SR유형·주기 등 업무 코드의 단일 원천 — 사용중지된 코드는 업무 화면의 선택지에서 즉시 사라진다." />

      <div className="stat-row">
        <Stat value={s.codeGroups.length} label="코드그룹" />
        <Stat value={total} label="코드값" />
        <Stat value={disabled} label="사용중지" tone={disabled > 0 ? 'warn' : undefined} />
      </div>

      <div className="cols c2">
        {s.codeGroups.map((g) => (
          <Card key={g.id} title={g.name} kicker={g.id} pad={false}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>코드값</th><th>사용여부</th><th className="c">제어</th></tr></thead>
                <tbody>
                  {g.values.map((v) => (
                    <tr key={v.code}>
                      <td className="strong">{v.code}</td>
                      <td>{v.enabled ? <Chip tone="ok" bare>사용</Chip> : <Chip tone="err" bare>중지</Chip>}</td>
                      <td className="c">
                        <form action={toggleCode} style={{ display: 'inline' }}>
                          <input type="hidden" name="groupId" value={g.id} />
                          <input type="hidden" name="code" value={v.code} />
                          <button type="submit" className={`btn sm ${v.enabled ? 'danger' : 'pri'}`}>{v.enabled ? '중지' : '사용'}</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      <div className="callout">
        <b>코드 중심 운영</b> — 장애등급(FAULT_GRADE)은 장애 등록 화면이 이 코드그룹을 직접 읽는다.
        코드를 중지하면 신규 등록 선택지에서 사라지고, 기존 데이터는 유지된다.
      </div>
    </>
  )
}
