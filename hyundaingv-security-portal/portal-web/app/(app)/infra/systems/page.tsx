import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { audit } from '@/lib/audit'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import type { ServerInfo, SystemInfo } from '@/lib/types'

const DISK_WARN = 85
const PURPOSES: ServerInfo['purpose'][] = ['Web', 'WAS', 'DB', '배치']

function nextId(prefix: string, existing: string[]): string {
  const max = existing.reduce((m, id) => Math.max(m, Number(id.replace(`${prefix}-`, '')) || 0), 0)
  return `${prefix}-${String(max + 1).padStart(2, '0')}`
}

/** 서버 등록 (요구사항 31행 저장 ◎) — 랙·물리서버(H/W) 연결 포함 */
async function addServer(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/systems', 'BIZ_MGR', 'ADMIN')
  const hostname = String(formData.get('hostname') ?? '').trim().slice(0, 40)
  const ip = String(formData.get('ip') ?? '').trim().slice(0, 20)
  const purpose = String(formData.get('purpose') ?? '') as ServerInfo['purpose']
  const os = String(formData.get('os') ?? '').trim().slice(0, 60)
  const cpu = String(formData.get('cpu') ?? '').trim().slice(0, 20)
  const memoryGb = Number(formData.get('memoryGb'))
  const hwId = String(formData.get('hwId') ?? '')
  const s = getStore()
  const hw = s.hardware.find((h) => h.id === hwId && h.kind === '물리서버')
  // IP 옥텟 0~255 범위까지 검증 (정규식만으론 999.999.999.999 통과) — 표시 전용이나 정합성 위해
  const ipOk = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip.split('.').every((o) => Number(o) <= 255)
  if (!hostname || !ipOk || !PURPOSES.includes(purpose) || !os || !hw) return
  if (s.servers.some((v) => v.hostname === hostname)) return
  const id = nextId('SV', s.servers.map((v) => v.id))
  s.servers.push({
    id, hostname, ip, purpose, os, rack: hw.rackId, hwId,
    cpu: cpu || undefined, memoryGb: Number.isFinite(memoryGb) && memoryGb > 0 && memoryGb <= 4096 ? Math.round(memoryGb) : undefined,
    diskUsedPct: 0,
  })
  audit(me.name, '인프라 자산 변경', `서버 ${id} 등록 — ${hostname} (${hw.id}/${hw.rackId})`)
  revalidatePath('/', 'layout')
}

/** 서버 삭제 (요구사항 31행 삭제 ◎) — 시스템이 매핑된 서버는 삭제 불가 */
async function deleteServer(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/systems', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const sv = s.servers.find((v) => v.id === id)
  if (!sv || s.systems.some((x) => x.serverIds.includes(id))) return
  s.servers = s.servers.filter((v) => v.id !== id)
  audit(me.name, '인프라 자산 변경', `서버 ${id} 삭제 — ${sv.hostname}`)
  revalidatePath('/', 'layout')
}

/** 시스템 등록 (요구사항 32행 저장 ◎) — 서버 매핑·담당 포함 */
async function addSystem(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/systems', 'BIZ_MGR', 'ADMIN')
  const name = String(formData.get('name') ?? '').trim().slice(0, 60)
  const url = String(formData.get('url') ?? '').trim().slice(0, 120)
  const env = String(formData.get('env') ?? '') as SystemInfo['env']
  const serverId = String(formData.get('serverId') ?? '')
  const owner = String(formData.get('owner') ?? '').trim().slice(0, 40)
  const s = getStore()
  if (!name || !url || !['운영계', '개발계'].includes(env) || !owner) return
  if (!s.servers.some((v) => v.id === serverId) || s.systems.some((x) => x.name === name)) return
  const id = nextId('SYS', s.systems.map((x) => x.id))
  s.systems.push({ id, name, url, env, serverIds: [serverId], owner })
  audit(me.name, '인프라 자산 변경', `시스템 ${id} 등록 — ${name} (${env})`)
  revalidatePath('/', 'layout')
}

/** 시스템 삭제 (요구사항 32행 삭제 ◎) — 배치·인터페이스가 참조 중이면 삭제 불가 */
async function deleteSystem(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/systems', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const x = s.systems.find((y) => y.id === id)
  if (!x || s.batchJobs.some((b) => b.system === x.name) || s.interfaces.some((f) => f.from === x.name || f.to === x.name)) return
  s.systems = s.systems.filter((y) => y.id !== id)
  audit(me.name, '인프라 자산 변경', `시스템 ${id} 삭제 — ${x.name}`)
  revalidatePath('/', 'layout')
}

