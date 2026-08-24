import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { audit } from '@/lib/audit'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { getStore, isCodeActive } from '@/lib/store'
import { isCalendarDate, today } from '@/lib/dates'
import type { SecurityObjectCategory } from '@/lib/types'

const CATEGORIES: SecurityObjectCategory[] = ['접근통제', '암호화', '로그·감사', '계정관리', '취약점']
const STATUSES = ['준수', '미준수', '해당없음'] as const

/** 객체 등록 (요구사항 75행 저장 ◎) — 이름 중복 금지. 주기는 공통코드 INSPECT_CYCLE 을 그대로 쓴다 */
async function addObject(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/objects', 'ADMIN')
  const name = String(formData.get('name') ?? '').trim().slice(0, 60)
  const category = String(formData.get('category') ?? '') as SecurityObjectCategory
  const criterion = String(formData.get('criterion') ?? '').trim().slice(0, 200)
  const cycle = String(formData.get('cycle') ?? '')
  const basis = String(formData.get('basis') ?? '').trim().slice(0, 60)
  if (!name || !CATEGORIES.includes(category)) return
  const s = getStore()
  if (s.securityObjects.some((o) => o.name === name)) return
  const max = s.securityObjects.reduce((m, o) => Math.max(m, Number(o.id.replace('OBJ-', '')) || 0), 0)
  const id = `OBJ-${String(max + 1).padStart(2, '0')}`
  s.securityObjects.push({ id, name, category, criterion, cycle, basis: basis || undefined, enabled: true })
  audit(me.name, '보안객체 변경', `${name}(${id}) 등록 — ${category} · 주기 ${cycle || '미지정'}`)
  revalidatePath('/', 'layout')
}

/** 사용여부 토글 — 중지하면 준수 현황 집계에서 빠지지만 기록은 남는다(이력 보존) */
async function toggleObject(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/objects', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const obj = s.securityObjects.find((o) => o.id === id)
  if (!obj) return
  obj.enabled = !obj.enabled
  audit(me.name, '보안객체 변경', `${obj.name}(${id}): ${obj.enabled ? '사용' : '중지'}`)
  revalidatePath('/', 'layout')
}

/** 객체 삭제 (요구사항 75행 삭제 ◎) — 준수 기록이 있으면 삭제할 수 없다.
 *  지우면 그 시스템의 점검 이력이 통째로 사라져 다음 점검 때 근거가 남지 않는다.
 *  더 쓰지 않을 항목은 사용중지로 내린다(보안점검 기준관리의 '사용중' 가드와 같은 규약). */
async function deleteObject(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/objects', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const obj = s.securityObjects.find((o) => o.id === id)
  if (!obj) return
  if (s.objectCompliance.some((c) => c.objectId === id)) return
  s.securityObjects = s.securityObjects.filter((o) => o.id !== id)
  audit(me.name, '보안객체 변경', `${obj.name}(${id}): 삭제`)
  revalidatePath('/', 'layout')
}

/** 시스템별 준수 상태 기록 — 같은 시스템·객체 조합은 갱신(upsert), '해당없음'도 판단 결과라 남긴다 */
async function setCompliance(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/objects', 'ADMIN')
  const systemId = String(formData.get('systemId') ?? '')
  const objectId = String(formData.get('objectId') ?? '')
  const status = String(formData.get('status') ?? '')
  const note = String(formData.get('note') ?? '').trim().slice(0, 200)
  const checkedAt = String(formData.get('checkedAt') ?? '') || today()
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return
  if (checkedAt && !isCalendarDate(checkedAt)) return
  const s = getStore()
  if (!s.systems.some((y) => y.id === systemId)) return
  if (!s.securityObjects.some((o) => o.id === objectId)) return
  const cur = s.objectCompliance.find((c) => c.systemId === systemId && c.objectId === objectId)
  if (cur) {
    cur.status = status as (typeof STATUSES)[number]
    cur.checkedAt = checkedAt
    cur.note = note || undefined
  } else {
    s.objectCompliance.push({ systemId, objectId, status: status as (typeof STATUSES)[number], checkedAt, note: note || undefined })
  }
  const sys = s.systems.find((y) => y.id === systemId)
  const obj = s.securityObjects.find((o) => o.id === objectId)
  audit(me.name, '보안객체 변경', `${sys?.name ?? systemId} · ${obj?.name ?? objectId}: ${status}`)
  revalidatePath('/', 'layout')
}

