import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { audit } from '@/lib/audit'
import { requireAction, requireMenu, requireMenuRole } from '@/lib/authz'
import { nowStamp } from '@/lib/dates'
import { computeInfraHealth, DISK_CAUTION, DISK_WARN } from '@/lib/infra'
import { getStore, recordBatch } from '@/lib/store'
import type { BatchJob, InterfaceDef } from '@/lib/types'

const SCHEDULES: BatchJob['schedule'][] = ['일', '주', '월']
const IF_METHODS: InterfaceDef['method'][] = ['REST API', 'DB 연계', '파일']

function nextId(prefix: string, existing: string[]): string {
  const max = existing.reduce((m, id) => Math.max(m, Number(id.replace(`${prefix}-`, '')) || 0), 0)
  return `${prefix}-${String(max + 1).padStart(2, '0')}`
}

/** 배치 잡 등록 (요구사항 33행 저장 ◎) — 대상 시스템은 시스템관리가 단일 원천 */
async function addBatch(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/operations', 'BIZ_MGR', 'ADMIN')
  const name = String(formData.get('name') ?? '').trim().slice(0, 60)
  const system = String(formData.get('system') ?? '')
  const schedule = String(formData.get('schedule') ?? '') as BatchJob['schedule']
  const s = getStore()
  if (!name || !SCHEDULES.includes(schedule) || !s.systems.some((x) => x.name === system)) return
  if (s.batchJobs.some((b) => b.name === name)) return
  const id = nextId('BJ', s.batchJobs.map((b) => b.id))
  s.batchJobs.push({ id, name, system, schedule })
  audit(me.name, '인프라 자산 변경', `배치 ${id} 등록 — ${name} (${system}, ${schedule})`)
  revalidatePath('/', 'layout')
}

/** 배치 잡 삭제 (요구사항 33행 삭제 ◎) */
async function deleteBatch(formData: FormData) {
  'use server'
  const me = await requireAction('/infra/operations', 'delete')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const b = s.batchJobs.find((x) => x.id === id)
  if (!b) return
  s.batchJobs = s.batchJobs.filter((x) => x.id !== id)
  audit(me.name, '인프라 자산 변경', `배치 ${id} 삭제 — ${b.name}`)
  revalidatePath('/', 'layout')
}

/** 인터페이스 등록 (요구사항 34행 저장 ◎) — 구간은 자유 기재(대외 시스템 포함) */
async function addInterface(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/operations', 'BIZ_MGR', 'ADMIN')
  const name = String(formData.get('name') ?? '').trim().slice(0, 60)
  const from = String(formData.get('from') ?? '').trim().slice(0, 40)
  const to = String(formData.get('to') ?? '').trim().slice(0, 40)
  const method = String(formData.get('method') ?? '') as InterfaceDef['method']
  const s = getStore()
  if (!name || !from || !to || !IF_METHODS.includes(method) || s.interfaces.some((i) => i.name === name)) return
  const id = nextId('IF', s.interfaces.map((i) => i.id))
  s.interfaces.push({ id, name, from, to, method, status: '정상' })
  audit(me.name, '인프라 자산 변경', `인터페이스 ${id} 등록 — ${name} (${from} → ${to})`)
  revalidatePath('/', 'layout')
}

/** 인터페이스 삭제 (요구사항 34행 삭제 ◎) */
async function deleteInterface(formData: FormData) {
  'use server'
  const me = await requireAction('/infra/operations', 'delete')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const i = s.interfaces.find((x) => x.id === id)
  if (!i) return
  s.interfaces = s.interfaces.filter((x) => x.id !== id)
  audit(me.name, '인프라 자산 변경', `인터페이스 ${id} 삭제 — ${i.name}`)
  revalidatePath('/', 'layout')
}

async function runBatch(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/infra/operations', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const job = s.batchJobs.find((b) => b.id === id)
  if (!job) return
  job.lastRun = nowStamp()
  job.lastResult = '성공'
  // 폐쇄 루프 — 수동 실행이 배치 이력으로 남아 상태바 '마지막 배치'가 갱신된다
  recordBatch(`${job.name} (수동 재실행)`, job.lastRun, '성공')
  audit(me.name, '배치 수동 실행', `${job.id} ${job.name}`)
  revalidatePath('/', 'layout')
}