export default async function SystemsPage() {
  await requireMenu('/infra/systems')
  const s = getStore()

  const diskWarns = s.servers.filter((v) => v.diskUsedPct > DISK_WARN)
  // 손상 파일이 system.name 을 누락·비문자열로 남기면 .replace 가 500 을 낸다(머지 strFields 정규화는
  // 비문자열은 강제하나 누락(undefined)은 옵셔널 보존을 위해 두므로, 여기서 문자열로 방어한다).
  // 손상 파일이 system.name 을 누락·비문자열로 남기면 .replace 가 500 을 낸다(머지 strFields 정규화는
  // 비문자열은 강제하나 누락(undefined)은 옵셔널 보존을 위해 두므로, 여기서 문자열로 방어한다).
  const incidentsOf = (systemName: string) => {
    const n = String(systemName ?? '')
    return s.incidents.filter((i) => i.system === n || i.system === n.replace(' (개발계)', ''))
  }
  const physicals = s.hardware.filter((h) => h.kind === '물리서버')

  return (
    <>
      <ScreenHeader kicker="인프라 운영" title="시스템 · 서버 현황"
        desc="랙 → H/W → 서버 → 시스템(애플리케이션) 구성 — 접속 URL·개발계/운영계·서버 매핑과 장애 이력을 잇는다." />

      <div className="stat-row">
        <Stat value={s.systems.length} label="시스템" note={`운영계 ${s.systems.filter((x) => x.env === '운영계').length}`} />
        <Stat value={s.servers.length} label="서버" note={`랙 ${new Set(s.servers.map((v) => v.rack)).size}개`} />
        <Stat value={diskWarns.length} label={`디스크 경고 (>${DISK_WARN}%)`} tone={diskWarns.length > 0 ? 'err' : undefined} />
        <Stat value={s.incidents.filter((i) => i.status === '조치중').length} label="조치중 장애" tone={s.incidents.some((i) => i.status === '조치중') ? 'warn' : undefined} />
      </div>

      <Card title="시스템 현황 — 애플리케이션" kicker="Systems" pad={false}
        actions={<a className="btn sm" href="/api/export?type=systems">엑셀 다운로드</a>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>코드</th><th>시스템</th><th>구분</th><th>접속 URL</th><th>서버</th><th>담당</th><th className="num">장애 이력</th><th className="c">삭제</th></tr>
            </thead>
            <tbody>
              {s.systems.map((x) => {
                const inc = incidentsOf(x.name)
                const inUse = s.batchJobs.some((b) => b.system === x.name) || s.interfaces.some((f) => f.from === x.name || f.to === x.name)
                return (
                  <tr key={x.id}>
                    <td className="code">{x.id}</td>
                    <td className="strong">{x.name}</td>
                    <td>{x.env === '운영계' ? <Chip tone="info" bare>운영계</Chip> : <Chip tone="neutral" bare>개발계</Chip>}</td>
                    <td className="mono" style={{ fontSize: 11.5 }}>{x.url}</td>
                    <td>{x.serverIds.map((id) => s.servers.find((v) => v.id === id)?.hostname).join(' · ')}</td>
                    <td>{x.owner}</td>
                    <td className="num">
                      {inc.length > 0
                        ? <Link href="/infra/incidents"><Chip tone={inc.some((i) => i.status === '조치중') ? 'err' : 'neutral'} bare>{inc.length}건</Chip></Link>
                        : <span className="mut">-</span>}
                    </td>
                    <td className="c">
                      {inUse ? (
                        <span className="mut" title="배치·인터페이스가 참조 중 — 삭제 불가">사용중</span>
                      ) : (
                        <form action={deleteSystem} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={x.id} />
                          <button type="submit" className="btn sm danger">삭제</button>
                        </form>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ borderTop: '1px solid var(--line)', padding: '8px 12px' }}>
          <form action={addSystem} className="hstack" style={{ flexWrap: 'wrap', gap: 5 }}>
            <input aria-label="시스템명" className="input" name="name" required maxLength={60} placeholder="시스템명" style={{ width: 130, height: 26, fontSize: 11.5 }} />
            <input aria-label="접속 URL" className="input" name="url" required maxLength={120} placeholder="접속 URL" style={{ flex: 1, minWidth: 150, height: 26, fontSize: 11.5 }} />
            <select aria-label="env" className="select" name="env" style={{ height: 26, fontSize: 11.5 }}>
              <option>운영계</option><option>개발계</option>
            </select>
            <select className="select" name="serverId" style={{ height: 26, fontSize: 11.5 }} title="매핑 서버">
              {s.servers.map((v) => <option key={v.id} value={v.id}>{v.hostname}</option>)}
            </select>
            <input aria-label="담당" className="input" name="owner" required maxLength={40} placeholder="담당" style={{ width: 80, height: 26, fontSize: 11.5 }} />
            <button type="submit" className="btn sm pri">시스템 등록</button>
          </form>
        </div>
      </Card>

      <Card title="서버 · 랙 구성" kicker="Servers" pad={false}
        actions={<a className="btn sm" href="/api/export?type=servers">엑셀 다운로드</a>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>호스트명</th><th>IP</th><th>용도</th><th>OS</th><th>CPU</th><th className="num">메모리</th><th>랙</th><th style={{ width: 200 }}>디스크 사용률</th><th className="c">삭제</th></tr>
            </thead>
            <tbody>
              {s.servers.map((v) => {
                const mapped = s.systems.some((x) => x.serverIds.includes(v.id))
                return (
                  <tr key={v.id}>
                    <td className="code">{v.hostname}</td>
                    <td className="mono" style={{ fontSize: 11.5 }}>{v.ip}</td>
                    <td><Chip tone="neutral" bare>{v.purpose}</Chip></td>
                    <td>{v.os}</td>
                    <td className="tnum">{v.cpu ?? '-'}</td>
                    <td className="num tnum">{v.memoryGb ? `${v.memoryGb}GB` : '-'}</td>
                    <td className="tnum">{v.rack}</td>
                    <td>
                      <div className="hstack" style={{ gap: 7 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${v.diskUsedPct}%`, height: '100%', background: v.diskUsedPct > DISK_WARN ? 'var(--err)' : v.diskUsedPct > 70 ? 'var(--warn)' : 'var(--ink)' }} />
                        </div>
                        <span className="tnum" style={{ fontSize: 11.5, width: 34, textAlign: 'right', color: v.diskUsedPct > DISK_WARN ? 'var(--err)' : undefined }}>{v.diskUsedPct}%</span>
                      </div>
                    </td>
                    <td className="c">
                      {mapped ? (
                        <span className="mut" title="시스템이 매핑된 서버 — 삭제 불가">사용중</span>
                      ) : (
                        <form action={deleteServer} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={v.id} />
                          <button type="submit" className="btn sm danger">삭제</button>
                        </form>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ borderTop: '1px solid var(--line)', padding: '8px 12px' }}>
          <form action={addServer} className="hstack" style={{ flexWrap: 'wrap', gap: 5 }}>
            <input aria-label="호스트명" className="input" name="hostname" required maxLength={40} placeholder="호스트명" style={{ width: 110, height: 26, fontSize: 11.5 }} />
            <input aria-label="IP" className="input" name="ip" required maxLength={20} placeholder="IP" style={{ width: 100, height: 26, fontSize: 11.5 }} />
            <select aria-label="용도" className="select" name="purpose" style={{ height: 26, fontSize: 11.5 }}>
              {PURPOSES.map((p) => <option key={p}>{p}</option>)}
            </select>
            <input aria-label="OS" className="input" name="os" required maxLength={60} placeholder="OS" style={{ width: 140, height: 26, fontSize: 11.5 }} />
            <input aria-label="CPU" className="input" name="cpu" maxLength={20} placeholder="CPU" style={{ width: 70, height: 26, fontSize: 11.5 }} />
            <input aria-label="GB" className="input" name="memoryGb" type="number" min={1} placeholder="GB" style={{ width: 55, height: 26, fontSize: 11.5 }} />
            <select className="select" name="hwId" style={{ height: 26, fontSize: 11.5 }} title="장착 H/W(물리서버) — 랙은 H/W 를 따른다">
              {physicals.map((h) => <option key={h.id} value={h.id}>{h.id} · {h.model} ({h.rackId})</option>)}
            </select>
            <button type="submit" className="btn sm pri">서버 등록</button>
          </form>
        </div>
      </Card>

      <div className="callout">
        <b>연계</b> — 장애 이력은 <b>장애관리</b>의 시스템명 기준 집계이고, 배치·인터페이스·디스크 상세는{' '}
        <b>배치 · 인터페이스 · 디스크</b> 화면에서 관리한다. 랙·H/W 는 <b>랙 · H/W 관리</b>에서 등록한다.
      </div>
    </>
  )
}
