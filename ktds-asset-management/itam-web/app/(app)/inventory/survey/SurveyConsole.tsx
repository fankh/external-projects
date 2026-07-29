'use client'
import { useRef, useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { SurveyDiff, SurveyScan } from '@/lib/types'
import { raiseAdjustment, scanAsset } from './actions'

/** 실사 대상 물리 위치 — 자산 대장의 위치 코드와 일치해야 오탐(허위 위치 불일치)이 없다.
 *  클라우드 리전(ap-northeast-2 등)은 물리 실사 대상이 아니므로 제외한다. */
const LOCATIONS = [
  '본사 8F', '본사 8F 통신실', '본사 3F 자산창고', '본사 3F 검수실', '본사 1F 로비',
  'IDC-A Rack 12', 'IDC-A Rack 20', 'IDC-A vCluster1', 'IDC-B Rack 3', '판교 사무소',
]

const RESULT_TONE = { 일치: 'ok', 차이: 'warn', '대장 미등록': 'err' } as const
const DIFF_TONE: Record<SurveyDiff['kind'], 'warn' | 'err' | 'neutral'> = {
  '위치 불일치': 'warn', '상태 불일치': 'warn', '미확인 (실사 없음)': 'neutral', '대장 미등록': 'err',
}

export function SurveyConsole(props: {
  roundId: string
  roundName: string
  scans: SurveyScan[]
  diffs: SurveyDiff[]
  assignee: string
  me: string
}) {
  const [code, setCode] = useState('')
  const [location, setLocation] = useState(LOCATIONS[0])
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

  return (
    <>
      <Card kicker="Scan" title="스캔 실사"
        actions={<span className="dim" style={{ fontSize: 11.5 }}>담당 {props.assignee} · 수행자 {props.me}</span>}>
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
              {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
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
