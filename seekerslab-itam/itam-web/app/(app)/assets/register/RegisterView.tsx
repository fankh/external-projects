'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { ASSET_CATEGORIES } from '@/lib/types'
import type { Asset, AssetCategory, AssetStatus } from '@/lib/types'
import { extendLoan, extendWarranty, extendWarrantyMany, loanAsset, recordConfigChange, recoverAsset, reportLostStolen, returnLoan, type ConfigField } from './actions'

/** today(YYYY-MM-DD) 기준 dueDate 까지 남은 일수 — 서버가 준 today prop 으로만 계산해 하이드레이션 불일치를 피한다 */
function daysBetween(today: string, dueDate: string): number {
  return Math.round((new Date(dueDate).getTime() - new Date(today).getTime()) / 86_400_000)
}

/** 조회 필터의 유형 목록 — 공통코드 ASSET_CATEGORY 의 '사용' 여부와 무관하게 전부 노출한다.
 *  미사용 처리는 **신규 입력**에서만 제외하는 규칙이고(환경설정 › 공통코드 안내 참조), 이미 그
 *  유형으로 등록된 자산은 계속 조회돼야 하기 때문이다. 실사 위치 드롭다운처럼 값을 새로
 *  기록하는 입력 항목은 반대로 활성 코드만 읽는다. */
const VIEWS_KEY = 'itam-register-views'
type SavedView = { name: string; q: string; cat: string; status: string; staleOnly: boolean; warrantyOnly: boolean }
const CATS: (AssetCategory | '전체')[] = ['전체', '단말', '서버', '네트워크', '주변기기', 'SW', '가상자원']
const STATUSES: (AssetStatus | '전체')[] = ['전체', '검수중', '사용중', '유휴', '대여중', '반납대기', '수리중', '분실', '폐기예정', '폐기완료']
const STATUS_TONE: Record<AssetStatus, 'ok' | 'warn' | 'err' | 'info' | 'neutral'> = {
  검수중: 'info', 사용중: 'ok', 유휴: 'neutral', 대여중: 'info', 반납대기: 'warn', 수리중: 'warn', 분실: 'err', 폐기예정: 'err', 폐기완료: 'neutral',
}