export default async function OperationsPage() {
  await requireMenu('/infra/operations')
  const s = getStore()

  // 배치 실패·인터페이스 오류 집계는 lib/infra 단일 원천(대시보드·종합 export 와 같은 값)
  const infra = computeInfraHealth(s)

  return (
    <>
      <ScreenHeader kicker="인프라 운영" title="배치 · 인터페이스 · 디스크"
        desc="배치 잡 실행 이력과 대내외 인터페이스 연계 상태, 서버별 디스크 사용률을 관리한다." />

      <div className="stat-row">
        <Stat value={infra.batchTotal} label="배치 잡" />
        <Stat value={infra.failedBatches} label="배치 실패" tone={infra.failedBatches > 0 ? 'err' : undefined} note="최근 실행 기준" />
        <Stat value={infra.ifTotal} label="인터페이스" />
        <Stat value={infra.brokenIfs} label="인터페이스 오류" tone={infra.brokenIfs > 0 ? 'err' : undefined} />
      </div>

      <Card title="배치관리" pad={false}
        actions={<a className="btn sm" href="/api/export?type=batches">엑셀 다운로드</a>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>잡</th><th>대상 시스템</th><th>주기</th><th>최근 실행</th><th>결과</th><th className="c">재실행</th></tr>
            </thead>
            <tbody>
              {s.batchJobs.map((b) => (
                <tr key={b.id}>
                  <td className="strong">{b.name}</td>
                  <td>{b.system}</td>
                  <td><Chip tone="neutral" bare>{b.schedule}배치</Chip></td>
                  <td className="tnum">{b.lastRun ?? '-'}</td>
                  <td>{b.lastResult === '성공' ? <Chip tone="ok" bare>성공</Chip> : b.lastResult === '실패' ? <Chip tone="err" bare>실패</Chip> : <span className="mut">-</span>}</td>
                  <td className="c">
                    <form action={runBatch} style={{ display: 'inline' }}>
                      <input type="hidden" name="id" value={b.id} />
                      <button type="submit" className="btn sm">즉시 실행</button>
                    </form>
                    <form action={deleteBatch} style={{ display: 'inline', marginLeft: 4 }}>
                      <input type="hidden" name="id" value={b.id} />
                      <button type="submit" className="btn sm danger">삭제</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ borderTop: '1px solid var(--line)', padding: '8px 12px' }}>
          <form action={addBatch} className="hstack" style={{ flexWrap: 'wrap', gap: 5 }}>
            <input aria-label="배치 잡 이름" className="input" name="name" required maxLength={60} placeholder="배치 잡 이름" style={{ flex: 1, minWidth: 150, height: 26, fontSize: 11.5 }} />
            <select className="select" name="system" style={{ height: 26, fontSize: 11.5 }} title="대상 시스템 — 시스템관리 기준">
              {s.systems.map((x) => <option key={x.id}>{x.name}</option>)}
            </select>
            <select aria-label="주기" className="select" name="schedule" style={{ height: 26, fontSize: 11.5 }}>
              {['일', '주', '월'].map((c) => <option key={c}>{c}</option>)}
            </select>
            <button type="submit" className="btn sm pri">배치 등록</button>
          </form>
        </div>
      </Card>

      <div className="cols c2">
        <Card title="인터페이스관리" pad={false}
          actions={<a className="btn sm" href="/api/export?type=interfaces">엑셀 다운로드</a>}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>인터페이스</th><th>구간</th><th>방식</th><th>상태</th><th className="c">삭제</th></tr></thead>
              <tbody>
                {s.interfaces.map((i) => (
                  <tr key={i.id}>
                    <td className="strong">{i.name}</td>
                    <td>{i.from} → {i.to}</td>
                    <td><Chip tone="neutral" bare>{i.method}</Chip></td>
                    <td>{i.status === '정상' ? <Chip tone="ok">정상</Chip> : <Chip tone="err">오류</Chip>}</td>
                    <td className="c">
                      <form action={deleteInterface} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={i.id} />
                        <button type="submit" className="btn sm danger">삭제</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: '8px 12px' }}>
            <form action={addInterface} className="hstack" style={{ flexWrap: 'wrap', gap: 5 }}>
              <input aria-label="인터페이스명" className="input" name="name" required maxLength={60} placeholder="인터페이스명" style={{ flex: 1, minWidth: 110, height: 26, fontSize: 11.5 }} />
              <input aria-label="From" className="input" name="from" required maxLength={40} placeholder="From" style={{ width: 80, height: 26, fontSize: 11.5 }} />
              <input aria-label="To" className="input" name="to" required maxLength={40} placeholder="To" style={{ width: 80, height: 26, fontSize: 11.5 }} />
              <select aria-label="방식" className="select" name="method" style={{ height: 26, fontSize: 11.5 }}>
                {['REST API', 'DB 연계', '파일'].map((m) => <option key={m}>{m}</option>)}
              </select>
              <button type="submit" className="btn sm pri">등록</button>
            </form>
          </div>
        </Card>

        <Card title="서버별 디스크 사용 현황" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>호스트명</th><th>용도</th><th style={{ width: 220 }}>사용률</th></tr></thead>
              <tbody>
                {[...s.servers].sort((a, b) => b.diskUsedPct - a.diskUsedPct).map((v) => (
                  <tr key={v.id}>
                    <td className="code">{v.hostname}</td>
                    <td><Chip tone="neutral" bare>{v.purpose}</Chip></td>
                    <td>
                      <div className="hstack" style={{ gap: 7 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${v.diskUsedPct}%`, height: '100%', background: v.diskUsedPct > DISK_WARN ? 'var(--err)' : v.diskUsedPct > DISK_CAUTION ? 'var(--warn)' : 'var(--ink)' }} />
                        </div>
                        <span className="tnum" style={{ fontSize: 11.5, width: 34, textAlign: 'right', color: v.diskUsedPct > DISK_WARN ? 'var(--err)' : undefined }}>{v.diskUsedPct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}
