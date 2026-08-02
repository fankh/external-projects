import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { nowStamp } from '@/lib/dates'
import { getStore } from '@/lib/store'

async function runBatch(formData: FormData) {
  'use server'
  await requireRole('BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const job = s.batchJobs.find((b) => b.id === id)
  if (!job) return
  job.lastRun = nowStamp()
  job.lastResult = '성공'
  // 폐쇄 루프 — 수동 실행이 배치 이력으로 남아 상태바 '마지막 배치'가 갱신된다
  s.batchRuns.unshift({ job: `${job.name} (수동 재실행)`, ranAt: job.lastRun, result: '성공' })
  revalidatePath('/', 'layout')
}

export default async function OperationsPage() {
  await requireRole('BIZ_MGR', 'ADMIN')
  const s = getStore()

  const failedBatches = s.batchJobs.filter((b) => b.lastResult === '실패')
  const brokenIfs = s.interfaces.filter((i) => i.status === '오류')

  return (
    <>
      <ScreenHeader kicker="인프라 운영" title="배치 · 인터페이스 · 디스크"
        desc="배치 잡 실행 이력과 대내외 인터페이스 연계 상태, 서버별 디스크 사용률을 관리한다." />

      <div className="stat-row">
        <Stat value={s.batchJobs.length} label="배치 잡" />
        <Stat value={failedBatches.length} label="배치 실패" tone={failedBatches.length > 0 ? 'err' : undefined} note="최근 실행 기준" />
        <Stat value={s.interfaces.length} label="인터페이스" />
        <Stat value={brokenIfs.length} label="인터페이스 오류" tone={brokenIfs.length > 0 ? 'err' : undefined} />
      </div>

      <Card title="배치관리" kicker="Batch Jobs" pad={false}>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="cols c2">
        <Card title="인터페이스관리" kicker="Interfaces" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>인터페이스</th><th>구간</th><th>방식</th><th>상태</th></tr></thead>
              <tbody>
                {s.interfaces.map((i) => (
                  <tr key={i.id}>
                    <td className="strong">{i.name}</td>
                    <td>{i.from} → {i.to}</td>
                    <td><Chip tone="neutral" bare>{i.method}</Chip></td>
                    <td>{i.status === '정상' ? <Chip tone="ok">정상</Chip> : <Chip tone="err">오류</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="서버별 디스크 사용 현황" kicker="Disk" pad={false}>
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
                          <div style={{ width: `${v.diskUsedPct}%`, height: '100%', background: v.diskUsedPct > 85 ? 'var(--err)' : v.diskUsedPct > 70 ? 'var(--warn)' : 'var(--ink)' }} />
                        </div>
                        <span className="tnum" style={{ fontSize: 11.5, width: 34, textAlign: 'right', color: v.diskUsedPct > 85 ? 'var(--err)' : undefined }}>{v.diskUsedPct}%</span>
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