export default async function ObjectsPage() {
  await requireMenu('/settings/objects')
  const s = getStore()
  const objects = s.securityObjects
  const active = objects.filter((o) => o.enabled)
  // 미준수는 사용중인 객체 기준으로만 센다 — 중지한 항목의 옛 기록이 현황을 흔들면 안 된다.
  const activeIds = new Set(active.map((o) => o.id))
  const breaches = s.objectCompliance.filter((c) => c.status === '미준수' && activeIds.has(c.objectId))
  const covered = new Set(s.objectCompliance.filter((c) => activeIds.has(c.objectId)).map((c) => c.systemId))
  const cycles = (s.codeGroups.find((g) => g.id === 'INSPECT_CYCLE')?.values ?? []).filter(isCodeActive)

  const cellOf = (systemId: string, objectId: string) =>
    s.objectCompliance.find((c) => c.systemId === systemId && c.objectId === objectId)

  return (
    <>
      <ScreenHeader kicker="환경설정" title="객체 관리"
        desc="시스템에 적용할 보안 준수 항목과 시스템별 준수 상태. 미준수 건은 인프라의 시스템 현황에도 함께 뜬다." />

      <div className="stat-row">
        <Stat value={objects.length} label="등록 객체" note={`사용중 ${active.length}`} />
        <Stat value={covered.size} label="점검 시스템" note={`전체 ${s.systems.length}`} />
        <Stat value={breaches.length} label="미준수" note="사용중 객체 기준" tone={breaches.length ? 'err' : undefined} />
        <Stat value={s.objectCompliance.length} label="준수 기록" />
      </div>

      <Card title="객체 목록" pad={false}
        actions={<span className="mut" style={{ fontSize: 11.5 }}>준수 기록이 있는 객체는 삭제할 수 없다 — 사용중지로 내린다</span>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>코드</th><th>분류</th><th>객체명</th><th>준수 기준</th>
                <th>주기</th><th>근거</th><th>상태</th><th>사용여부</th><th>기록</th><th />
              </tr>
            </thead>
            <tbody>
              {objects.map((o) => {
                const used = s.objectCompliance.filter((c) => c.objectId === o.id).length
                return (
                  <tr key={o.id}>
                    <td className="code">{o.id}</td>
                    <td><Chip tone="neutral">{o.category}</Chip></td>
                    <td><b>{o.name}</b></td>
                    <td className="mut">{o.criterion}</td>
                    <td>{o.cycle || '-'}</td>
                    <td className="mut">{o.basis ?? '-'}</td>
                    <td>{o.enabled ? <Chip tone="ok" bare>사용</Chip> : <Chip tone="neutral" bare>중지</Chip>}</td>
                    <td>
                      <form action={toggleObject}>
                        <input type="hidden" name="id" value={o.id} />
                        <button type="submit" className={`btn sm ${o.enabled ? 'danger' : 'pri'}`}>{o.enabled ? '중지' : '사용'}</button>
                      </form>
                    </td>
                    <td>{used ? `${used}건` : '-'}</td>
                    <td>
                      {used ? <span className="mut" style={{ fontSize: 11 }}>사용중</span> : (
                        <form action={deleteObject}>
                          <input type="hidden" name="id" value={o.id} />
                          <button type="submit" className="btn sm danger">삭제</button>
                        </form>
                      )}
                    </td>
                  </tr>
                )
              })}
              {objects.length === 0 && <tr><td colSpan={10} className="empty">등록된 객체가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>

        <div style={{ padding: 12, borderTop: '1px solid var(--line)' }}>
          <form action={addObject} className="hstack" style={{ flexWrap: 'wrap' }}>
            <select name="category" className="select" defaultValue="접근통제" aria-label="분류">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input name="name" className="input" placeholder="객체명" style={{ minWidth: 180 }} aria-label="객체명" />
            <input name="criterion" className="input" placeholder="준수 기준" style={{ flex: 1, minWidth: 220 }} aria-label="준수 기준" />
            <select name="cycle" className="select" aria-label="점검 주기">
              {cycles.map((v) => <option key={v.code}>{v.code}</option>)}
            </select>
            <input name="basis" className="input" placeholder="근거 (선택)" style={{ minWidth: 140 }} aria-label="근거" />
            <button type="submit" className="btn pri">객체 등록</button>
          </form>
        </div>
      </Card>

      <Card title="시스템별 준수 현황" pad={false}
        actions={<span className="mut" style={{ fontSize: 11.5 }}>사용중 객체 {active.length}개</span>}>
        <div className="tbl-wrap">
          <table className="tbl mx">
            <thead>
              <tr>
                <th>시스템</th>
                {active.map((o) => <th key={o.id} title={o.criterion}>{o.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {s.systems.map((sys) => (
                <tr key={sys.id}>
                  <td><b>{sys.name}</b> <span className="mut">{sys.env}</span></td>
                  {active.map((o) => {
                    const c = cellOf(sys.id, o.id)
                    const tone = c?.status === '준수' ? 'ok' : c?.status === '미준수' ? 'err' : 'neutral'
                    return (
                      <td key={o.id} title={c?.note ?? ''}>
                        {c ? <Chip tone={tone}>{c.status}</Chip> : <span className="mut">미점검</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {s.systems.length === 0 && (
                <tr><td colSpan={active.length + 1} className="empty">등록된 시스템이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ padding: 12, borderTop: '1px solid var(--line)' }}>
          <form action={setCompliance} className="hstack" style={{ flexWrap: 'wrap' }}>
            <select name="systemId" className="select" aria-label="시스템">
              {s.systems.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
            <select name="objectId" className="select" aria-label="객체">
              {active.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select name="status" className="select" defaultValue="준수" aria-label="준수 상태">
              {STATUSES.map((v) => <option key={v}>{v}</option>)}
            </select>
            <input type="date" name="checkedAt" className="input" defaultValue={today()} aria-label="점검일" />
            <input name="note" className="input" placeholder="비고 (미준수 사유 등)" style={{ flex: 1, minWidth: 200 }} aria-label="비고" />
            <button type="submit" className="btn pri">상태 저장</button>
          </form>
        </div>
      </Card>

      {breaches.length > 0 && (
        <Card title="미준수 내역" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>시스템</th><th>객체</th><th>점검일</th><th>사유</th></tr></thead>
              <tbody>
                {breaches.map((c) => (
                  <tr key={`${c.systemId}-${c.objectId}`}>
                    <td><b>{s.systems.find((y) => y.id === c.systemId)?.name ?? c.systemId}</b></td>
                    <td>{s.securityObjects.find((o) => o.id === c.objectId)?.name ?? c.objectId}</td>
                    <td>{c.checkedAt ?? '-'}</td>
                    <td className="mut">{c.note ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}
