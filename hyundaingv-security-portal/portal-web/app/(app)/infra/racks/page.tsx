import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { audit } from '@/lib/audit'
import { requireAction, requireMenu, requireMenuRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import type { Hardware } from '@/lib/types'

const HW_KINDS: Hardware['kind'][] = ['물리서버', '네트워크장비', '스토리지']
const HW_CHIP: Record<Hardware['kind'], 'info' | 'warn' | 'neutral'> = { 물리서버: 'info', 네트워크장비: 'warn', 스토리지: 'neutral' }

/** 랙 등록 (요구사항 28행 저장 ◎) — 위치·사이즈(U)·자산번호 */
async function addRack(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/racks', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '').trim().toUpperCase().slice(0, 10)
  const location = String(formData.get('location') ?? '').trim().slice(0, 80)
  const sizeU = Number(formData.get('sizeU'))
  const assetNo = String(formData.get('assetNo') ?? '').trim().slice(0, 40)
  if (!/^[A-Z0-9]+-[0-9]+$/.test(id) || !location || !Number.isFinite(sizeU) || sizeU <= 0 || sizeU > 60 || !assetNo) return
  const s = getStore()
  if (s.racks.some((r) => r.id === id)) return
  s.racks.push({ id, location, sizeU: Math.round(sizeU), assetNo })
  audit(me.name, '인프라 자산 변경', `랙 ${id} 등록 — ${location} (${Math.round(sizeU)}U)`)
  revalidatePath('/', 'layout')
}

/** 랙 삭제 (요구사항 28행 삭제 ◎) — H/W·서버가 장착된 랙은 삭제 불가 */
async function deleteRack(formData: FormData) {
  'use server'
  const me = await requireAction('/infra/racks', 'delete')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const rack = s.racks.find((r) => r.id === id)
  if (!rack || s.hardware.some((h) => h.rackId === id) || s.servers.some((v) => v.rack === id)) return
  s.racks = s.racks.filter((r) => r.id !== id)
  audit(me.name, '인프라 자산 변경', `랙 ${id} 삭제 — ${rack.location}`)
  revalidatePath('/', 'layout')
}

/** H/W 등록 (요구사항 30행 저장 ◎) — 물리서버·네트워크장비·스토리지 */
async function addHardware(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/racks', 'BIZ_MGR', 'ADMIN')
  const kind = String(formData.get('kind') ?? '') as Hardware['kind']
  const model = String(formData.get('model') ?? '').trim().slice(0, 80)
  const rackId = String(formData.get('rackId') ?? '')
  const assetNo = String(formData.get('assetNo') ?? '').trim().slice(0, 40)
  const s = getStore()
  if (!HW_KINDS.includes(kind) || !model || !assetNo || !s.racks.some((r) => r.id === rackId)) return
  const max = s.hardware.reduce((m, h) => Math.max(m, Number(h.id.replace('HW-', '')) || 0), 0)
  const id = `HW-${String(max + 1).padStart(2, '0')}`
  s.hardware.push({ id, kind, model, rackId, assetNo })
  audit(me.name, '인프라 자산 변경', `H/W ${id} 등록 — [${kind}] ${model} (${rackId})`)
  revalidatePath('/', 'layout')
}

/** H/W 삭제 (요구사항 30행 삭제 ◎) — 서버가 올라간 물리서버는 삭제 불가 */
async function deleteHardware(formData: FormData) {
  'use server'
  const me = await requireAction('/infra/racks', 'delete')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const hw = s.hardware.find((h) => h.id === id)
  if (!hw || s.servers.some((v) => v.hwId === id)) return
  s.hardware = s.hardware.filter((h) => h.id !== id)
  audit(me.name, '인프라 자산 변경', `H/W ${id} 삭제 — ${hw.model}`)
  revalidatePath('/', 'layout')
}

export default async function RacksPage() {
  await requireMenu('/infra/racks')
  const s = getStore()

  return (
    <>
      <ScreenHeader kicker="인프라 운영" title="랙 · H/W 관리"
        desc="랙과 물리장비 관리. 하단 구성도에서 랙부터 배치·인터페이스까지 연결을 확인한다." />

      <div className="stat-row">
        <Stat value={s.racks.length} label="랙" note={`총 ${s.racks.reduce((sum, r) => sum + r.sizeU, 0)}U`} />
        <Stat value={s.hardware.length} label="H/W" note={`물리서버 ${s.hardware.filter((h) => h.kind === '물리서버').length}대`} />
        <Stat value={s.servers.length} label="논리 서버" />
        <Stat value={s.systems.length} label="시스템" />
      </div>

      <div className="cols c2">
        <Card title="랙관리" pad={false}
          actions={<a className="btn sm" href="/api/export?type=racks">엑셀 다운로드</a>}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>랙번호</th><th>위치</th><th className="num">사이즈</th><th>자산번호</th><th className="num">장착</th><th className="c">삭제</th></tr></thead>
              <tbody>
                {s.racks.map((r) => {
                  const mounted = s.hardware.filter((h) => h.rackId === r.id).length
                  const inUse = mounted > 0 || s.servers.some((v) => v.rack === r.id)
                  return (
                    <tr key={r.id}>
                      <td className="code">{r.id}</td>
                      <td>{r.location}</td>
                      <td className="num tnum">{r.sizeU}U</td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{r.assetNo}</td>
                      <td className="num">{mounted}대</td>
                      <td className="c">
                        {inUse ? (
                          <span className="mut" title="H/W·서버가 장착된 랙 — 삭제 불가">사용중</span>
                        ) : (
                          <form action={deleteRack} style={{ display: 'inline' }}>
                            <input type="hidden" name="id" value={r.id} />
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
            <form action={addRack} className="hstack" style={{ flexWrap: 'wrap', gap: 5 }}>
              <input aria-label="랙번호" className="input" name="id" required maxLength={10} placeholder="랙번호 (예: C-01)" style={{ width: 100, height: 26, fontSize: 11.5 }} />
              <input aria-label="위치" className="input" name="location" required maxLength={80} placeholder="위치" style={{ flex: 1, minWidth: 120, height: 26, fontSize: 11.5 }} />
              <input aria-label="U" className="input" name="sizeU" required type="number" min={1} placeholder="U" style={{ width: 60, height: 26, fontSize: 11.5 }} />
              <input aria-label="자산번호" className="input" name="assetNo" required maxLength={40} placeholder="자산번호" style={{ width: 110, height: 26, fontSize: 11.5 }} />
              <button type="submit" className="btn sm pri">랙 등록</button>
            </form>
          </div>
        </Card>

        <Card title="H/W 관리" pad={false}
          actions={<a className="btn sm" href="/api/export?type=hardware">엑셀 다운로드</a>}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>번호</th><th>구분</th><th>모델</th><th>랙</th><th>자산번호</th><th className="c">삭제</th></tr></thead>
              <tbody>
                {s.hardware.map((h) => {
                  const hosting = s.servers.some((v) => v.hwId === h.id)
                  return (
                    <tr key={h.id}>
                      <td className="code">{h.id}</td>
                      <td><Chip tone={HW_CHIP[h.kind]} bare>{h.kind}</Chip></td>
                      <td className="strong">{h.model}</td>
                      <td className="tnum">{h.rackId}</td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{h.assetNo}</td>
                      <td className="c">
                        {hosting ? (
                          <span className="mut" title="서버가 올라간 H/W — 삭제 불가">사용중</span>
                        ) : (
                          <form action={deleteHardware} style={{ display: 'inline' }}>
                            <input type="hidden" name="id" value={h.id} />
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
            <form action={addHardware} className="hstack" style={{ flexWrap: 'wrap', gap: 5 }}>
              <select aria-label="유형" className="select" name="kind" style={{ height: 26, fontSize: 11.5 }}>
                {HW_KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
              <input aria-label="모델" className="input" name="model" required maxLength={80} placeholder="모델" style={{ flex: 1, minWidth: 130, height: 26, fontSize: 11.5 }} />
              <select aria-label="랙" className="select" name="rackId" style={{ height: 26, fontSize: 11.5 }}>
                {s.racks.map((r) => <option key={r.id}>{r.id}</option>)}
              </select>
              <input aria-label="자산번호" className="input" name="assetNo" required maxLength={40} placeholder="자산번호" style={{ width: 110, height: 26, fontSize: 11.5 }} />
              <button type="submit" className="btn sm pri">H/W 등록</button>
            </form>
          </div>
        </Card>
      </div>

      {/* 요구사항 29행 — 랙구성도: 랙 → H/W → 서버 → 시스템 → 배치·인터페이스 도식화 */}
      <Card title="랙구성도">
        <div className="vstack" style={{ gap: 12 }}>
          {s.racks.map((rack) => (
            <div key={rack.id} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '10px 12px' }}>
              <div className="hstack" style={{ gap: 8, marginBottom: 6 }}>
                <Chip tone="neutral">랙 {rack.id}</Chip>
                <span className="dim" style={{ fontSize: 11.5 }}>{rack.location} · {rack.sizeU}U · {rack.assetNo}</span>
              </div>
              {s.hardware.filter((h) => h.rackId === rack.id).map((hw) => {
                const hosted = s.servers.filter((v) => v.hwId === hw.id)
                return (
                  <div key={hw.id} style={{ marginLeft: 14, paddingLeft: 12, borderLeft: 0, marginBottom: 6 }}>
                    <div className="hstack" style={{ gap: 6 }}>
                      <span className="mut">└</span>
                      <Chip tone={HW_CHIP[hw.kind]} bare>{hw.kind}</Chip>
                      <span className="strong" style={{ fontSize: 12 }}>{hw.model}</span>
                      <span className="mut mono" style={{ fontSize: 11 }}>{hw.id}</span>
                    </div>
                    {hosted.map((sv) => {
                      const sys = s.systems.filter((x) => x.serverIds.includes(sv.id))
                      return (
                        <div key={sv.id} style={{ marginLeft: 26, marginTop: 3 }}>
                          <div className="hstack" style={{ gap: 6 }}>
                            <span className="mut">└</span>
                            <span className="mono" style={{ fontSize: 11.5 }}>{sv.hostname}</span>
                            <span className="mut" style={{ fontSize: 11 }}>{sv.ip} · {sv.purpose}{sv.cpu ? ` · ${sv.cpu}` : ''}{sv.memoryGb ? ` · ${sv.memoryGb}GB` : ''}</span>
                          </div>
                          {sys.map((x) => {
                            const batches = s.batchJobs.filter((b) => b.system === x.name)
                            const ifaces = s.interfaces.filter((f) => f.from === x.name || f.to === x.name)
                            return (
                              <div key={x.id} className="hstack" style={{ marginLeft: 26, marginTop: 2, gap: 6, flexWrap: 'wrap' }}>
                                <span className="mut">└</span>
                                <Chip tone="info" bare>{x.name}</Chip>
                                <span className="mut" style={{ fontSize: 11 }}>
                                  {x.env} · 배치 {batches.length}건 · 인터페이스 {ifaces.length}건
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="dim" style={{ fontSize: 11.5, marginTop: 10 }}>
          랙 → H/W → 서버 → 시스템 사슬은 등록 데이터에서 그려진다 — 배치·인터페이스 수는 시스템명 매칭 집계.
        </div>
      </Card>
    </>
  )
}