export function RegisterView(props: { assets: Asset[]; initialQuery: string; canEdit: boolean; canConfig: boolean; canExport?: boolean; initialSel?: string; staleNos?: string[]; warrantyNos?: string[]; initialWarranty?: boolean; today?: string; initialCat?: string; initialStatus?: string }) {
  const [q, setQ] = useState(props.initialQuery)
  // 재고 화면 등에서 ?cat=·?status= 로 진입하면 해당 필터로 시작한다(집계 → 대장 드릴다운)
  const [cat, setCat] = useState<AssetCategory | '전체'>(CATS.includes(props.initialCat as AssetCategory | '전체') ? (props.initialCat as AssetCategory) : '전체')
  const [status, setStatus] = useState<AssetStatus | '전체'>(STATUSES.includes(props.initialStatus as AssetStatus | '전체') ? (props.initialStatus as AssetStatus) : '전체')
  const [staleOnly, setStaleOnly] = useState(false)
  const [warrantyOnly, setWarrantyOnly] = useState(Boolean(props.initialWarranty))
  // 저장된 뷰 — 자주 쓰는 필터 조합을 이름 붙여 localStorage 에 보관(MDI 탭과 같은 방식). 개인화·반복 워크플로.
  const [views, setViews] = useState<SavedView[]>([])
  const [naming, setNaming] = useState(false)
  const [viewName, setViewName] = useState('')
  useEffect(() => {
    try { const raw = localStorage.getItem(VIEWS_KEY); if (raw) setViews(JSON.parse(raw)) } catch { /* 무시 */ }
  }, [])
  const persistViews = (next: SavedView[]) => {
    setViews(next)
    try { localStorage.setItem(VIEWS_KEY, JSON.stringify(next)) } catch { /* quota */ }
  }
  const applyView = (v: SavedView) => {
    setQ(v.q); setCat(v.cat as AssetCategory | '전체'); setStatus(v.status as AssetStatus | '전체')
    setStaleOnly(v.staleOnly); setWarrantyOnly(v.warrantyOnly)
  }
  const saveCurrentView = () => {
    const name = viewName.trim()
    if (!name) return
    const v: SavedView = { name, q, cat, status, staleOnly, warrantyOnly }
    persistViews([...views.filter((x) => x.name !== name), v])
    setNaming(false); setViewName('')
  }
  const removeView = (name: string) => persistViews(views.filter((x) => x.name !== name))
  const filterActive = q.trim() !== '' || cat !== '전체' || status !== '전체' || staleOnly || warrantyOnly
  const staleSet = useMemo(() => new Set(props.staleNos ?? []), [props.staleNos])
  const warrantySet = useMemo(() => new Set(props.warrantyNos ?? []), [props.warrantyNos])
  const [selNo, setSelNo] = useState<string | null>(props.initialSel ?? null)
  const [cfgOpen, setCfgOpen] = useState(false)
  const [cfgField, setCfgField] = useState<ConfigField>('memory')
  const [cfgValue, setCfgValue] = useState('')
  const [cfgNote, setCfgNote] = useState('')
  const [cfgMsg, setCfgMsg] = useState<string | null>(null)
  const [wtyOpen, setWtyOpen] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const [lostType, setLostType] = useState<'분실' | '도난'>('분실')
  const [lostNote, setLostNote] = useState('')
  const [lostMsg, setLostMsg] = useState<string | null>(null)
  const [loanOpen, setLoanOpen] = useState(false)
  const [loanTo, setLoanTo] = useState('')
  const [loanDept, setLoanDept] = useState('')
  const [loanDue, setLoanDue] = useState('')
  const [loanMsg, setLoanMsg] = useState<string | null>(null)
  const [extendOpen, setExtendOpen] = useState(false)
  const [extendDate, setExtendDate] = useState('')
  // 보증 일괄 연장 — 필터로 좁힌 자산 다수 선택 (보증 있는 운영 자산만 대상)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return props.assets.filter((a) => {
      if (cat !== '전체' && a.category !== cat) return false
      if (status !== '전체' && a.status !== status) return false
      if (staleOnly && !staleSet.has(a.assetNo)) return false
      if (warrantyOnly && !warrantySet.has(a.assetNo)) return false
      if (!needle) return true
      return [a.assetNo, a.model, a.owner, a.dept, a.ip, a.serial, a.location, a.contractId]
        .some((f) => f?.toLowerCase().includes(needle))
    })
  }, [props.assets, q, cat, status, staleOnly, staleSet, warrantyOnly, warrantySet])

  const sel = props.assets.find((a) => a.assetNo === selNo) ?? null

  // 다중 선택 — 보증 일괄 연장·선택 내보내기 공용. 현재 필터의 모든 행을 선택할 수 있다
  // (보증 연장은 보증 없는 SW·가상자원·폐기 자산을 서버에서 건너뛴다).
  const allChecked = rows.length > 0 && rows.every((a) => checked.has(a.assetNo))
  const toggleOne = (no: string) => setChecked((p) => { const n = new Set(p); n.has(no) ? n.delete(no) : n.add(no); return n })
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(rows.map((a) => a.assetNo)))
  const bulkExtend = (yrs: number) => startTransition(async () => {
    const r = await extendWarrantyMany([...checked], yrs)
    setBulkMsg(r.message)
    if (r.ok) setChecked(new Set())
  })
  const exportHref = `/api/export/assets?nos=${encodeURIComponent([...checked].join(','))}`

  // 상태별 보유 대수 — 대장 구성을 한눈에 보고 클릭으로 해당 상태만 필터한다
  const statusCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of props.assets) m.set(a.status, (m.get(a.status) ?? 0) + 1)
    return m
  }, [props.assets])
  const pill = (active: boolean) => ({
    fontFamily: 'inherit' as const, fontSize: 11.5, padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent-deep)' : 'var(--line)'}`,
    background: active ? 'var(--accent-soft)' : '#fff',
    color: active ? 'var(--accent-deep)' : 'var(--ink-2)', fontWeight: active ? 700 : 500,
  })

  return (
    <div>
      <div className="qbar" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <input className="input" style={{ width: 260 }} placeholder="자산번호 · 모델 · 소유자 · IP 검색"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {CATS.map((c) => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as AssetStatus | '전체')}
          title="자산 상태로 필터">
          {STATUSES.map((st) => <option key={st} value={st}>{st === '전체' ? '상태 — 전체' : st}</option>)}
        </select>
        {staleSet.size > 0 && (
          <button className={`btn sm ${staleOnly ? 'danger' : ''}`} onClick={() => setStaleOnly((v) => !v)}
            title={`최근 실측이 ${'없거나 오래된'} 자산 — 유령 자산 후보`}>
            {staleOnly ? '✓ ' : ''}장기 미실측 {staleSet.size}
          </button>
        )}
        {warrantySet.size > 0 && (
          <button className={`btn sm ${warrantyOnly ? 'warn' : ''}`} onClick={() => setWarrantyOnly((v) => !v)}
            title="보증이 90일 이내 만료·경과한 자산 — 보증 연장·교체 검토 대상">
            {warrantyOnly ? '✓ ' : ''}보증 임박 {warrantySet.size}
          </button>
        )}
        <span className="cnt">{rows.length}건 / 전체 {props.assets.length}건</span>
        {props.canExport && (
          <a className="btn sm" style={{ marginLeft: 'auto' }} download
            href={`/api/export/assets?${new URLSearchParams({ q: q.trim(), cat, status, ...(staleOnly ? { stale: '1' } : {}), ...(warrantyOnly ? { warranty: '1' } : {}) }).toString()}`}>
            ⤓ 자산 대장 엑셀{filterActive ? ` (${rows.length})` : ''}
          </a>
        )}
      </div>

      {(views.length > 0 || filterActive) && (
        <div className="hstack" style={{ gap: 6, padding: '8px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="kicker mute" style={{ marginRight: 2 }}>저장된 뷰</span>
          {views.length === 0 && <span className="mut" style={{ fontSize: 12 }}>없음</span>}
          {views.map((v) => (
            <span key={v.name} className="chip-view hstack" style={{ gap: 4, padding: '2px 4px 2px 9px', border: '1px solid var(--line-strong)', borderRadius: 14, fontSize: 12 }}>
              <button style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', color: 'var(--accent-deep)', padding: 0 }}
                onClick={() => applyView(v)} title="이 뷰의 필터 적용">{v.name}</button>
              <button aria-label={`${v.name} 뷰 삭제`} title="뷰 삭제"
                style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--mut)', fontSize: 13, lineHeight: 1, padding: '0 2px' }}
                onClick={() => removeView(v.name)}>×</button>
            </span>
          ))}
          {naming ? (
            <span className="hstack" style={{ gap: 4 }}>
              <input className="input" style={{ width: 150, height: 26 }} autoFocus placeholder="뷰 이름 (예: 보증 임박 서버)"
                value={viewName} onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && viewName.trim()) saveCurrentView(); if (e.key === 'Escape') { setNaming(false); setViewName('') } }} />
              <button className="btn sm pri" disabled={!viewName.trim()} onClick={saveCurrentView}>저장</button>
              <button className="btn sm ghost" onClick={() => { setNaming(false); setViewName('') }}>취소</button>
            </span>
          ) : (
            filterActive && <button className="btn sm" onClick={() => setNaming(true)} title="현재 필터 조합을 이름 붙여 저장">＋ 현재 필터 저장</button>
          )}
        </div>
      )}

      <div className="hstack" style={{ gap: 6, padding: '8px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="kicker mute" style={{ marginRight: 2 }}>상태 요약</span>
        <button style={pill(status === '전체')} onClick={() => setStatus('전체')}>전체 {props.assets.length}</button>
        {STATUSES.filter((st) => st !== '전체' && (statusCounts.get(st) ?? 0) > 0).map((st) => (
          <button key={st} style={pill(status === st)} onClick={() => setStatus(status === st ? '전체' : st)}>
            {st} {statusCounts.get(st)}
          </button>
        ))}
      </div>

      {props.canEdit && (bulkMsg || checked.size > 0) && (
        <div className="callout" style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {checked.size > 0 ? (
            <>
              <b>선택 {checked.size}건</b>
              <span className="hstack" style={{ gap: 6 }}>
                <span className="mut" style={{ fontSize: 12 }}>보증 일괄 연장</span>
                {[1, 2, 3].map((y) => (
                  <button key={y} className="btn sm pri" disabled={pending} onClick={() => bulkExtend(y)}>{y}년</button>
                ))}
              </span>
              {props.canExport && <a className="btn sm" href={exportHref} download>⤓ 선택 {checked.size}건 내보내기</a>}
              <a className="btn sm" href={`/api/labels?nos=${encodeURIComponent([...checked].join(','))}`} target="_blank" rel="noopener">🏷 선택 라벨 인쇄</a>
              <button className="btn sm ghost" disabled={pending} onClick={() => setChecked(new Set())}>선택 해제</button>
            </>
          ) : null}
          {bulkMsg && <span className="mut" style={{ fontSize: 12 }}>{bulkMsg}</span>}
        </div>
      )}

      <div className={sel ? 'cols main-side' : ''} style={sel ? { gap: 0 } : undefined}>
        <div className="tbl-wrap fill">
          <table className="tbl">
            <thead>
              <tr>
                {props.canEdit && <th className="c" style={{ width: 32 }}>
                  <input type="checkbox" checked={allChecked} disabled={rows.length === 0}
                    onChange={toggleAll} title="현재 필터의 자산 전체 선택 (보증 연장·선택 내보내기)" aria-label="전체 선택" />
                </th>}
                <th>자산번호</th><th>유형</th><th>모델</th><th>소유자</th><th>부서</th>
                <th>위치</th><th>IP</th><th className="c">상태</th><th>보증 만료</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.assetNo} className={`clickable ${selNo === a.assetNo ? 'sel' : ''}`}
                  onClick={() => setSelNo(selNo === a.assetNo ? null : a.assetNo)}>
                  {props.canEdit && <td className="c" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={checked.has(a.assetNo)} onChange={() => toggleOne(a.assetNo)} aria-label={`${a.assetNo} 선택`} />
                  </td>}
                  <td className="code">{a.assetNo}</td>
                  <td>{a.category}</td>
                  <td className="strong">{a.model}</td>
                  <td>{a.owner}</td>
                  <td className="mute">{a.dept}</td>
                  <td className="mute">{a.location}</td>
                  <td className="tnum">{a.ip ?? '-'}</td>
                  <td className="c"><Chip tone={STATUS_TONE[a.status]}>{a.status}</Chip></td>
                  <td className="tnum">{a.warrantyEnd}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={props.canEdit ? 10 : 9}><div className="empty">조건에 맞는 자산이 없습니다</div></td></tr>}
            </tbody>
          </table>
        </div>

        {sel && (
          <aside className="side-fill">
            <div className="hstack" style={{ justifyContent: 'space-between', gap: 8 }}>
              <div className="kicker mute">Asset Detail</div>
              <a className="btn sm" href={`/api/asset-card/${sel.assetNo}`} target="_blank" rel="noopener" title="자산 전체 정보·이력 인쇄용 카드(dossier)">🖨 자산 카드</a>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, margin: '4px 0 2px' }}>{sel.model}</div>
            <div className="mono" style={{ color: 'var(--accent-deep)', fontSize: 12 }}>{sel.assetNo}</div>
            {sel.discoveredVia && (
              <div className="callout" style={{ margin: '10px 0 0', padding: '8px 11px' }}>
                Discovery 편입 자산 — 최초 발견 채널: <b>{sel.discoveredVia}</b>
              </div>
            )}
            <dl className="kv" style={{ marginTop: 14 }}>
              <dt>상태</dt><dd><Chip tone={STATUS_TONE[sel.status]}>{sel.status}</Chip></dd>
              <dt>소유자</dt><dd>{sel.owner} · {sel.dept}</dd>
              <dt>위치</dt><dd>{sel.location}</dd>
              <dt>시리얼</dt><dd className="code">{sel.serial}</dd>
              {sel.os && <><dt>OS</dt><dd>{sel.os}</dd></>}
              {sel.cpu && <><dt>CPU</dt><dd>{sel.cpu}</dd></>}
              {sel.memory && <><dt>메모리</dt><dd>{sel.memory}</dd></>}
              {sel.ip && <><dt>IP / MAC</dt><dd className="code">{sel.ip}{sel.mac ? ` · ${sel.mac}` : ''}</dd></>}
              <dt>도입일</dt><dd className="tnum">{sel.purchaseDate}</dd>
              {sel.status === '대여중' && (
                <>
                  <dt>반환 기한</dt>
                  <dd className="hstack" style={{ gap: 6 }}>
                    <span className="tnum">{sel.loanDueDate ?? '-'}</span>
                    {props.today && sel.loanDueDate && (
                      sel.loanDueDate < props.today
                        ? <Chip tone="err" bare>연체</Chip>
                        : daysBetween(props.today, sel.loanDueDate) <= 7
                          ? <Chip tone="warn" bare>반환 임박 D-{daysBetween(props.today, sel.loanDueDate)}</Chip>
                          : null
                    )}
                  </dd>
                </>
              )}
              {sel.status === '수리중' && (
                <>
                  <dt>수리 의뢰</dt>
                  <dd className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {sel.repair ? (
                      <>
                        <span className="strong">{sel.repair.vendor}</span>
                        {sel.repair.eta && <span className="tnum dim">예상반환 {sel.repair.eta}</span>}
                        {props.today && sel.repair.eta && sel.repair.eta < props.today && <Chip tone="err" bare>반환 지연</Chip>}
                        {sel.repair.estCost ? <span className="dim">· 견적 {sel.repair.estCost.toLocaleString()}원</span> : null}
                      </>
                    ) : <Chip tone="warn" bare>수리 의뢰 전</Chip>}
                  </dd>
                </>
              )}
              <dt>최근 실측</dt>
              <dd className="hstack" style={{ gap: 6 }}>
                <span className="tnum">{sel.lastVerifiedAt ?? '미실측'}</span>
                {staleSet.has(sel.assetNo) && <Chip tone="err" bare>장기 미실측</Chip>}
              </dd>
              <dt>보증 만료</dt><dd className="tnum">{sel.warrantyEnd}</dd>
              {sel.contractId && <><dt>연계 계약</dt><dd className="code"><a href={`/inventory/contracts?sel=${encodeURIComponent(sel.contractId)}`} title="계약 상세로 이동" style={{ color: 'var(--accent-deep)' }}>{sel.contractId}</a></dd></>}
            </dl>

            {(() => {
              // 연관 자산 — 같은 계약·위치·소유자·모델을 공유하는 다른 자산 수(영향도 분석용). 스코프된 대장 기준.
              const others = props.assets.filter((a) => a.assetNo !== sel.assetNo)
              const links: { label: string; count: number; q: string }[] = [
                sel.contractId ? { label: '같은 계약', count: others.filter((a) => a.contractId === sel.contractId).length, q: sel.contractId } : null,
                { label: '같은 위치', count: others.filter((a) => a.location === sel.location).length, q: sel.location },
                { label: '같은 소유자', count: others.filter((a) => a.owner === sel.owner).length, q: sel.owner },
                { label: '같은 모델', count: others.filter((a) => a.model === sel.model).length, q: sel.model },
              ].filter((x): x is { label: string; count: number; q: string } => x !== null && x.count > 0)
              if (links.length === 0) return null
              return (
                <>
                  <div className="kicker mute" style={{ margin: '18px 0 8px' }}>연관 자산 <span className="mut" style={{ textTransform: 'none', letterSpacing: 0 }}>· 영향도</span></div>
                  <div className="vstack" style={{ gap: 5 }}>
                    {links.map((l) => (
                      <a key={l.label} href={`/assets/register?q=${encodeURIComponent(l.q)}`} className="hstack"
                        style={{ justifyContent: 'space-between', gap: 10, color: 'inherit', textDecoration: 'none', fontSize: 12.5 }}
                        title={`${l.q} — ${l.label} 자산 보기`}>
                        <span className="mute">{l.label}</span>
                        <span className="hstack" style={{ gap: 5 }}>
                          <span className="tnum strong" style={{ color: 'var(--accent-deep)' }}>{l.count}대</span>
                          <span className="mut">→</span>
                        </span>
                      </a>
                    ))}
                  </div>
                </>
              )
            })()}

            <div className="kicker mute" style={{ margin: '18px 0 10px' }}>변경 이력 타임라인</div>
            <div className="tl">
              {[...sel.history].reverse().map((h, i) => (
                <div className="ev" key={i}>
                  <div className="d">{h.date} · {h.actor}</div>
                  <div className="t">{h.kind}</div>
                  <div className="x">{h.detail}</div>
                </div>
              ))}
            </div>

            {props.canEdit && (
              <div className="hstack" style={{ marginTop: 16 }}>
                <a className="btn sm" href={`/api/label/${sel.assetNo}`} target="_blank" rel="noopener">라벨 인쇄</a>
                <Link className="btn sm" href="/assets/intake">라벨 · 검수</Link>
                <Link className="btn sm" href="/assets/movement">이동 처리</Link>
                <Link className="btn sm danger" href="/assets/disposal">폐기 처리</Link>
              </div>
            )}

            {props.canEdit && sel.status === '분실' && (
              <div style={{ marginTop: 12 }}>
                {lostMsg && <div className="callout" style={{ marginBottom: 10 }}>{lostMsg}</div>}
                <div className="callout warn" style={{ marginBottom: 10, padding: '8px 11px' }}>
                  분실·도난 신고된 자산입니다 — 회수 시 유휴 풀로 복귀, 미회수 확정 시 <Link href="/assets/disposal">폐기 처리</Link>로 넘깁니다.
                </div>
                <button className="btn sm pri" disabled={pending}
                  onClick={() => startTransition(async () => {
                    const r = await recoverAsset(sel.assetNo, '')
                    setLostMsg(r.message)
                  })}>회수 (실물 확보)</button>
              </div>
            )}

            {props.canEdit && sel.status !== '분실' && sel.status !== '폐기예정' && sel.status !== '폐기완료' && (
              <div style={{ marginTop: 12 }}>
                {lostMsg && <div className="callout" style={{ marginBottom: 10 }}>{lostMsg}</div>}
                {!lostOpen ? (
                  <button className="btn sm danger" disabled={pending}
                    onClick={() => { setLostOpen(true); setLostType('분실'); setLostNote(''); setLostMsg(null) }}
                    title="실물이 사라진 자산을 분실·도난으로 신고">분실 · 도난 신고</button>
                ) : (
                  <div className="vstack" style={{ gap: 8 }}>
                    <div className="kicker mute">분실 · 도난 신고</div>
                    <select className="select" value={lostType} disabled={pending}
                      onChange={(e) => setLostType(e.target.value as '분실' | '도난')}>
                      <option value="분실">분실 (소재 불명)</option>
                      <option value="도난">도난 (탈취 — 데이터 유출 위험)</option>
                    </select>
                    <input className="input" placeholder="정황 (마지막 확인 위치·경위)" value={lostNote} disabled={pending}
                      onChange={(e) => setLostNote(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && lostNote.trim()) { e.currentTarget.blur() } }} />
                    <div className="hstack">
                      <button className="btn sm danger" disabled={pending || !lostNote.trim()}
                        onClick={() => startTransition(async () => {
                          const r = await reportLostStolen(sel.assetNo, lostType, lostNote)
                          setLostMsg(r.message)
                          if (r.ok) { setLostOpen(false); setLostNote('') }
                        })}>신고 확정</button>
                      <button className="btn sm ghost" disabled={pending} onClick={() => { setLostOpen(false); setLostMsg(null) }}>취소</button>
                    </div>
                    {lostType === '도난' && <span className="mut" style={{ fontSize: 11 }}>도난 신고 시 보안운영팀에 데이터 유출 위험 점검이 통보됩니다.</span>}
                  </div>
                )}
              </div>
            )}

            {props.canEdit && sel.status === '유휴' && (
              <div style={{ marginTop: 12 }}>
                {loanMsg && <div className="callout" style={{ marginBottom: 10 }}>{loanMsg}</div>}
                {!loanOpen ? (
                  <button className="btn sm" disabled={pending}
                    onClick={() => { setLoanOpen(true); setLoanTo(''); setLoanDept(''); setLoanDue(''); setLoanMsg(null) }}
                    title="유휴 재고를 반환 기한과 함께 임시 대여(반출)">대여 처리 (반출)</button>
                ) : (
                  <div className="vstack" style={{ gap: 8 }}>
                    <div className="kicker mute">대여 처리 (반출)</div>
                    <input className="input" placeholder="대여자 (성명)" value={loanTo} disabled={pending} onChange={(e) => setLoanTo(e.target.value)} />
                    <input className="input" placeholder="부서" value={loanDept} disabled={pending} onChange={(e) => setLoanDept(e.target.value)} />
                    <label className="hstack" style={{ gap: 6, fontSize: 12 }}>반환 기한
                      <input className="input" type="date" value={loanDue} disabled={pending} onChange={(e) => setLoanDue(e.target.value)} />
                    </label>
                    <div className="hstack">
                      <button className="btn sm pri" disabled={pending || !loanTo.trim() || !loanDept.trim() || !loanDue}
                        onClick={() => startTransition(async () => {
                          const r = await loanAsset(sel.assetNo, loanTo, loanDept, loanDue)
                          setLoanMsg(r.message)
                          if (r.ok) setLoanOpen(false)
                        })}>대여 확정</button>
                      <button className="btn sm ghost" disabled={pending} onClick={() => { setLoanOpen(false); setLoanMsg(null) }}>취소</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {props.canEdit && sel.status === '대여중' && (
              <div style={{ marginTop: 12 }}>
                {loanMsg && <div className="callout" style={{ marginBottom: 10 }}>{loanMsg}</div>}
                <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn sm pri" disabled={pending}
                    onClick={() => startTransition(async () => {
                      const r = await returnLoan(sel.assetNo)
                      setLoanMsg(r.message)
                    })}>대여 반환 접수</button>
                  {!extendOpen ? (
                    <button className="btn sm" disabled={pending}
                      onClick={() => { setExtendOpen(true); setExtendDate(''); setLoanMsg(null) }}
                      title="반납 없이 반환 기한만 연장">반환 기한 연장</button>
                  ) : (
                    <span className="hstack" style={{ gap: 6 }}>
                      <input className="input" type="date" style={{ height: 28 }} value={extendDate}
                        min={sel.loanDueDate ?? props.today} disabled={pending} onChange={(e) => setExtendDate(e.target.value)} />
                      <button className="btn sm pri" disabled={pending || !extendDate}
                        onClick={() => startTransition(async () => {
                          const r = await extendLoan(sel.assetNo, extendDate)
                          setLoanMsg(r.message)
                          if (r.ok) setExtendOpen(false)
                        })}>연장 확정</button>
                      <button className="btn sm ghost" disabled={pending} onClick={() => { setExtendOpen(false); setLoanMsg(null) }}>취소</button>
                    </span>
                  )}
                </div>
              </div>
            )}

            {props.canConfig && (() => {
              const fields: { key: ConfigField; label: string; cur?: string }[] = [
                { key: '유형' as ConfigField, label: '유형(재분류)', cur: sel.category },
                ...(sel.os !== undefined ? [{ key: 'os' as ConfigField, label: 'OS', cur: sel.os }] : []),
                ...(sel.cpu !== undefined ? [{ key: 'cpu' as ConfigField, label: 'CPU', cur: sel.cpu }] : []),
                ...(sel.memory !== undefined ? [{ key: 'memory' as ConfigField, label: '메모리', cur: sel.memory }] : []),
                { key: '기타', label: '기타', cur: undefined },
              ]
              const openForm = () => {
                const first = fields[0]
                setCfgField(first.key); setCfgValue(first.cur ?? ''); setCfgNote(''); setCfgMsg(null); setCfgOpen(true)
              }
              const pickField = (k: ConfigField) => {
                setCfgField(k); setCfgValue(fields.find((f) => f.key === k)?.cur ?? '')
              }
              const submit = () => {
                startTransition(async () => {
                  const r = await recordConfigChange(sel.assetNo, cfgField, cfgValue, cfgNote)
                  setCfgMsg(r.message)
                  if (r.ok) { setCfgOpen(false); setCfgNote('') }
                })
              }
              return (
                <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  {cfgMsg && <div className="callout" style={{ marginBottom: 10 }}>{cfgMsg}</div>}
                  {!cfgOpen ? (
                    <button className="btn sm" disabled={pending} onClick={openForm}>구성변경 기록</button>
                  ) : (
                    <div className="vstack" style={{ gap: 8 }}>
                      <div className="kicker mute">구성변경 기록</div>
                      <select className="select" value={cfgField} disabled={pending}
                        onChange={(e) => pickField(e.target.value as ConfigField)}>
                        {fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.cur !== undefined ? ` · 현재 ${f.cur}` : ''}</option>)}
                      </select>
                      {cfgField === '유형' ? (
                        <select className="select" value={cfgValue} disabled={pending} onChange={(e) => setCfgValue(e.target.value)}
                          title="AI 자동분류 정정·용도 변경 — 유효 유형만 선택">
                          {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : cfgField !== '기타' ? (
                        <input className="input" placeholder="새 값 (예: 64GB)" value={cfgValue} disabled={pending}
                          onChange={(e) => setCfgValue(e.target.value)} />
                      ) : null}
                      <input className="input" placeholder={cfgField === '기타' ? '변경 내용 (예: SSD 512GB→1TB 교체)' : '사유 (선택)'}
                        value={cfgNote} disabled={pending} onChange={(e) => setCfgNote(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
                      <div className="hstack">
                        <button className="btn sm pri" disabled={pending} onClick={submit}>기록</button>
                        <button className="btn sm ghost" disabled={pending} onClick={() => { setCfgOpen(false); setCfgMsg(null) }}>취소</button>
                      </div>
                    </div>
                  )}
                  {sel.warrantyEnd !== '-' && (
                    <div style={{ marginTop: 10 }}>
                      {!wtyOpen ? (
                        <button className="btn sm" disabled={pending}
                          onClick={() => { setWtyOpen(true); setCfgMsg(null); setCfgOpen(false) }}
                          title="보증 만료일 연장 (1·2·3년)">보증 연장</button>
                      ) : (
                        <div className="vstack" style={{ gap: 8 }}>
                          <div className="kicker mute">보증 연장 · 현재 만료 {sel.warrantyEnd}</div>
                          <div className="hstack">
                            {[1, 2, 3].map((y) => (
                              <button key={y} className="btn sm pri" disabled={pending}
                                onClick={() => startTransition(async () => {
                                  const r = await extendWarranty(sel.assetNo, y)
                                  setCfgMsg(r.message); setWtyOpen(false)
                                })}>{y}년</button>
                            ))}
                            <button className="btn sm ghost" disabled={pending} onClick={() => setWtyOpen(false)}>취소</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </aside>
        )}
      </div>
    </div>
  )
}
