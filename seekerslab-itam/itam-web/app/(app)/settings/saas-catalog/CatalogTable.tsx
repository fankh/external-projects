'use client'
import { useTransition } from 'react'
import { Chip } from '@/components/ui'
import type { SaasCatalogEntry } from '@/lib/types'
import { decideSaas } from '../actions'

const TONE = { 인가: 'ok', 차단: 'err', 검토중: 'warn' } as const
const GRADE_TONE = { 일반: 'neutral', 민감: 'warn', 기밀: 'err' } as const

export function CatalogTable({ entries }: { entries: SaasCatalogEntry[] }) {
  const [pending, startTransition] = useTransition()

  return (
    <>
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
              <td className="c"><Chip tone={GRADE_TONE[e.dataGrade]} bare>{e.dataGrade}</Chip></td>
              <td className="c"><Chip tone={TONE[e.status]}>{e.status}</Chip></td>
              <td className="mute tnum">{e.decidedAt ? `${e.decidedAt} · ${e.decidedBy}` : '-'}</td>
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
