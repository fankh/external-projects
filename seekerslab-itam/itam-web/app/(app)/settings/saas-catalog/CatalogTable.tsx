'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import type { SaasCatalogEntry } from '@/lib/types'
import { decideSaas, setSaasDataGrade } from '../actions'

const TONE = { 인가: 'ok', 차단: 'err', 검토중: 'warn' } as const
const GRADES: SaasCatalogEntry['dataGrade'][] = ['일반', '민감', '기밀']

/** 검토 경과일 — 접수일(reviewSince) 대비 기준일. YYYY-MM-DD 파싱으로 결정적 계산(Date.now 미사용) */
function reviewAge(reviewSince: string | undefined, today: string): number | null {
  if (!reviewSince) return null
  return Math.floor((Date.parse(today) - Date.parse(reviewSince)) / 86_400_000)
}

export function CatalogTable({ entries, today, slaDays }: { entries: SaasCatalogEntry[]; today: string; slaDays: number }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <>
    {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>서비스</th><th>분류</th><th>공급사</th><th>주 사용 부서</th>
            <th className="c">데이터 등급</th><th className="c">현재 판정</th><th>판정 이력</th><th className="c">변경</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="strong">{e.service}</td>
              <td className="mute">{e.category}</td>
              <td className="mute">{e.vendor}</td>
              <td>{e.owner}</td>
              <td className="c">
                <span className="seg" style={{ transform: 'scale(.9)' }} title="데이터 민감도 등급 분류 — 차단 집행 우선순위·기밀 취급 집계 근거">
                  {GRADES.map((g) => (
                    <button key={g} className={e.dataGrade === g ? 'on' : ''} disabled={pending}
                      onClick={() => startTransition(async () => setMsg((await setSaasDataGrade(e.id, g)).message))}>{g}</button>
                  ))}
                </span>
              </td>
              <td className="c"><Chip tone={TONE[e.status]}>{e.status}</Chip></td>
              <td className="mute tnum">
                {e.status === '검토중' && e.reviewSince ? (() => {
                  const age = reviewAge(e.reviewSince, today) ?? 0
                  const over = age > slaDays
                  return (
                    <span className="hstack" style={{ gap: 5, alignItems: 'baseline' }}>
                      <span>검토 {age}일</span>
                      {over && <Chip tone="err" bare>기한 경과</Chip>}
                    </span>
                  )
                })() : e.decidedAt ? `${e.decidedAt} · ${e.decidedBy}` : '-'}
              </td>
              <td className="c">
                <span className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
                  <button className="btn sm pri" disabled={pending || e.status === '인가'}
                    onClick={() => startTransition(() => decideSaas(e.id, '인가'))}>인가</button>
                  <button className="btn sm danger" disabled={pending || e.status === '차단'}
                    onClick={() => startTransition(() => decideSaas(e.id, '차단'))}>차단</button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="callout" style={{ margin: 14 }}>
      <b>차단은 집행으로 이어집니다.</b> 서비스를 <b>차단</b>으로 판정하면 Shadow SaaS 미인가 집계에 반영되는 동시에
      보안운영팀에 <b>프록시·DNS 차단 집행 요청</b>이 통보되고(발송 이력 적재), 정책 변경은 감사 로그에 남습니다.
    </div>
    </>
  )
}
