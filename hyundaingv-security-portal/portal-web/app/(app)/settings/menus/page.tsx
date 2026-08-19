import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { NAV } from '@/components/chrome/menus'
import { Icon } from '@/components/chrome/Icon'
import { registerUpload } from '@/lib/attachments'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { SCREENS } from '@/lib/screens'
import { getStore } from '@/lib/store'
import { ROLE_LABEL } from '@/lib/types'

/** 화면 정의서 업로드 — 화면(pages)당 1개 첨부, 재업로드 시 교체된다 (첨부 시트: 메뉴관리) */
async function uploadSpec(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/menus', 'ADMIN')
  const href = String(formData.get('href') ?? '')
  if (!NAV.some((g) => g.items.some((i) => i.href === href))) return
  const s = getStore()
  s.attachments = s.attachments.filter((a) => a.refId !== href)
  registerUpload(href, formData.get('file'), me.name)
  revalidatePath('/settings/menus')
}

export default async function MenusPage() {
  await requireMenu('/settings/menus')
  const s = getStore()
  const items = NAV.flatMap((g) => g.items.map((i) => ({ group: g.label, hue: g.hue, ...i })))
  const stubs = new Set(Object.keys(SCREENS))
  const specOf = (href: string) => s.attachments.find((a) => a.refId === href)

  return (
    <>
      <ScreenHeader kicker="환경설정" title="메뉴 · 기능 관리"
        desc="10대 업무 도메인 × 메뉴 체계 — 화면번호(경로)·권한그룹·구현 상태를 관리한다." />

      <div className="stat-row">
        <Stat value={NAV.length} label="LV1 도메인" />
        <Stat value={items.length} label="LV2 메뉴" />
        <Stat value={items.length - stubs.size} label="구현 화면" />
        <Stat value={stubs.size} label="스텁" tone={stubs.size > 0 ? 'warn' : undefined} />
      </div>

      <Card title="메뉴 체계" kicker="Menu Tree" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>도메인 (LV1)</th><th>메뉴 (LV2)</th><th>화면번호</th><th>권한그룹</th><th>상태</th><th style={{ minWidth: 230 }}>화면 정의서 (1첨부)</th></tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const spec = specOf(i.href)
                return (
                  <tr key={i.href}>
                    <td><span className="kicker" style={{ color: i.hue }}>{i.group}</span></td>
                    <td className="strong">{i.ico} {i.label}</td>
                    <td className="mono" style={{ fontSize: 11.5 }}>{i.href}</td>
                    <td>{i.roles.map((r) => ROLE_LABEL[r]).join(' · ')}</td>
                    <td>{stubs.has(i.href) ? <Chip tone="warn" bare>스텁</Chip> : <Chip tone="ok" bare>구현</Chip>}</td>
                    <td>
                      <form action={uploadSpec} className="hstack" style={{ padding: '2px 0' }}>
                        <input type="hidden" name="href" value={i.href} />
                        {spec && <span className="clip mono" title={`${spec.name} · ${spec.uploadedBy}`}><Icon name="clip" size={12} />{spec.name.slice(0, 16)}</span>}
                        <input className="input" type="file" name="file" required style={{ height: 24, fontSize: 11, width: 120, paddingTop: 2 }} title="화면 정의서 업로드 (교체)" />
                        <button type="submit" className="btn sm">{spec ? '교체' : '업로드'}</button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="callout">
        <b>단일 원천</b> — 메뉴 체계·권한은 <span className="mono">components/chrome/menus.ts</span> 하나로
        내비 렌더링·서버 가드·권한 매트릭스·스모크가 함께 움직인다. 메뉴 추가는 이 파일과 화면 구현으로 완결된다.
      </div>
    </>
  )
}
