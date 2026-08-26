'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import type { SaasCatalogEntry } from '@/lib/types'
import { addSaasCatalogEntry, decideSaas, setSaasDataGrade } from '../actions'

const TONE = { 인가: 'ok', 차단: 'err', 검토중: 'warn' } as const
const GRADES: SaasCatalogEntry['dataGrade'][] = ['일반', '민감', '기밀']

/** 검토 경과일 — 접수일(reviewSince) 대비 기준일. YYYY-MM-DD 파싱으로 결정적 계산(Date.now 미사용) */
function reviewAge(reviewSince: string | undefined, today: string): number | null {
  if (!reviewSince) return null
  return Math.floor((Date.parse(today) - Date.parse(reviewSince)) / 86_400_000)
}

export function CatalogTable({ entries, today, slaDays, approveNeedsApproval, reviewOnly: reviewOnlyParam, overdueIds, overdueOnly: overdueOnlyParam, canExport = false }: {
  entries: SaasCatalogEntry[]; today: string; slaDays: number; approveNeedsApproval?: boolean; reviewOnly?: boolean
  /** 판정 기한 경과 항목 id — 대시보드 큐·에스컬레이션 안내와 같은 lib/saas-review 판정(서버 산출).
   *  화면이 경과일을 다시 재면 접수일(reviewSince)이 없는 항목에서 갈린다: 그 경우 lib 은 fail safe 로 경과로 보는데
   *  화면은 배지 자체를 안 그려, 가장 오래 방치됐을 법한 건이 표에서만 정상으로 보였다. */
  overdueIds?: string[]
  /** 대시보드 '판정 기한 경과' 큐의 드릴다운으로 진입할 때 그 필터를 켠 채 연다 (?status=overdue) */
  overdueOnly?: boolean
  canExport?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  // 검토 대기만 보기 — 대시보드 '미판정 SaaS' 큐의 드릴다운. 판정이 끝난 인가·차단 항목까지 함께 쌓이는
  //  대장이라, 큐가 말한 건수를 화면에서 다시 세어야 했다. 큐 링크는 이 필터를 켠 채 화면을 연다.
  const [reviewOnly, setReviewOnly] = useState(Boolean(reviewOnlyParam))
  // 기한 경과만 보기 — 검토 대기(위 필터)보다 좁은 집합이다. 에스컬레이션 안내가 대상 서비스명을 나열하긴 했지만
  //  표를 그 집합으로 좁힐 수단이 없어, 큐가 말한 건을 대장에서 눈으로 골라야 했다.
  const overdueSet = new Set(overdueIds ?? [])
  const [overdueOnly, setOverdueOnly] = useState(Boolean(overdueOnlyParam) && overdueSet.size > 0)
  const reviewCount = entries.filter((e) => e.status === '검토중').length
  const shown = overdueOnly ? entries.filter((e) => overdueSet.has(e.id))
    : reviewOnly ? entries.filter((e) => e.status === '검토중')
    : entries
  // 반출 범위 — 파일 첫 시트와 감사 기록에 그대로 적힌다(부분 반출을 전체 대장으로 착각하지 않게)
  const cFilterActive = overdueOnly || reviewOnly
  const cScope = overdueOnly ? '판정 기한 경과만' : reviewOnly ? '검토 대기만' : ''
  // 신규 SaaS 등록 — 발견 이전이라도 조달·온보딩으로 알게 된 서비스를 검토중으로 카탈로그에 올린다
  const [adding, setAdding] = useState(false)
  const [service, setService] = useState('')
  const [category, setCategory] = useState('')
  const [vendor, setVendor] = useState('')
  const [owner, setOwner] = useState('')
  const [grade, setGrade] = useState<SaasCatalogEntry['dataGrade']>('일반')
  const add = () => startTransition(async () => {
    const r = await addSaasCatalogEntry({ service, category, vendor, owner, dataGrade: grade })
    setMsg(r.message)
    if (r.ok) { setService(''); setCategory(''); setVendor(''); setOwner(''); setGrade('일반'); setAdding(false) }
  })

  return (
    <>
    <div className="hstack" style={{ justifyContent: 'flex-end', padding: '10px 14px 0' }}>
      <button className="btn sm pri" disabled={pending} onClick={() => { setAdding((v) => !v); setMsg(null) }}
        title="발견 이전이라도 조달·벤더 온보딩으로 알게 된 SaaS 를 검토중으로 카탈로그에 등재">{adding ? '취소' : '+ SaaS 등록'}</button>
    </div>
    {adding && (
      <div className="vstack" style={{ gap: 8, margin: 14, padding: 12, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--canvas)' }}>
        <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: 2, minWidth: 160 }} placeholder="서비스명 (필수)" value={service} disabled={pending} onChange={(e) => setService(e.target.value)} />
          <input className="input" style={{ flex: 1, minWidth: 110 }} placeholder="분류" value={category} disabled={pending} onChange={(e) => setCategory(e.target.value)} />
          <input className="input" style={{ flex: 1, minWidth: 110 }} placeholder="공급사" value={vendor} disabled={pending} onChange={(e) => setVendor(e.target.value)} />
          <input className="input" style={{ flex: 1, minWidth: 120 }} placeholder="주 사용 부서" value={owner} disabled={pending} onChange={(e) => setOwner(e.target.value)} />
          <span className="seg" style={{ transform: 'scale(.9)' }} title="데이터 민감도 등급">
            {GRADES.map((g) => (
              <button key={g} className={grade === g ? 'on' : ''} disabled={pending} onClick={() => setGrade(g)}>{g}</button>
            ))}
          </span>
          <button className="btn sm pri" disabled={pending || !service.trim()} onClick={add}>검토중으로 등재</button>
        </div>
        <span className="dim" style={{ fontSize: 11.5 }}>등재 시 <b>검토중</b>으로 접수돼 판정 기한(SLA)·에스컬레이션 대상이 됩니다. 분류·공급사·부서는 비우면 기본값(기타·-·본인 부서)으로 채워집니다.</span>
      </div>
    )}
    {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
    <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
      <button className={`btn sm ${reviewOnly ? 'pri' : 'ghost'}`} onClick={() => { setReviewOnly((r) => !r); setOverdueOnly(false) }}
        title="아직 인가·차단 판정이 나지 않은 항목만 — 대시보드 미판정 SaaS 큐와 같은 집합">
        {reviewOnly ? '✓ ' : ''}검토 대기만 {reviewCount}
      </button>
      {overdueSet.size > 0 && (
        <button className={`btn sm ${overdueOnly ? 'err' : 'ghost'}`} onClick={() => { setOverdueOnly((v) => !v); setReviewOnly(false) }}
          title={`접수 후 ${slaDays}일이 지나도 판정이 안 난 항목만 — 대시보드 판정 기한 경과 큐와 같은 집합`}>
          {overdueOnly ? '✓ ' : ''}기한 경과만 {overdueSet.size}
        </button>
      )}
      <span className="mut" style={{ fontSize: 12 }}>{shown.length} / {entries.length}건</span>
      {/* 반출은 화면에 보이는 그 집합 — 기한 경과만 골라 놓고 내려받은 파일이 전체 대장이면 다른 문서가 된다 */}
      {canExport && (
        <a className="btn sm" style={{ marginLeft: 'auto' }} download
          href={cFilterActive ? `/api/export/saasCatalog?${new URLSearchParams({ ids: shown.map((x) => x.id).join(','), scope: cScope }).toString()}` : '/api/export/saasCatalog'}>
          ⤓ SaaS 정책 대장 엑셀{cFilterActive ? ` (${shown.length})` : ''}
        </a>
      )}
    </div>
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>서비스</th><th>분류</th><th>공급사</th><th>주 사용 부서</th>
            <th className="c">데이터 등급</th><th className="c">현재 판정</th><th>판정 이력</th><th className="c">변경</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((e) => (
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
                {e.status === '검토중' ? (() => {
                  const age = e.reviewSince ? reviewAge(e.reviewSince, today) ?? 0 : null
                  // 경과 판정은 서버(lib/saas-review)가 준 집합을 쓴다 — 여기서 임계값을 다시 재면 큐와 갈린다.
                  const over = overdueSet.has(e.id)
                  return (
                    <span className="hstack" style={{ gap: 5, alignItems: 'baseline' }}>
                      <span>{age === null ? '접수일 미상' : `검토 ${age}일`}</span>
                      {over && <Chip tone="err" bare>기한 경과</Chip>}
                    </span>
                  )
                })() : e.decidedAt ? `${e.decidedAt} · ${e.decidedBy}` : '-'}
              </td>
              <td className="c">
                <span className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
                  {/* 판정 결과·거부 사유를 화면에 돌려준다 — 그전엔 액션이 아무것도 반환하지 않아 권한·중복 판정이 무반응으로 끝났다. */}
                  {approveNeedsApproval
                    ? <span className="mut" style={{ fontSize: 11 }}>인가는 필수 결재</span>
                    : <button className="btn sm pri" disabled={pending || e.status === '인가'}
                        onClick={() => startTransition(async () => setMsg((await decideSaas(e.id, '인가')).message))}>인가</button>}
                  <button className="btn sm danger" disabled={pending || e.status === '차단'}
                    onClick={() => startTransition(async () => setMsg((await decideSaas(e.id, '차단')).message))}>차단</button>
                  {/* 재검토 — 판정을 되돌리는 짝. 오판정(특히 차단)을 화면에서 되돌릴 길이 없어 한 방향 문이었다.
                      되돌리면 검토 기한(SLA)이 다시 시작되고, 차단이었다면 프록시·DNS 차단 해제 집행까지 요청한다. */}
                  {e.status !== '검토중' && (
                    <button className="btn sm ghost" disabled={pending}
                      title="판정을 되돌려 검토중으로 — 검토 기한이 다시 시작되고, 차단이었다면 차단 해제 집행을 요청합니다"
                      onClick={() => startTransition(async () => setMsg((await decideSaas(e.id, '검토중')).message))}>재검토</button>
                  )}
                </span>
              </td>
            </tr>
          ))}
          {shown.length === 0 && <tr><td colSpan={8}><div className="empty">{entries.length === 0 ? '등록된 SaaS 가 없습니다' : '필터에 맞는 항목이 없습니다 — 필터를 해제하면 전체가 보입니다'}</div></td></tr>}
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
