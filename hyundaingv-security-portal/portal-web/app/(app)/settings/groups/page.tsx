import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { NAV, SCREEN_ACTIONS, ACTION_LABEL, TITLE_BY_HREF, isGrantableMenu, type ActionKey } from '@/components/chrome/menus'
import { Icon } from '@/components/chrome/Icon'
import { audit } from '@/lib/audit'
import { isGrantableAction, isGroupActive, requireMenu, requireMenuRole } from '@/lib/authz'
import { ACCOUNTS } from '@/lib/session'
import { getStore, nextNo } from '@/lib/store'
import { today } from '@/lib/dates'
import { ROLE_LABEL } from '@/lib/types'

/** 부여 가능한(운영) 메뉴 목록 — ADMIN 전용 화면은 위임 대상에서 제외(isGrantableMenu). 도메인 순서 유지. */
const GRANTABLE = NAV.flatMap((g) => g.items.filter((i) => isGrantableMenu(i.href)).map((i) => ({ group: g.label, href: i.href, label: i.label })))

/** 부여 가능한(운영) 쓰기 기능 목록 — SCREEN_ACTIONS 등록 액션 중 운영 화면(isGrantableMenu)만. */
const GRANTABLE_ACTIONS = Object.entries(SCREEN_ACTIONS)
  .filter(([href]) => isGrantableMenu(href))
  .flatMap(([href, acts]) => (Object.keys(acts) as ActionKey[]).map((action) => ({
    key: `${href}#${action}`, href, action,
    screen: TITLE_BY_HREF[href]?.title ?? href, label: ACTION_LABEL[action],
  })))

async function addGroup(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/groups', 'ADMIN')
  const label = String(formData.get('label') ?? '').trim().slice(0, 40)
  const description = String(formData.get('description') ?? '').trim().slice(0, 120)
  const expiresAt = String(formData.get('expiresAt') ?? '')
  if (!label) return
  const s = getStore()
  const id = nextNo('GRP', today().slice(0, 4), s.userGroups.map((g) => g.id))
  s.userGroups.unshift({ id, label, description: description || undefined, members: [], menuGrants: [],
    expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(expiresAt) ? expiresAt : undefined })
  audit(me.name, '사용자 그룹 변경', `그룹 생성 — ${id} ${label}${expiresAt ? ` (만료 ${expiresAt})` : ''}`)
  revalidatePath('/', 'layout')
}

/** 그룹 만료일 설정/해제 — 임시 위임(만료 후 자동 회수). 유효한 YYYY-MM-DD 면 설정, 빈값이면 무기한으로 해제. */
async function setGroupExpiry(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/groups', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const expiresAt = String(formData.get('expiresAt') ?? '')
  const s = getStore()
  const grp = s.userGroups.find((g) => g.id === id)
  if (!grp) return
  grp.expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(expiresAt) ? expiresAt : undefined
  audit(me.name, '사용자 그룹 변경', `${grp.label} 만료일: ${grp.expiresAt ? grp.expiresAt : '해제(무기한)'}`)
  revalidatePath('/', 'layout')
}

async function deleteGroup(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/groups', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const grp = s.userGroups.find((g) => g.id === id)
  if (!grp) return
  s.userGroups = s.userGroups.filter((g) => g.id !== id)
  audit(me.name, '사용자 그룹 변경', `그룹 삭제 — ${id} ${grp.label}`)
  revalidatePath('/', 'layout')
}

async function toggleMember(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/groups', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const name = String(formData.get('name') ?? '')
  const s = getStore()
  const grp = s.userGroups.find((g) => g.id === id)
  // 구성원은 실제 로그인 계정(Session.name)만 — 임의 문자열 주입 차단
  if (!grp || !ACCOUNTS.some((a) => a.name === name)) return
  const had = grp.members.includes(name)
  grp.members = had ? grp.members.filter((n) => n !== name) : [...grp.members, name]
  audit(me.name, '사용자 그룹 변경', `${grp.label} 구성원 ${name}: ${had ? '제외' : '추가'}`)
  revalidatePath('/', 'layout')
}

