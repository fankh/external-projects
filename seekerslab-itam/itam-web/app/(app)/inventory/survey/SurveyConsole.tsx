'use client'
import { useRef, useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { SurveyDiff, SurveyScan } from '@/lib/types'
import { completeRound, raiseAdjustment, scanAsset } from './actions'

const RESULT_TONE = { 일치: 'ok', 차이: 'warn', '대장 미등록': 'err' } as const
const DIFF_TONE: Record<SurveyDiff['kind'], 'warn' | 'err' | 'neutral'> = {
  '위치 불일치': 'warn', '상태 불일치': 'warn', '미확인 (실사 없음)': 'neutral', '대장 미등록': 'err',
}

export function SurveyConsole(props: {
  roundId: string
  roundName: string
  roundStatus: '계획' | '진행중' | '완료'
  scans: SurveyScan[]
  diffs: SurveyDiff[]
  assignee: string
  me: string
  /** 실사 위치 — 공통코드 LOCATION 그룹의 사용 중 코드 (환경설정 › 공통코드가 원천) */
  locations: string[]
  /** 미실사 남은 대장 대상 수 — 실사도 이탈 처리(분실·폐기)도 안 된 대상. 남아 있으면 회차를 마감할 수 없다(§03 완결성). */
  unscannedInLedger?: number
}) {
  const [code, setCode] = useState('')
  const [location, setLocation] = useState(props.locations[0] ?? '')
  const [feedback, setFeedback] = useState<{ ok: boolean; result?: string; message: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    const value = code
    if (!value.trim() || pending) return
    setCode('')
    startTransition(async () => {
      const res = await scanAsset(props.roundId, value, location)
      setFeedback(res)
      inputRef.current?.focus()
    })
  }

  const pendingDiffs = props.diffs.filter((d) => d.status === '미조치')
  // 미해결 차이(미조치·조정 상신)가 하나도 없어야 회차를 완료할 수 있다
  const allResolved = props.diffs.every((d) => d.status === '조정 완료')
  // 미실사 남은 대장 대상이 없어야(모두 스캔·분실·폐기 처리) 회차를 마감할 수 있다(§03 재물조사 완결성)
  const unscanned = props.unscannedInLedger ?? 0
  const canComplete = allResolved && unscanned === 0

  return (
    <>
      <Card kicker="Scan" title="스캔 실사"
        actions={<span className="hstack" style={{ gap: 10 }}>
          <span className="dim" style={{ fontSize: 11.5 }}>담당 {props.assignee} · 수행자 {props.me}</span>
          {props.roundStatus === '진행중' && (
            <button className="btn sm pri" disabled={pending || !canComplete}
              title={canComplete ? '실사·차이 조정을 마치고 회차를 마감합니다' : !allResolved ? '미해결 차이가 남아 있어 완료할 수 없습니다' : `미실사 대상 ${unscanned}건 — 실사 스캔 또는 분실 신고 후 마감`}
              onClick={() => startTransition(async () => {
                const r = await completeRound(props.roundId)
                setFeedback({ ok: r.ok, result: r.ok ? '조사 완료' : undefined, message: r.message })
              })}>조사 완료</button>
          )}
          {props.roundStatus === '완료' && <Chip tone="ok">완료</Chip>}
        </span>}>
        <div className="survey-scan">
          <div style={{ flex: '1 1 320px', minWidth: 260 }}>
            <div className="kicker mute" style={{ marginBottom: 6 }}>자산번호 · 바코드 / QR</div>
            <input
              ref={inputRef}
              className="input"
              style={{ width: '100%', height: 44, fontSize: 16, fontFamily: 'var(--mono)' }}
              placeholder="스캔하거나 자산번호 입력 후 Enter"
              value={code}
              autoFocus
              disabled={pending}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            />
            <div className="dim" style={{ fontSize: 11, marginTop: 5 }}>
              바코드 스캐너는 키보드로 인식되므로 스캔 즉시 자동 입력·확정됩니다.
            </div>
          </div>
          <div style={{ flex: '0 1 220px' }}>
            <div className="kicker mute" style={{ marginBottom: 6 }}>실사 위치</div>
            <select className="select" style={{ width: '100%', height: 44 }} value={location} disabled={pending}
              onChange={(e) => setLocation(e.target.value)}>
              {props.locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <button className="btn pri" style={{ height: 44, minWidth: 96 }} disabled={pending || !code.trim()} onClick={submit}>
            {pending ? '확인 중…' : '확정'}
          </button>
        </div>

        {feedback && (
          <div className={`callout ${feedback.ok && feedback.result === '일치' ? '' : 'warn'}`} style={{ marginTop: 14 }}>
            <b>{feedback.ok ? (feedback.result ?? '처리') : '처리 불가'}</b> — {feedback.message}
          </div>
        )}
      </Card>

      <div className="cols c2">
        <Card kicker="Scan Log" title="최근 스캔 이력" pad={false}>
          <div className="tbl-wrap" style={{ maxHeight: 300 }}>
            <table className="tbl">
              <thead><tr><th>일시</th><th>코드</th><th>실사 위치</th><th>수행자</th><th className="c">판정</th></tr></thead>
              <tbody>
                {props.scans.map((x) => (
                  <tr key={x.id}>
                    <td className="tnum">{x.scannedAt}</td>
                    <td className="code">{x.code}</td>
                    <td className="mute">{x.location}</td>
                    <td>{x.by}</td>
                    <td className="c"><Chip tone={RESULT_TONE[x.result]}>{x.result}</Chip></td>
                  </tr>
                ))}
                {props.scans.length === 0 && <tr><td colSpan={5}><div className="empty">스캔 이력이 없습니다</div></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card kicker="Differences" title="차이 항목 · 조정" pad={false}
          actions={
            <button className="btn sm pri" disabled={pending || pendingDiffs.length === 0}
              onClick={() => startTransition(() => raiseAdjustment(props.roundId))}>
              조정 결재 상신 ({pendingDiffs.length})
            </button>
          }>
          <div className="tbl-wrap" style={{ maxHeight: 300 }}>
            <table className="tbl">
              <thead><tr><th>구분</th><th>자산번호</th><th>대장</th><th>실사</th><th className="c">상태</th></tr></thead>
              <tbody>
                {props.diffs.map((d) => (
                  <tr key={d.id}>
                    <td><Chip tone={DIFF_TONE[d.kind]} bare>{d.kind}</Chip></td>
                    <td className="code">{d.assetNo}</td>
                    <td className="mute">{d.expected}</td>
                    <td className="strong">{d.actual}</td>
                    <td className="c">
                      <Chip tone={d.status === '조정 완료' ? 'ok' : d.status === '조정 상신' ? 'info' : 'err'}>
                        {d.status}{d.resolution ? ` · ${d.resolution}` : ''}
                      </Chip>
                    </td>
                  </tr>
                ))}
                {props.diffs.length === 0 && <tr><td colSpan={5}><div className="empty">차이 항목이 없습니다</div></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="callout" style={{ margin: 14 }}>
            <b>조정 결재 후 반영.</b> 상신된 차이는 결재 승인 시 대장에 자동 반영됩니다 — 위치·상태 불일치는
            대장 보정, 실사 미확인은 유휴 편성(분실 후보), 대장 미등록은 신규 등록 대상으로 처리됩니다.
          </div>
        </Card>
      </div>
    </>
  )
}
