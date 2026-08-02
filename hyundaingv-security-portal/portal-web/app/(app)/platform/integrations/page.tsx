import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { audit } from '@/lib/audit'
import { requireRole } from '@/lib/authz'
import { nowStamp } from '@/lib/dates'
import { channelSummary, hrAdapter, isEnabled } from '@/lib/integrations/registry'
import { getStore } from '@/lib/store'
import { CHANNELS, PORTAL } from '@/portal.config'

async function toggleChannel(formData: FormData) {
  'use server'
  const me = await requireRole('ADMIN')
  const id = String(formData.get('id') ?? '')
  const ch = CHANNELS.find((c) => c.id === id)
  if (!ch) return
  const s = getStore()
  const next = !(s.channelStates[id] ?? false)
  s.channelStates[id] = next
  audit(me.name, '연동 채널 변경', `${ch.name}: ${next ? '가동' : '중지'}`)
  revalidatePath('/', 'layout')
}

async function syncHr() {
  'use server'
  const me = await requireRole('ADMIN')
  const s = getStore()
  const adapter = hrAdapter()
  if (!adapter || !isEnabled('hr-sync')) {
    s.batchRuns.unshift({ job: '인사정보 동기화 (수동)', ranAt: nowStamp(), result: '실패' })
  } else {
    // 폐쇄 루프 — 인사 어댑터가 디렉터리의 단일 원천. 동기화가 서약 대상·부서 현황 집계 기준을 갱신한다.
    s.people = await adapter.fetchPeople()
    s.batchRuns.unshift({ job: `인사정보 동기화 (수동, ${s.people.length}명)`, ranAt: nowStamp(), result: '성공' })
    audit(me.name, '인사정보 동기화', `${s.people.length}명 (수동)`)
  }
  revalidatePath('/', 'layout')
}

export default async function IntegrationsPage() {
  await requireRole('ADMIN')
  const s = getStore()
  const sum = channelSummary()

  return (
    <>
      <ScreenHeader kicker="기타 (기반)" title="연동 · 인프라"
        desc={`고객사 프로필(portal.config.ts)이 바인딩한 연동 채널 — 현재 프로필: ${PORTAL.customer}`} />

      <div className="stat-row">
        <Stat value={`${sum.on}/${sum.total}`} label="활성 채널" tone={sum.on < sum.total ? 'warn' : undefined} />
        <Stat value={s.sendLog.length} label="발송 이력" note="메일 · 문자" />
        <Stat value={s.sendLog.filter((l) => !l.ok).length} label="발송 실패" tone={s.sendLog.some((l) => !l.ok) ? 'err' : undefined} />
        <Stat value={s.people.length} label="디렉터리 인원" note="인사 연동 기준" />
      </div>

      <div className="callout">
        <b>재사용 프레임워크</b> — 포털 본체는 어댑터 인터페이스(<span className="mono">lib/integrations/types.ts</span>)만
        의존한다. 고객사 배포 시 목업 어댑터를 고객사 구현(그룹웨어·인사·자산·보안 시스템)으로 교체하고
        <span className="mono"> portal.config.ts</span>의 채널 바인딩만 바꾼다.
      </div>

      <Card title="연동 채널" kicker="Channels"
        actions={
          <form action={syncHr}>
            <button type="submit" className="btn sm">인사정보 즉시 동기화</button>
          </form>
        } pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>채널</th><th>방식</th><th>용도</th><th>어댑터</th><th>상태</th><th className="c">제어</th></tr>
            </thead>
            <tbody>
              {CHANNELS.map((c) => {
                const on = isEnabled(c.id)
                return (
                  <tr key={c.id}>
                    <td className="strong">{c.name}</td>
                    <td><Chip tone="neutral" bare>{c.transport}</Chip></td>
                    <td style={{ maxWidth: 420, whiteSpace: 'normal' }}>{c.usage}</td>
                    <td className="code">{c.adapterId}</td>
                    <td>{on ? <Chip tone="ok">가동중</Chip> : <Chip tone="err">중지</Chip>}</td>
                    <td className="c">
                      <form action={toggleChannel} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className={`btn sm ${on ? 'danger' : 'pri'}`}>{on ? '중지' : '가동'}</button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="cols c2">
        <Card title="발송 이력" kicker="Send Log" pad={false}>
          {s.sendLog.length === 0 ? (
            <div className="empty">어댑터 경유 발송 이력이 없습니다.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>일시</th><th>채널</th><th>제목</th><th className="num">수신</th><th>결과</th></tr></thead>
                <tbody>
                  {s.sendLog.slice(0, 12).map((l, i) => (
                    <tr key={i}>
                      <td className="tnum">{l.at}</td>
                      <td>{CHANNELS.find((c) => c.id === l.channelId)?.name ?? l.channelId}</td>
                      <td>{l.subject}</td>
                      <td className="num">{l.to}</td>
                      <td>{l.ok ? <Chip tone="ok" bare>성공</Chip> : <Chip tone="err" bare>실패</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="배치 실행 이력" kicker="Batch" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>작업</th><th>실행 시각</th><th>결과</th></tr></thead>
              <tbody>
                {s.batchRuns.slice(0, 12).map((b, i) => (
                  <tr key={i}>
                    <td className="strong">{b.job}</td>
                    <td className="tnum">{b.ranAt}</td>
                    <td>{b.result === '성공' ? <Chip tone="ok" bare>성공</Chip> : <Chip tone="err" bare>실패</Chip>}</td>
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