async function toggleGrant(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/groups', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const href = String(formData.get('href') ?? '')
  const s = getStore()
  const grp = s.userGroups.find((g) => g.id === id)
  // 부여 대상은 운영 화면(isGrantableMenu)만 — ADMIN 전용 화면 위임으로 권한 상승하는 것을 서버에서 차단
  if (!grp || !isGrantableMenu(href)) return
  const had = grp.menuGrants.includes(href)
  grp.menuGrants = had ? grp.menuGrants.filter((h) => h !== href) : [...grp.menuGrants, href]
  const title = TITLE_BY_HREF[href]?.title ?? href
  audit(me.name, '사용자 그룹 변경', `${grp.label} 부여 메뉴 ${title}: ${had ? '해제' : '부여'}`)
  revalidatePath('/', 'layout')
}

async function toggleActionGrant(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/groups', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const key = String(formData.get('key') ?? '')
  const [href, action] = key.split('#')
  const s = getStore()
  const grp = s.userGroups.find((g) => g.id === id)
  // 부여 대상은 SCREEN_ACTIONS 등록 운영 기능만 — admin 화면·미등록 액션 위임을 서버에서 차단(권한 상승 방지)
  if (!grp || !href || !action || !isGrantableAction(href, action as ActionKey)) return
  const grants = grp.actionGrants ?? []
  const had = grants.includes(key)
  grp.actionGrants = had ? grants.filter((k) => k !== key) : [...grants, key]
  const title = TITLE_BY_HREF[href]?.title ?? href
  audit(me.name, '사용자 그룹 변경', `${grp.label} 부여 기능 ${title} ${ACTION_LABEL[action as ActionKey]}: ${had ? '해제' : '부여'}`)
  revalidatePath('/', 'layout')
}

export default async function GroupsPage() {
  await requireMenu('/settings/groups')
  const s = getStore()
  const groups = s.userGroups ?? []
  const memberCount = new Set(groups.flatMap((g) => g.members)).size
  const grantCount = groups.reduce((sum, g) => sum + g.menuGrants.length, 0)
  const actionGrantCount = groups.reduce((sum, g) => sum + (g.actionGrants ?? []).length, 0)
  const expiredCount = groups.filter((g) => !isGroupActive(g)).length

  // 위임 현황 — 현재 유효한(만료 안 된) 그룹의 모든 위임을 구성원 단위로 펼친 감사용 대장(누가·무엇을·어느
  // 그룹으로·언제까지). 만료 그룹은 위임이 회수돼 제외한다(그룹 카드에 만료 표시). 화면=해석 동일 술어.
  const registerRows = groups
    .filter((g) => isGroupActive(g))
    .flatMap((g) => g.members.flatMap((m) => [
      ...g.menuGrants.filter((h) => isGrantableMenu(h)).map((h) => ({
        member: m, kind: '열람' as const, target: TITLE_BY_HREF[h]?.title ?? h, group: g.label, expiresAt: g.expiresAt,
      })),
      ...(g.actionGrants ?? []).flatMap((k) => {
        const [h, a] = k.split('#')
        return h && a && isGrantableAction(h, a as ActionKey)
          ? [{ member: m, kind: '기능' as const, target: `${TITLE_BY_HREF[h]?.title ?? h} · ${ACTION_LABEL[a as ActionKey]}`, group: g.label, expiresAt: g.expiresAt }]
          : []
      }),
    ]))
    .sort((x, y) => x.member.localeCompare(y.member) || x.kind.localeCompare(y.kind) || x.target.localeCompare(y.target))

  return (
    <>
      <ScreenHeader kicker="환경설정" title="사용자 그룹"
        desc="4 고정 역할 위에 얹는 위임 — 그룹에 구성원과 부여 대상(화면 열람 · 특정 쓰기 기능)을 지정하면, 구성원은 자기 역할에 더해 부여된 화면을 열람하고 부여된 기능을 수행한다. 부여 대상은 운영 화면·등록된 쓰기 기능뿐 — ADMIN 전용 화면·관리 기능은 위임할 수 없다(옵트인 · 기본 없음)." />

      <div className="stat-row">
        <Stat value={groups.length} label="그룹" />
        <Stat value={memberCount} label="위임 구성원" note="중복 제외" />
        <Stat value={grantCount} label="부여 메뉴" note="열람 위임" />
        <Stat value={actionGrantCount} label="부여 기능" note="쓰기 위임" tone={actionGrantCount > 0 ? 'warn' : undefined} />
        <Stat value={expiredCount} label="만료 그룹" note="위임 회수됨" tone={expiredCount > 0 ? 'err' : undefined} />
      </div>

      <Card title="그룹 생성">
        <form action={addGroup} className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input className="input" name="label" aria-label="그룹명" placeholder="그룹명 (예: 인프라 열람 위임)" required style={{ minWidth: 220 }} maxLength={40} />
          <input className="input" name="description" aria-label="그룹 설명" placeholder="설명 (선택)" style={{ flex: 1, minWidth: 240 }} maxLength={120} />
          <input className="input" name="expiresAt" aria-label="만료일" type="date" title="만료일 (선택 — 지나면 위임 자동 회수)" style={{ width: 150 }} />
          <button type="submit" className="btn pri">그룹 등록</button>
        </form>
      </Card>

      <Card title="위임 현황" pad={false}
        actions={<span className="mut" style={{ fontSize: 11 }}>현재 유효한 위임 {registerRows.length}건 — 만료 그룹 제외</span>}>
        {registerRows.length === 0 ? (
          <div className="empty">현재 유효한 위임이 없습니다. 그룹에 구성원·부여 대상을 지정하면 여기 모입니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>구성원</th><th>유형</th><th>부여 대상</th><th>소속 그룹</th><th>만료</th></tr></thead>
              <tbody>
                {registerRows.map((r, i) => (
                  <tr key={i}>
                    <td className="strong">{r.member}</td>
                    <td><Chip tone={r.kind === '기능' ? 'warn' : 'info'} bare>{r.kind}</Chip></td>
                    <td>{r.target}</td>
                    <td className="mut">{r.group}</td>
                    <td className="tnum">{r.expiresAt ? `${r.expiresAt} 까지` : <span className="mut">무기한</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {groups.length === 0 ? (
        <Card title="그룹 목록"><div className="empty">등록된 그룹이 없습니다. 위에서 그룹을 만들어 열람 위임을 시작하세요.</div></Card>
      ) : groups.map((grp) => {
        const grantedSet = new Set(grp.menuGrants)
        const expired = !isGroupActive(grp)
        return (
          <Card key={grp.id} title={grp.label}
            actions={
              <form action={deleteGroup} style={{ display: 'inline' }}>
                <input type="hidden" name="id" value={grp.id} />
                <button type="submit" className="btn sm danger" title="그룹을 삭제한다 (구성원 열람 위임 해제)">그룹 삭제</button>
              </form>
            }>
            <div className="vstack" style={{ gap: 12 }}>
              <div className="mut" style={{ fontSize: 12 }}>
                <span className="mono">{grp.id}</span>{grp.description ? ` · ${grp.description}` : ''}
              </div>

              <div className="hstack" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="kicker">만료</div>
                {grp.expiresAt
                  ? <Chip tone={expired ? 'err' : 'warn'} bare>{expired ? `만료됨 (${grp.expiresAt})` : `${grp.expiresAt} 만료 예정`}</Chip>
                  : <Chip tone="neutral" bare>무기한</Chip>}
                {expired && <span className="mut" style={{ fontSize: 11 }}>— 이 그룹의 열람·기능 위임이 자동 회수됨</span>}
                <form action={setGroupExpiry} className="hstack" style={{ gap: 4, marginLeft: 'auto' }}>
                  <input type="hidden" name="id" value={grp.id} />
                  <input className="input" name="expiresAt" aria-label="만료일 변경" type="date" defaultValue={grp.expiresAt ?? ''} style={{ height: 26, fontSize: 11, width: 140 }} />
                  <button type="submit" className="btn sm" title="만료일 설정 (빈값으로 저장 시 무기한으로 해제)">만료일 저장</button>
                </form>
              </div>

              <div>
                <div className="kicker" style={{ marginBottom: 6 }}>구성원</div>
                <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {ACCOUNTS.map((a) => {
                    const on = grp.members.includes(a.name)
                    return (
                      <form key={a.login} action={toggleMember} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={grp.id} />
                        <input type="hidden" name="name" value={a.name} />
                        <button type="submit" className={`btn sm ${on ? 'pri' : ''}`}
                          title={on ? '클릭 시 구성원에서 제외' : '클릭 시 구성원으로 추가'}>
                          {on ? '● ' : '○ '}{a.name} <span className="mut" style={{ fontSize: 10.5 }}>{ROLE_LABEL[a.role]}</span>
                        </button>
                      </form>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="kicker" style={{ marginBottom: 6 }}>부여 메뉴 (열람)</div>
                <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {GRANTABLE.map((m) => {
                    const on = grantedSet.has(m.href)
                    return (
                      <form key={m.href} action={toggleGrant} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={grp.id} />
                        <input type="hidden" name="href" value={m.href} />
                        <button type="submit" className={`btn sm ${on ? 'pri' : ''}`}
                          title={`${m.group} · ${m.href} — ${on ? '부여 해제' : '열람 부여'}`}>
                          {on ? '● ' : '○ '}{m.label}
                        </button>
                      </form>
                    )
                  })}
                </div>
              </div>

              {GRANTABLE_ACTIONS.length > 0 && (
                <div>
                  <div className="kicker" style={{ marginBottom: 6 }}>부여 기능 (쓰기)</div>
                  <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {GRANTABLE_ACTIONS.map((m) => {
                      const on = (grp.actionGrants ?? []).includes(m.key)
                      return (
                        <form key={m.key} action={toggleActionGrant} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={grp.id} />
                          <input type="hidden" name="key" value={m.key} />
                          <button type="submit" className={`btn sm ${on ? 'pri' : ''}`}
                            title={`${m.href} — ${m.label} 기능 ${on ? '부여 해제' : '부여'}`}>
                            {on ? '● ' : '○ '}{m.screen} · {m.label}
                          </button>
                        </form>
                      )
                    })}
                  </div>
                </div>
              )}

              {grp.members.length > 0 && (grp.menuGrants.length > 0 || (grp.actionGrants ?? []).length > 0) && (
                <div className="hstack" style={{ gap: 6, flexWrap: 'wrap', fontSize: 11.5 }}>
                  <Chip tone="info" bare><Icon name="usergroup" size={12} /> 활성 위임</Chip>
                  <span className="mut">
                    {grp.members.join(' · ')}에게{' '}
                    {[
                      grp.menuGrants.length > 0 ? `${grp.menuGrants.map((h) => TITLE_BY_HREF[h]?.title ?? h).join(' · ')} 열람` : '',
                      (grp.actionGrants ?? []).length > 0 ? `${(grp.actionGrants ?? []).map((k) => { const [h, a] = k.split('#'); return `${TITLE_BY_HREF[h]?.title ?? h} ${ACTION_LABEL[a as ActionKey]}` }).join(' · ')} 기능` : '',
                    ].filter(Boolean).join(', ')} 부여
                  </span>
                </div>
              )}
            </div>
          </Card>
        )
      })}

      <div className="callout">
        <b>가법 위임 · 관리자 명시 부여</b> — 그룹은 화면 <b>열람</b>과 관리자가 명시한 <b>특정 쓰기 기능</b>
        (SCREEN_ACTIONS 등록분)만 넓힌다. 부여하지 않은 쓰기는 그대로 역할 권한이 막고, 서버 가드가 내비 표시와
        같은 술어(canAccessMenu·canPerformAction)로 직접 POST 도 검증한다. ADMIN 전용 화면(환경설정·기반)과 관리
        기능은 위임 대상에서 제외되어 관리 권한이 위임으로 새지 않는다. 모든 그룹 변경은 감사 이력에 남는다.
      </div>
    </>
  )
}
