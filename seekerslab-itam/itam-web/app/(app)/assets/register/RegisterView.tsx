'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { ASSET_CATEGORIES, NON_OPERATIONAL_STATUSES } from '@/lib/types'
import type { Asset, AssetCategory, AssetStatus, BizCriticality } from '@/lib/types'
import { assetDataIssues } from '@/lib/quality'
import { contractHref } from '@/lib/reflink'
import { acquisitionCostOf, assetTco, bookValueOf, depreciationPct, repairTotalOf } from '@/lib/cost'
import { assetDependenciesFrom } from '@/lib/cmdb-graph'
import { TopologyDiagram } from './TopologyDiagram'
import { warrantyState } from '@/lib/dates'
import { selectForDisposal } from '@/app/(app)/assets/disposal/actions'
import { cancelFault, cancelLoanExtension, cancelMaintenanceSchedule, cancelReturnRequest, confirmReceipt, correctField, declineLoanExtension, extendLoan, extendWarranty, extendWarrantyMany, grantLoanExtension, loanAsset, loanAssetMany, notifyDependencyImpact, notifyEolUpgrade, reassignAsset, reassignAssetMany, recordConfigChange, recordMaintenance, recoverAsset, recoverFromUser, recoverManyFromUser, releaseQuarantine, remindMaintenance, remindReceipts, reportFault, reportLostStolen, requestLoanExtension, requestReturn, returnLoan, scheduleMaintenance, scheduleMaintenanceMany, setAssetContract, setAssetContractMany, setAssetCriticality, setAssetCriticalityMany, type ConfigField, type StewardField } from './actions'

/** today(YYYY-MM-DD) 기준 dueDate 까지 남은 일수 — 서버가 준 today prop 으로만 계산해 하이드레이션 불일치를 피한다 */
function daysBetween(today: string, dueDate: string): number {
  return Math.round((new Date(dueDate).getTime() - new Date(today).getTime()) / 86_400_000)
}

/** 조회 필터의 유형 목록 — 공통코드 ASSET_CATEGORY 의 '사용' 여부와 무관하게 전부 노출한다.
 *  미사용 처리는 **신규 입력**에서만 제외하는 규칙이고(환경설정 › 공통코드 안내 참조), 이미 그
 *  유형으로 등록된 자산은 계속 조회돼야 하기 때문이다. 실사 위치 드롭다운처럼 값을 새로
 *  기록하는 입력 항목은 반대로 활성 코드만 읽는다. */
const VIEWS_KEY = 'itam-register-views'
type SavedView = { name: string; q: string; cat: string; status: string; staleOnly: boolean; warrantyOnly: boolean; dqOnly?: boolean; eolOnly?: boolean; critOnly?: boolean }
const CATS: (AssetCategory | '전체')[] = ['전체', '단말', '서버', '네트워크', '주변기기', 'SW', '가상자원']
const STATUSES: (AssetStatus | '전체')[] = ['전체', '검수중', '사용중', '유휴', '대여중', '반납대기', '수리중', '분실', '폐기예정', '폐기완료']
const STATUS_TONE: Record<AssetStatus, 'ok' | 'warn' | 'err' | 'info' | 'neutral'> = {
  검수중: 'info', 사용중: 'ok', 유휴: 'neutral', 대여중: 'info', 반납대기: 'warn', 수리중: 'warn', 분실: 'err', 폐기예정: 'err', 폐기완료: 'neutral',
}
// 변경 이력 타임라인 이벤트 종류별 톤(제품안내서 §03 변경 이력) — 폐기·분실은 위험(적), 점검·수리는 정비(황),
//  등록·편입은 진입(녹), 나머지 운영(불출·이동·반납·대여·구성변경·보증연장)은 기본. 수명주기 중대 이벤트가 타임라인에서 도드라지게 한다.
const EVENT_TONE: Record<string, 'err' | 'warn' | 'ok'> = {
  폐기: 'err', 분실: 'err', 점검: 'warn', 수리: 'warn', 등록: 'ok', 편입: 'ok',
}

export function RegisterView(props: { assets: Asset[]; initialQuery: string; canEdit: boolean; canConfig: boolean; canDoc: boolean; canQuarantine: boolean; canManage: boolean; loanNeedsApproval?: boolean; moveNeedsApproval?: boolean; terminatedContracts?: string[]; canExport?: boolean; initialSel?: string; staleNos?: string[]; initialStale?: boolean; warrantyNos?: string[]; expiryWindowDays?: number; initialWarranty?: boolean; dqNos?: string[]; dqIssues?: Record<string, string[]>; initialDq?: boolean; eolNos?: string[]; initialEol?: boolean; critNos?: string[]; initialCrit?: boolean; contracts?: { id: string; name: string; kind: string }[]; today?: string; initialCat?: string; initialStatus?: string; receiptPendingCount?: number; receiptNos?: string[]; initialReceipt?: boolean; loanExtNos?: string[]; initialLoanExt?: boolean; loanRetNos?: string[]; initialLoanRet?: boolean; maintenanceNos?: string[]; initialMaint?: boolean; maintOverdueCount?: number; eolNoticeCount?: number; impactNoticeCount?: number; impactNos?: string[]; initialImpact?: boolean; spofNos?: string[]; initialSpof?: boolean; replaceNos?: string[]; initialReplace?: boolean; riskNos?: string[]; initialRisk?: boolean; disposalNos?: string[]; licenseSeatsByAsset?: Record<string, { id: string; name: string; vendor: string }[]>; users?: { name: string; dept: string }[] }) {
  const [q, setQ] = useState(props.initialQuery)
  // 재고 화면 등에서 ?cat=·?status= 로 진입하면 해당 필터로 시작한다(집계 → 대장 드릴다운)
  const [cat, setCat] = useState<AssetCategory | '전체'>(CATS.includes(props.initialCat as AssetCategory | '전체') ? (props.initialCat as AssetCategory) : '전체')
  const [status, setStatus] = useState<AssetStatus | '전체'>(STATUSES.includes(props.initialStatus as AssetStatus | '전체') ? (props.initialStatus as AssetStatus) : '전체')
  const [staleOnly, setStaleOnly] = useState(Boolean(props.initialStale))
  const [warrantyOnly, setWarrantyOnly] = useState(Boolean(props.initialWarranty))
  const [dqOnly, setDqOnly] = useState(Boolean(props.initialDq))
  const [eolOnly, setEolOnly] = useState(Boolean(props.initialEol))
  const [critOnly, setCritOnly] = useState(Boolean(props.initialCrit))
  const [maintOnly, setMaintOnly] = useState(Boolean(props.initialMaint))
  const [spofOnly, setSpofOnly] = useState(Boolean(props.initialSpof))
  const [impactOnly, setImpactOnly] = useState(Boolean(props.initialImpact))
  const [replaceOnly, setReplaceOnly] = useState(Boolean(props.initialReplace))
  const [riskOnly, setRiskOnly] = useState(Boolean(props.initialRisk))
  const [receiptOnly, setReceiptOnly] = useState(Boolean(props.initialReceipt))
  const [loanExtOnly, setLoanExtOnly] = useState(Boolean(props.initialLoanExt))
  const [loanRetOnly, setLoanRetOnly] = useState(Boolean(props.initialLoanRet))
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
    setStaleOnly(v.staleOnly); setWarrantyOnly(v.warrantyOnly); setDqOnly(Boolean(v.dqOnly)); setEolOnly(Boolean(v.eolOnly)); setCritOnly(Boolean(v.critOnly))
  }
  const saveCurrentView = () => {
    const name = viewName.trim()
    if (!name) return
    const v: SavedView = { name, q, cat, status, staleOnly, warrantyOnly, dqOnly, eolOnly, critOnly }
    persistViews([...views.filter((x) => x.name !== name), v])
    setNaming(false); setViewName('')
  }
  const removeView = (name: string) => persistViews(views.filter((x) => x.name !== name))
  const filterActive = q.trim() !== '' || cat !== '전체' || status !== '전체' || staleOnly || warrantyOnly || dqOnly || eolOnly || critOnly || maintOnly || spofOnly || impactOnly || replaceOnly || receiptOnly || loanExtOnly || loanRetOnly || riskOnly
  const staleSet = useMemo(() => new Set(props.staleNos ?? []), [props.staleNos])
  const warrantySet = useMemo(() => new Set(props.warrantyNos ?? []), [props.warrantyNos])
  const dqSet = useMemo(() => new Set(props.dqNos ?? []), [props.dqNos])
  const eolSet = useMemo(() => new Set(props.eolNos ?? []), [props.eolNos])
  const critSet = useMemo(() => new Set(props.critNos ?? []), [props.critNos])
  const maintSet = useMemo(() => new Set(props.maintenanceNos ?? []), [props.maintenanceNos])
  const spofSet = useMemo(() => new Set(props.spofNos ?? []), [props.spofNos])
  const impactSet = useMemo(() => new Set(props.impactNos ?? []), [props.impactNos])
  const replaceSet = useMemo(() => new Set(props.replaceNos ?? []), [props.replaceNos])
  const riskSet = useMemo(() => new Set(props.riskNos ?? []), [props.riskNos])
  // 폐기 절차(대상 선정~소거 대기) 진행 중 자산 — 서버 가드가 재불출·대여를 거부하므로 화면도 대여 접점을 내주지 않는다.
  const disposalSet = useMemo(() => new Set(props.disposalNos ?? []), [props.disposalNos])
  const receiptSet = useMemo(() => new Set(props.receiptNos ?? []), [props.receiptNos])
  const loanExtSet = useMemo(() => new Set(props.loanExtNos ?? []), [props.loanExtNos])
  const loanRetSet = useMemo(() => new Set(props.loanRetNos ?? []), [props.loanRetNos])
  const [selNo, setSelNo] = useState<string | null>(props.initialSel ?? null)
  const [cfgOpen, setCfgOpen] = useState(false)
  const [cfgField, setCfgField] = useState<ConfigField>('memory')
  const [cfgValue, setCfgValue] = useState('')
  const [cfgNote, setCfgNote] = useState('')
  const [cfgMsg, setCfgMsg] = useState<string | null>(null)
  const [fixVal, setFixVal] = useState<Record<string, string>>({})
  const [fixMsg, setFixMsg] = useState<string | null>(null)
  const [critMsg, setCritMsg] = useState<string | null>(null)
  const [ctMsg, setCtMsg] = useState<string | null>(null)
  const [ctPick, setCtPick] = useState('')
  const [wtyOpen, setWtyOpen] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const [lostType, setLostType] = useState<'분실' | '도난'>('분실')
  const [lostNote, setLostNote] = useState('')
  const [lostMsg, setLostMsg] = useState<string | null>(null)
  const [lostCond, setLostCond] = useState<'정상' | '수리 필요' | '폐기 권고'>('정상') // 분실 회수 시 실물 상태 점검
  const [faultOpen, setFaultOpen] = useState(false)
  const [faultNote, setFaultNote] = useState('')
  const [qrNote, setQrNote] = useState('')
  const [qrMsg, setQrMsg] = useState<string | null>(null)
  const [faultMsg, setFaultMsg] = useState<string | null>(null)
  const [receiptMsg, setReceiptMsg] = useState<string | null>(null)
  const [rcptRemindMsg, setRcptRemindMsg] = useState<string | null>(null)
  const [maintRemindMsg, setMaintRemindMsg] = useState<string | null>(null)
  const [eolNoticeMsg, setEolNoticeMsg] = useState<string | null>(null)
  const [impactMsg, setImpactMsg] = useState<string | null>(null)
  const [recoverOpen, setRecoverOpen] = useState(false)
  const [recoverReason, setRecoverReason] = useState('')
  const [recoverMsg, setRecoverMsg] = useState<string | null>(null)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignTo, setReassignTo] = useState('')
  const [reassignNote, setReassignNote] = useState('')
  const [reassignMsg, setReassignMsg] = useState<string | null>(null)
  const [loanExtOpen, setLoanExtOpen] = useState(false)
  const [loanExtDate, setLoanExtDate] = useState('')
  const [loanExtReason, setLoanExtReason] = useState('')
  const [loanExtMsg, setLoanExtMsg] = useState<string | null>(null)
  const [retReqMsg, setRetReqMsg] = useState<string | null>(null)
  const [maintOpen, setMaintOpen] = useState(false)
  const [maintNote, setMaintNote] = useState('')
  const [maintMsg, setMaintMsg] = useState<string | null>(null)
  const [schedOpen, setSchedOpen] = useState(false)
  const [schedDate, setSchedDate] = useState('')
  const [schedMsg, setSchedMsg] = useState<string | null>(null)
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
      if (dqOnly && !dqSet.has(a.assetNo)) return false
      if (eolOnly && !eolSet.has(a.assetNo)) return false
      if (critOnly && !critSet.has(a.assetNo)) return false
      if (maintOnly && !maintSet.has(a.assetNo)) return false
      if (spofOnly && !spofSet.has(a.assetNo)) return false
      if (impactOnly && !impactSet.has(a.assetNo)) return false
      if (replaceOnly && !replaceSet.has(a.assetNo)) return false
      if (riskOnly && !riskSet.has(a.assetNo)) return false
      if (receiptOnly && !receiptSet.has(a.assetNo)) return false
      if (loanExtOnly && !loanExtSet.has(a.assetNo)) return false
      if (loanRetOnly && !loanRetSet.has(a.assetNo)) return false
      if (!needle) return true
      return [a.assetNo, a.model, a.owner, a.dept, a.ip, a.serial, a.location, a.contractId]
        .some((f) => f?.toLowerCase().includes(needle))
    })
  }, [props.assets, q, cat, status, staleOnly, staleSet, warrantyOnly, warrantySet, dqOnly, dqSet, eolOnly, eolSet, critOnly, critSet, maintOnly, maintSet, spofOnly, spofSet, impactOnly, impactSet, replaceOnly, replaceSet, receiptOnly, receiptSet, loanExtOnly, loanExtSet, loanRetOnly, loanRetSet])

  const sel = props.assets.find((a) => a.assetNo === selNo) ?? null
  // CMDB 의존 관계 — 클라이언트에서 대장 스냅샷(props.assets)으로 순수 산출(상위 의존·영향 범위·저하 상위)
  const selDeps = sel ? assetDependenciesFrom(props.assets, sel.assetNo) : null
  const modelOf = (no: string) => props.assets.find((a) => a.assetNo === no)?.model ?? ''

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
  // 선택 항목 중 사용 중(회수 가능)만 — 오프보딩 일괄 회수 대상 수
  const checkedUsable = useMemo(() => [...checked].filter((no) => props.assets.find((a) => a.assetNo === no)?.status === '사용중'), [checked, props.assets])
  const bulkRecover = () => startTransition(async () => {
    const r = await recoverManyFromUser([...checked], '오프보딩·재배정')
    setBulkMsg(r.message)
    if (r.ok) setChecked(new Set())
  })
  // 일괄 재배정(직접 인계) — 선택한 사용 중 자산을 한 사람에게 직접 인계(팀 인수인계·후임 승계). 회수(유휴 왕복)와 달리 보유자만 바뀐다. checkedUsable 재사용
  const [bulkReassignTo, setBulkReassignTo] = useState('')
  const [bulkReassignNote, setBulkReassignNote] = useState('')
  const bulkReassign = () => startTransition(async () => {
    const r = await reassignAssetMany([...checked], bulkReassignTo, bulkReassignNote)
    setBulkMsg(r.message)
    if (r.ok) { setChecked(new Set()); setBulkReassignTo(''); setBulkReassignNote('') }
  })
  // 선택 항목 중 유휴(대여 가능)만 — 교육·행사용 로너 풀 일괄 대여 대상 수.
  //  폐기 절차 자산은 loanAssetMany 가 건너뛰고 '폐기 절차 자산 제외'로 알린다(다른 일괄 액션과 같은 건너뜀+보고 규약)
  //  — 단건 대여처럼 컨트롤을 감추면 왜 빠졌는지 알릴 자리가 없어져 여기서는 선택 수 그대로 둔다.
  const checkedIdle = useMemo(() => [...checked].filter((no) => props.assets.find((a) => a.assetNo === no)?.status === '유휴'), [checked, props.assets])
  const [bulkLoanTo, setBulkLoanTo] = useState('')
  const [bulkLoanDept, setBulkLoanDept] = useState('')
  const [bulkLoanDue, setBulkLoanDue] = useState('')
  const bulkLoan = () => startTransition(async () => {
    const r = await loanAssetMany([...checked], bulkLoanTo, bulkLoanDept, bulkLoanDue)
    setBulkMsg(r.message)
    if (r.ok) { setChecked(new Set()); setBulkLoanTo(''); setBulkLoanDept(''); setBulkLoanDue('') }
  })
  // 정기 점검 일괄 예약 — 선택 자산에 같은 예방 정비 예정일을 한 번에 등록(보증 일괄 연장과 같은 배치 접점)
  const [bulkMaintDate, setBulkMaintDate] = useState('')
  const bulkSchedule = () => startTransition(async () => {
    const r = await scheduleMaintenanceMany([...checked], bulkMaintDate)
    setBulkMsg(r.message)
    if (r.ok) { setChecked(new Set()); setBulkMaintDate('') }
  })
  // 계약 일괄 연계 — HW 유지보수·구매 계약이 다수 자산을 덮을 때 선택분을 한 계약에 한 번에 연계
  const [bulkContract, setBulkContract] = useState('')
  const bulkLinkContract = () => startTransition(async () => {
    const r = await setAssetContractMany([...checked], bulkContract)
    setBulkMsg(r.message)
    if (r.ok) { setChecked(new Set()); setBulkContract('') }
  })
  // 업무 중요도 일괄 지정 — 연 1회 자산 분류 재검토(ISO 27001 A.8.2)에서 같은 등급으로 분류할 다수 자산을 한 번에 지정(취약점 우선순위 축)
  const [bulkCrit, setBulkCrit] = useState<BizCriticality | ''>('')
  const bulkSetCrit = () => startTransition(async () => {
    if (!bulkCrit) return
    const r = await setAssetCriticalityMany([...checked], bulkCrit)
    setBulkMsg(r.message)
    if (r.ok) { setChecked(new Set()); setBulkCrit('') }
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
        <select aria-label="상태 필터" className="select" value={status} onChange={(e) => setStatus(e.target.value as AssetStatus | '전체')}
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
            title={`보증이 ${props.expiryWindowDays ?? 90}일 이내 만료·경과한 자산 — 보증 연장·교체 검토 대상(운영 정책 만료창)`}>
            {warrantyOnly ? '✓ ' : ''}보증 임박 {warrantySet.size}
          </button>
        )}
        {dqSet.size > 0 && (
          <button className={`btn sm ${dqOnly ? 'warn' : ''}`} onClick={() => setDqOnly((v) => !v)}
            title="소유자·시리얼·위치 등 핵심 필드가 누락·불일치한 자산 — 대장 정합성 보정 대상">
            {dqOnly ? '✓ ' : ''}정합성 미흡 {dqSet.size}
          </button>
        )}
        {eolSet.size > 0 && (
          <button className={`btn sm ${eolOnly ? 'danger' : ''}`} onClick={() => setEolOnly((v) => !v)}
            title="OS 지원 종료(EOL)가 경과한 자산 — 미패치 취약점 상시 노출, 교체·업그레이드 대상">
            {eolOnly ? '✓ ' : ''}EOL OS {eolSet.size}
          </button>
        )}
        {critSet.size > 0 && (
          <button className={`btn sm ${critOnly ? 'warn' : ''}`} onClick={() => setCritOnly((v) => !v)}
            title="업무 중요도가 핵심·중요로 지정된 자산 — DR·패치 우선순위·감사 대상">
            {critOnly ? '✓ ' : ''}핵심·중요 {critSet.size}
          </button>
        )}
        {maintSet.size > 0 && (
          <button className={`btn sm ${maintOnly ? 'warn' : ''}`} onClick={() => setMaintOnly((v) => !v)}
            title="정기 점검(예방 정비) 예정일이 도래한 자산 — 반응형 수리와 별개의 사전 정비 대상">
            {maintOnly ? '✓ ' : ''}정기 점검 {maintSet.size}
          </button>
        )}
        {impactSet.size > 0 && (
          <button className={`btn sm ${impactOnly ? 'err' : ''}`} onClick={() => setImpactOnly((v) => !v)}
            title="하위 의존 영향 통지 대상 — 회수·분실·수리·폐기 절차로 운영에서 빠졌는데 하위 의존 자산 담당 부서에 오늘 아직 통지하지 않은 상위 자산(대시보드 큐와 같은 집합)">
            {impactOnly ? '✓ ' : ''}의존 영향 통지 대상 {impactSet.size}
          </button>
        )}
        {spofSet.size > 0 && (
          <button className={`btn sm ${spofOnly ? 'err' : ''}`} onClick={() => setSpofOnly((v) => !v)}
            title="단일 장애점(SPOF) — CMDB 의존 그래프상 장애 시 하위 2대 이상이 전이 영향받는 자산. 이중화·DR 우선 대상">
            {spofOnly ? '✓ ' : ''}단일 장애점 {spofSet.size}
          </button>
        )}
        {replaceSet.size > 0 && (
          <button className={`btn sm ${replaceOnly ? 'warn' : ''}`} onClick={() => setReplaceOnly((v) => !v)}
            title="교체 대상(수명예측) — 내용연수 초과·보증 경과·장애 이력 자산. AI 분석 패널과 같은 근거, 조달 계획용 대장 브라우즈·반출">
            {replaceOnly ? '✓ ' : ''}교체 대상 {replaceSet.size}
          </button>
        )}
        {riskSet.size > 0 && (
          <button className={`btn sm ${riskOnly ? 'err' : ''}`} onClick={() => setRiskOnly((v) => !v)}
            title="복합 위험 — 정합성 미흡·EOL·보증·점검·SPOF·교체·미실측 주의 신호가 2개 이상 겹치는 자산. 다중 이슈 우선 조치 트리아지(자산 상세 '위험 신호' 요약과 같은 7신호 단일 소스)">
            {riskOnly ? '✓ ' : ''}복합 위험 {riskSet.size}
          </button>
        )}
        {receiptSet.size > 0 && (
          <button className={`btn sm ${receiptOnly ? 'warn' : ''}`} onClick={() => setReceiptOnly((v) => !v)}
            title="수령(인수) 미확인 — 불출 배정 후 사용자 인수 확인이 안 된 사용 중 자산(체인 오브 커스터디 공백). 수령 확인 독촉 대상">
            {receiptOnly ? '✓ ' : ''}수령 미확인 {receiptSet.size}
          </button>
        )}
        {loanExtSet.size > 0 && (
          <button className={`btn sm ${loanExtOnly ? 'warn' : ''}`} onClick={() => setLoanExtOnly((v) => !v)}
            title="대여 반환 기한 연장 요청 대기 — 대여자가 올린 연장 요청(요청대로 연장·반려 처리 대상)">
            {loanExtOnly ? '✓ ' : ''}연장 요청 {loanExtSet.size}
          </button>
        )}
        {loanRetSet.size > 0 && (
          <button className={`btn sm ${loanRetOnly ? 'warn' : ''}`} onClick={() => setLoanRetOnly((v) => !v)}
            title="대여 반납 신청 대기 — 대여자가 반납하겠다고 알린 건(회수·점검 후 반환 접수 대상)">
            {loanRetOnly ? '✓ ' : ''}반납 신청 {loanRetSet.size}
          </button>
        )}
        {props.canManage && (props.receiptPendingCount ?? 0) > 0 && (
          <button className="btn sm warn" disabled={pending}
            onClick={() => startTransition(async () => setRcptRemindMsg((await remindReceipts()).message))}
            title="불출 후 수령(인수) 확인이 안 된 자산의 사용자에게 확인 요청을 발송한다">
            수령 확인 독촉 발송 ({props.receiptPendingCount})
          </button>
        )}
        {props.canManage && (props.maintOverdueCount ?? 0) > 0 && (
          <button className="btn sm warn" disabled={pending}
            onClick={() => startTransition(async () => setMaintRemindMsg((await remindMaintenance()).message))}
            title="예방 정비 예정일이 지났는데도 미시행인 자산의 소유 부서에 점검 시행 요청을 발송한다">
            정기 점검 독촉 발송 ({props.maintOverdueCount})
          </button>
        )}
        {props.canManage && (props.eolNoticeCount ?? 0) > 0 && (
          <button className="btn sm danger" disabled={pending}
            onClick={() => startTransition(async () => setEolNoticeMsg((await notifyEolUpgrade()).message))}
            title="OS 지원 종료(EOL) 자산의 소유 부서에 업그레이드·교체 검토를 통보한다 (당일 중복 발송 차단)">
            EOL 업그레이드 통보 ({props.eolNoticeCount})
          </button>
        )}
        {props.canManage && (props.impactNoticeCount ?? 0) > 0 && (
          <button className="btn sm danger" disabled={pending}
            onClick={() => startTransition(async () => setImpactMsg((await notifyDependencyImpact()).message))}
            title="회수·분실·수리·폐기 절차로 운영에서 빠진 상위 자산에 물린 하위 자산의 담당 부서에 영향을 통지한다 (당일 중복 발송 차단)">
            의존 영향 통지 ({props.impactNoticeCount})
          </button>
        )}
        <span className="cnt">{rows.length}건 / 전체 {props.assets.length}건</span>
        {props.canExport && (
          <a className="btn sm" style={{ marginLeft: 'auto' }} download
            href={`/api/export/assets?${new URLSearchParams(
              // 화면 필터를 그대로 반영 — 서버 빌더가 지원하지 않는 필터(정합성·EOL·핵심중요·정기점검·단일장애점)가 켜져 있으면
              // 현재 보이는 행 번호를 nos 로 넘겨 파일이 화면 행수와 정확히 일치하게 한다(버튼이 약속한 건수와 파일이 어긋나지 않게).
              (dqOnly || eolOnly || critOnly || maintOnly || spofOnly || impactOnly || replaceOnly || receiptOnly || loanExtOnly || loanRetOnly || riskOnly)
                ? { nos: rows.map((a) => a.assetNo).join(',') }
                : { q: q.trim(), cat, status, ...(staleOnly ? { stale: '1' } : {}), ...(warrantyOnly ? { warranty: '1' } : {}) },
            ).toString()}`}>
            ⤓ 자산 대장 엑셀{filterActive ? ` (${rows.length})` : ''}
          </a>
        )}
      </div>
      {rcptRemindMsg && <div className="callout" style={{ marginBottom: 10 }}>{rcptRemindMsg}</div>}
      {maintRemindMsg && <div className="callout" style={{ marginBottom: 10 }}>{maintRemindMsg}</div>}
      {eolNoticeMsg && <div className="callout" style={{ marginBottom: 10 }}>{eolNoticeMsg}</div>}
      {impactMsg && <div className="callout" style={{ marginBottom: 10 }}>{impactMsg}</div>}

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
              {/* 보증 일괄 연장 — 서버 액션이 자산담당·Admin 전용이라 보안담당에게는 내주지 않는다(누르면 거부되는 막다른 길 방지) */}
              {props.canManage && (
              <span className="hstack" style={{ gap: 6 }}>
                <span className="mut" style={{ fontSize: 12 }}>보증 일괄 연장</span>
                {[1, 2, 3].map((y) => (
                  <button key={y} className="btn sm pri" disabled={pending} onClick={() => bulkExtend(y)}>{y}년</button>
                ))}
              </span>
              )}
              {props.canExport && <a className="btn sm" href={exportHref} download>⤓ 선택 {checked.size}건 내보내기</a>}
              <a className="btn sm" href={`/api/labels?nos=${encodeURIComponent([...checked].join(','))}`} target="_blank" rel="noopener">🏷 선택 라벨 인쇄</a>
              {/* 자산 운영 일괄 조치(회수·재배정·대여·점검·계약·중요도) — 서버 액션이 자산담당·Admin 전용이라 보안담당에게는 내주지 않는다(누르면 거부되는 막다른 길 방지) */}
              {props.canManage && (<>
              {/* 필수 결재로 지정된 종류는 일괄 조치에서도 뺀다 — 상세 컨트롤만 내리고 일괄 바에 남겨 두면 같은 규칙이 반쪽이 된다. */}
              {(props.loanNeedsApproval || props.moveNeedsApproval) && (
                <span className="mut" style={{ fontSize: 11.5 }}>
                  {[props.loanNeedsApproval ? '대여' : '', props.moveNeedsApproval ? '재배정(이동)' : ''].filter(Boolean).join('·')}은 필수 결재 — 신청 · 결재로 상신
                </span>
              )}
              {checkedUsable.length > 0 && (
                <button className="btn sm warn" disabled={pending} onClick={bulkRecover}
                  title="선택한 사용 중 자산을 일괄 회수 — 오프보딩·재배정(반납 접수 대기열로)">일괄 회수 (사용중 {checkedUsable.length})</button>
              )}
              {checkedUsable.length > 0 && !props.moveNeedsApproval && (props.users?.length ?? 0) > 0 && (
                <span className="hstack" style={{ gap: 6 }} title="선택한 사용 중 자산을 한 사람에게 일괄 직접 인계(팀 인수인계·후임 승계) — 회수와 달리 유휴 왕복 없이 보유자만 바뀌고 좌석도 승계, 새 보유자 수령 확인 대기">
                  <span className="mut" style={{ fontSize: 12 }}>일괄 재배정 (사용중 {checkedUsable.length})</span>
                  <select aria-label="일괄 재배정 인계 대상" className="input" style={{ height: 28, width: 130 }} value={bulkReassignTo} disabled={pending} onChange={(e) => setBulkReassignTo(e.target.value)}>
                    <option value="">인계 대상…</option>
                    {(props.users ?? []).map((u) => <option key={u.name} value={u.name}>{u.name} · {u.dept}</option>)}
                  </select>
                  <input className="input" style={{ height: 28, width: 110 }} placeholder="사유(선택)" value={bulkReassignNote} disabled={pending} onChange={(e) => setBulkReassignNote(e.target.value)} />
                  <button className="btn sm" disabled={pending || !bulkReassignTo} onClick={bulkReassign}>재배정</button>
                </span>
              )}
              {checkedIdle.length > 0 && !props.loanNeedsApproval && (
                <span className="hstack" style={{ gap: 6 }} title="선택한 유휴 재고를 한 대여자·부서·반환 기한으로 일괄 대여(교육·행사용 로너 풀)">
                  <span className="mut" style={{ fontSize: 12 }}>일괄 대여 (유휴 {checkedIdle.length})</span>
                  <input className="input" style={{ height: 28, width: 90 }} placeholder="대여자" value={bulkLoanTo} disabled={pending} onChange={(e) => setBulkLoanTo(e.target.value)} />
                  <input className="input" style={{ height: 28, width: 90 }} placeholder="부서" value={bulkLoanDept} disabled={pending} onChange={(e) => setBulkLoanDept(e.target.value)} />
                  <input className="input" type="date" style={{ height: 28 }} min={props.today} value={bulkLoanDue} disabled={pending} onChange={(e) => setBulkLoanDue(e.target.value)} title="반환 기한" />
                  <button className="btn sm" disabled={pending || !bulkLoanTo.trim() || !bulkLoanDept.trim() || !bulkLoanDue} onClick={bulkLoan}>대여</button>
                </span>
              )}
              <span className="hstack" style={{ gap: 6 }}>
                <span className="mut" style={{ fontSize: 12 }}>정기 점검 일괄 예약</span>
                <input className="input" type="date" style={{ height: 28 }} min={props.today} value={bulkMaintDate} disabled={pending}
                  onChange={(e) => setBulkMaintDate(e.target.value)} title="선택 자산에 예방 정비 예정일을 일괄 등록" />
                <button className="btn sm" disabled={pending || !bulkMaintDate} onClick={bulkSchedule}>예약</button>
              </span>
              {props.contracts && props.contracts.length > 0 && (
                <span className="hstack" style={{ gap: 6 }}>
                  <span className="mut" style={{ fontSize: 12 }}>계약 일괄 연계</span>
                  <select aria-label="일괄 계약 연계 대상" className="input" style={{ height: 28, maxWidth: 220 }} value={bulkContract} disabled={pending}
                    onChange={(e) => setBulkContract(e.target.value)} title="선택 자산을 한 계약에 일괄 연계 (HW 유지보수 등 다수 자산 계약)">
                    <option value="">계약 선택…</option>
                    {props.contracts.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.name}</option>)}
                  </select>
                  <button className="btn sm" disabled={pending || !bulkContract} onClick={bulkLinkContract}>연계</button>
                </span>
              )}
              <span className="hstack" style={{ gap: 6 }}>
                <span className="mut" style={{ fontSize: 12 }}>업무 중요도 일괄</span>
                <select aria-label="일괄 업무 중요도" className="input" style={{ height: 28, maxWidth: 140 }} value={bulkCrit} disabled={pending}
                  onChange={(e) => setBulkCrit(e.target.value as BizCriticality | '')} title="선택 자산의 업무 중요도를 일괄 지정 (자산 분류 재검토 — 취약점 우선순위 축)">
                  <option value="">중요도 선택…</option>
                  <option value="핵심">핵심</option>
                  <option value="중요">중요</option>
                  <option value="일반">일반</option>
                </select>
                <button className="btn sm" disabled={pending || !bulkCrit} onClick={bulkSetCrit}>지정</button>
              </span>
              </>)}
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
                <th>위치</th><th>IP</th><th className="c">상태</th><th className="c">중요도</th><th>보증 만료</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.assetNo} className={`clickable ${selNo === a.assetNo ? 'sel' : ''}`}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelNo(selNo === a.assetNo ? null : a.assetNo) } }}
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
                  <td className="c"><Chip tone={STATUS_TONE[a.status]}>{a.status}</Chip>{a.quarantinedAt && <> <Chip tone="err" bare>격리</Chip></>}</td>
                  <td className="c">
                    {a.criticality === '핵심' ? <Chip tone="err" bare>핵심</Chip>
                      : a.criticality === '중요' ? <Chip tone="warn" bare>중요</Chip>
                      : <span className="mut" style={{ fontSize: 11 }}>일반</span>}
                  </td>
                  <td className="tnum">
                    {a.warrantyEnd}
                    {a.warrantyEnd !== '-' && warrantyState(a.warrantyEnd, props.today!) === 'expired'
                      && !['폐기완료', '폐기예정'].includes(a.status) && <> <Chip tone="err" bare>경과</Chip></>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={props.canEdit ? 11 : 10}><div className="empty">조건에 맞는 자산이 없습니다</div></td></tr>}
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
            {(() => {
              const issues = props.dqIssues?.[sel.assetNo] ?? assetDataIssues(sel)
              if (issues.length === 0) return null
              // 이슈 라벨 → 보정 필드 매핑
              const fieldOf: Record<string, StewardField> = { '소유자 미지정': '소유자', '시리얼 누락': '시리얼', '위치 누락': '위치' }
              return (
                <div className="callout warn" style={{ margin: '10px 0 0', padding: '8px 11px' }}>
                  <div className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
                    <b>대장 정합성 미흡</b> — 핵심 필드 보정 필요:
                    {issues.map((it) => <Chip key={it} tone="warn" bare>{it}</Chip>)}
                  </div>
                  {props.canManage && (
                    <div className="vstack" style={{ gap: 6, marginTop: 8 }}>
                      {issues.map((it) => {
                        const field = fieldOf[it]
                        if (!field) return null
                        const k = `${sel.assetNo}:${field}`
                        return (
                          <div key={it} className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                            <span className="mut" style={{ fontSize: 12, minWidth: 64 }}>{field}</span>
                            <input className="input" style={{ flex: 1, minWidth: 120 }} disabled={pending}
                              placeholder={field === '소유자' ? '보정할 소유자(성명)' : field === '위치' ? '보정할 위치' : '보정할 시리얼(S/N)'}
                              value={fixVal[k] ?? ''} onChange={(e) => setFixVal((m) => ({ ...m, [k]: e.target.value }))} />
                            <button className="btn sm pri" disabled={pending || !(fixVal[k] ?? '').trim()}
                              onClick={() => startTransition(async () => {
                                const r = await correctField(sel.assetNo, field, fixVal[k] ?? '', '정합성 점검')
                                setFixMsg(r.message)
                                if (r.ok) setFixVal((m) => ({ ...m, [k]: '' }))
                              })}>보정</button>
                          </div>
                        )
                      })}
                      {issues.includes('부서 불일치') && (
                        // 보정 입력이 없는 이슈라 안내를 남긴다 — 보유자와 부서를 함께 바꾸는 것은 거버넌스 대상(이동·인계)이다.
                        <div className="mut" style={{ fontSize: 11.5 }}>부서 불일치는 필드 보정 대상이 아닙니다 — 재배정(직접 인계)으로 보유자·부서를 함께 맞추거나, 보유자를 보정하면 부서가 따라옵니다.</div>
                      )}
                      {fixMsg && <div className="mut" style={{ fontSize: 11.5 }}>{fixMsg}</div>}
                    </div>
                  )}
                </div>
              )
            })()}
            <dl className="kv" style={{ marginTop: 14 }}>
              <dt>상태</dt><dd><Chip tone={STATUS_TONE[sel.status]}>{sel.status}</Chip>{sel.quarantinedAt && <> <Chip tone="err" bare>NAC 격리 {sel.quarantinedAt}</Chip></>}</dd>
              {sel.quarantinedAt && props.canQuarantine && (
                <>
                  <dt>격리 해제</dt>
                  <dd>
                    {/* 격리는 결재로 집행되지만 해제는 조사 종결 판단이라 즉시 처리한다 — 사유가 감사 증적으로 남는다.
                        해제할 수단이 없으면 격리가 한쪽 문이 되어, 조사가 끝나도 표시가 남고 이상 행위 신호가 영영 닫힌다. */}
                    <span className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <input className="input" style={{ width: 240 }} placeholder="해제 사유 (조사 결과·보상통제)"
                        value={qrNote} disabled={pending} onChange={(e) => setQrNote(e.target.value)} />
                      <button className="btn sm warn" disabled={pending || !qrNote.trim()}
                        title="침해 조사·조치가 끝난 자산의 NAC 차단을 해제합니다 (보안운영팀 통보·감사 적재)"
                        onClick={() => startTransition(async () => {
                          const r = await releaseQuarantine(sel.assetNo, qrNote)
                          setQrMsg(r.message)
                          if (r.ok) setQrNote('')
                        })}>격리 해제</button>
                    </span>
                    {qrMsg && <div className="mut" style={{ fontSize: 11, marginTop: 4 }}>{qrMsg}</div>}
                  </dd>
                </>
              )}
              <dt>소유자</dt><dd>{sel.owner} · {sel.dept}</dd>
              <dt>위치</dt><dd>{sel.location}</dd>
              <dt>업무 중요도</dt>
              <dd>
                <span className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <Chip tone={sel.criticality === '핵심' ? 'err' : sel.criticality === '중요' ? 'warn' : 'neutral'}>{sel.criticality ?? '일반'}</Chip>
                  {props.canManage && <span className="mut" style={{ fontSize: 11 }}>변경:</span>}
                  {props.canManage && (['핵심', '중요', '일반'] as const).map((lv) => (
                    (sel.criticality ?? '일반') !== lv && (
                      <button key={lv} className="btn sm ghost" style={{ padding: '1px 8px', fontSize: 11 }} disabled={pending}
                        title={`업무 중요도를 ${lv}으로 지정 — 취약점 우선순위 스코어링에 반영`}
                        onClick={() => startTransition(async () => { const r = await setAssetCriticality(sel.assetNo, lv); setCritMsg(r.message) })}>
                        {lv}
                      </button>
                    )
                  ))}
                </span>
                {critMsg && <div className="mut" style={{ fontSize: 11, marginTop: 3 }}>{critMsg}</div>}
                <div className="mut" style={{ fontSize: 10.5, marginTop: 2 }}>취약점 노출 우선순위(§05)의 자산 중요도 축</div>
              </dd>
              <dt>시리얼</dt><dd className="code">{sel.serial}</dd>
              {sel.os && <><dt>OS</dt><dd>{sel.os}</dd></>}
              {sel.cpu && <><dt>CPU</dt><dd>{sel.cpu}</dd></>}
              {sel.memory && <><dt>메모리</dt><dd>{sel.memory}</dd></>}
              {sel.ip && <><dt>IP / MAC</dt><dd className="code">{sel.ip}{sel.mac ? ` · ${sel.mac}` : ''}</dd></>}
              <dt>도입일</dt><dd className="tnum">{sel.purchaseDate}</dd>
              {acquisitionCostOf(sel) > 0 && (
                <>
                  <dt>취득가</dt>
                  <dd className="tnum">
                    {acquisitionCostOf(sel).toLocaleString()}원{sel.acquisitionCost === undefined && <span className="mut" style={{ fontSize: 11 }}> · 표준 단가</span>}
                  </dd>
                  <dt>TCO(취득+수리)</dt>
                  <dd className="tnum strong">{assetTco(sel).toLocaleString()}원</dd>
                  {props.today && (() => {
                    const pct = depreciationPct(sel, props.today!)
                    return (
                      <>
                        <dt>잔존가치(장부가)</dt>
                        <dd className="hstack" style={{ gap: 6 }}>
                          <span className="tnum">{bookValueOf(sel, props.today!).toLocaleString()}원</span>
                          {pct >= 100 ? <Chip tone="neutral" bare>상각 완료</Chip> : <span className="mut" style={{ fontSize: 11 }}>정액법 · 상각 {pct}%</span>}
                        </dd>
                      </>
                    )
                  })()}
                </>
              )}
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
                    {props.canDoc && <a className="btn sm" href={`/api/loan-agreement/${sel.assetNo}`} target="_blank" rel="noopener"
                      title="대여 확인서 인쇄 — 반출 책임·반환 의무 서면 증적">🖨 대여 확인서</a>}
                  </dd>
                  {/* 대여 연장 요청/처리 — 대여자(사용자)는 연장을 신청하고, 자산담당은 요청대로 연장 또는 반려한다. */}
                  {sel.loanExtendRequest ? (
                    <>
                      <dt>연장 요청</dt>
                      <dd className="vstack" style={{ gap: 6 }}>
                        <span><Chip tone="warn" bare>연장 요청</Chip> {sel.loanExtendRequest.newDueDate}로 · {sel.loanExtendRequest.by} <span className="dim" style={{ fontSize: 11 }}>— {sel.loanExtendRequest.reason}</span></span>
                        {loanExtMsg && <span className="dim" style={{ fontSize: 11.5 }}>{loanExtMsg}</span>}
                        {props.canManage && (
                          <span className="hstack" style={{ gap: 6 }}>
                            <button className="btn sm pri" disabled={pending}
                              onClick={() => startTransition(async () => setLoanExtMsg((await grantLoanExtension(sel.assetNo)).message))}>요청대로 연장</button>
                            <button className="btn sm ghost" disabled={pending}
                              onClick={() => startTransition(async () => setLoanExtMsg((await declineLoanExtension(sel.assetNo, '')).message))}>요청 반려</button>
                          </span>
                        )}
                        {!props.canEdit && (
                          <span>
                            <button className="btn sm ghost" disabled={pending}
                              title="자산담당 처리 전이라면 본인 연장 요청을 철회합니다"
                              onClick={() => startTransition(async () => setLoanExtMsg((await cancelLoanExtension(sel.assetNo)).message))}>요청 취소</button>
                          </span>
                        )}
                      </dd>
                    </>
                  ) : !props.canEdit ? (
                    <>
                      <dt>기한 연장</dt>
                      <dd className="vstack" style={{ gap: 6 }}>
                        {loanExtMsg && <span className="dim" style={{ fontSize: 11.5 }}>{loanExtMsg}</span>}
                        {!loanExtOpen ? (
                          <button className="btn sm" disabled={pending} onClick={() => { setLoanExtOpen(true); setLoanExtDate(''); setLoanExtReason(''); setLoanExtMsg(null) }}
                            title="반환 기한 연장을 자산관리팀에 요청합니다">반환 기한 연장 요청</button>
                        ) : (
                          <span className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                            <input className="input" type="date" style={{ height: 28 }} min={sel.loanDueDate ?? props.today} value={loanExtDate} disabled={pending} onChange={(e) => setLoanExtDate(e.target.value)} />
                            <input className="input" style={{ height: 28, flex: 1, minWidth: 140 }} placeholder="연장 사유" value={loanExtReason} disabled={pending} onChange={(e) => setLoanExtReason(e.target.value)} />
                            <button className="btn sm pri" disabled={pending || !loanExtDate || !loanExtReason.trim()}
                              onClick={() => startTransition(async () => { const r = await requestLoanExtension(sel.assetNo, loanExtDate, loanExtReason); setLoanExtMsg(r.message); if (r.ok) setLoanExtOpen(false) })}>요청</button>
                            <button className="btn sm ghost" disabled={pending} onClick={() => setLoanExtOpen(false)}>취소</button>
                          </span>
                        )}
                      </dd>
                    </>
                  ) : null}
                  {/* 반납 신청(사용자 셀프서비스) — 대여자가 대여를 마치고 반환하겠다고 자산담당에 알린다. 실제 회수·점검은 자산담당의 반환 접수로 진행. */}
                  {!props.canEdit && (
                    <>
                      <dt>반납 신청</dt>
                      <dd className="vstack" style={{ gap: 6 }}>
                        {retReqMsg && <span className="dim" style={{ fontSize: 11.5 }}>{retReqMsg}</span>}
                        {sel.returnRequest ? (
                          <span className="hstack" style={{ gap: 6 }}>
                            <span><Chip tone="warn" bare>반납 신청됨</Chip> {sel.returnRequest.at} · {sel.returnRequest.by}</span>
                            <button className="btn sm ghost" disabled={pending}
                              title="반환 접수 전이라면 본인 반납 신청을 철회합니다"
                              onClick={() => startTransition(async () => setRetReqMsg((await cancelReturnRequest(sel.assetNo)).message))}>신청 취소</button>
                          </span>
                        ) : (
                          <button className="btn sm" disabled={pending}
                            title="대여를 마쳤음을 자산관리팀에 알립니다 — 회수·점검 후 반환 처리됩니다"
                            onClick={() => startTransition(async () => setRetReqMsg((await requestReturn(sel.assetNo, '')).message))}>반납 신청</button>
                        )}
                      </dd>
                    </>
                  )}
                </>
              )}
              {sel.status === '사용중' && props.canManage && (
                <>
                  <dt>인수인계</dt>
                  <dd className="hstack" style={{ gap: 6 }}>
                    {props.canDoc && <a className="btn sm" href={`/api/handover-sheet/${sel.assetNo}`} target="_blank" rel="noopener"
                      title="자산 인수인계서 인쇄 — 영구 불출 인계·인수 책임 서면 증적(대여 확인서의 불출 대응)">🖨 인수인계서</a>}
                    {sel.receiptPending && <Chip tone="warn" bare>수령 확인 대기</Chip>}
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
                    ) : (
                      <>
                        <Chip tone="warn" bare>수리 의뢰 전</Chip>
                        {/* 장애 신고 취소(오신고 철회) — 업체 배정 전, 장애 신고 직후 상태만. 반납·분실 점검으로 편성된 수리중은 마지막 이력이 장애 신고가 아니라 노출 안 됨(서버도 동일 가드). */}
                        {(() => {
                          const last = sel.history?.[sel.history.length - 1]
                          return last && last.kind === '수리' && last.detail.startsWith('장애 신고 —') ? (
                            <button className="btn sm ghost" disabled={pending}
                              onClick={() => startTransition(async () => { const r = await cancelFault(sel.assetNo); setFaultMsg(r.message) })}
                              title="오신고·재현 안 됨 — 업체 배정 전 장애 신고를 철회하고 사용중으로 되돌립니다">장애 신고 철회</button>
                          ) : null
                        })()}
                      </>
                    )}
                  </dd>
                  {faultMsg && <dd style={{ gridColumn: '1 / -1' }}><span className="mut" style={{ fontSize: 11 }}>{faultMsg}</span></dd>}
                </>
              )}
              <dt>최근 실측</dt>
              <dd className="hstack" style={{ gap: 6 }}>
                <span className="tnum">{sel.lastVerifiedAt ?? '미실측'}</span>
                {staleSet.has(sel.assetNo) && <Chip tone="err" bare>장기 미실측</Chip>}
              </dd>
              <dt>보증 만료</dt>
              <dd className="hstack" style={{ gap: 6 }}>
                <span className="tnum">{sel.warrantyEnd}</span>
                {props.today && (() => {
                  const w = warrantyState(sel.warrantyEnd, props.today!)
                  return w === 'covered' ? <Chip tone="ok" bare>보증 내</Chip>
                    : w === 'soon' ? <Chip tone="warn" bare>만료 임박</Chip>
                      : w === 'expired' ? <Chip tone="err" bare>보증 만료</Chip> : null
                })()}
              </dd>
              <dt>연계 계약</dt>
              <dd>
                {sel.contractId
                  ? (props.canManage
                    ? <a className="code" href={contractHref(sel.contractId)} title="계약 상세로 이동" style={{ color: 'var(--accent-deep)' }}>{sel.contractId}</a>
                    // 계약 화면은 자산담당·Admin 전용 — 다른 역할에게는 계약 번호를 텍스트로만 남긴다(정보는 유지, 막다른 링크는 제거)
                    : <span className="code">{sel.contractId}</span>)
                  : <span className="mut" style={{ fontSize: 11 }}>미연계</span>}
                {/* 근거 계약이 해지된 자산 — 라이선스의 '근거 해지'와 같은 신호. 링크만 살아 있으면 유지보수 근거가
                    사라진 것을 알 수 없다(해지 계약은 연계 선택 목록에서 빠져 화면이 스스로 알아낼 수 없다). */}
                {sel.contractId && (props.terminatedContracts ?? []).includes(sel.contractId)
                  && <> <Chip tone="err" bare>계약 해지됨</Chip></>}
                {props.canManage && (props.contracts?.length ?? 0) > 0 && (
                  <div className="hstack" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <select aria-label="연계 계약 선택" className="input" style={{ minWidth: 180, height: 25, fontSize: 11 }} value={ctPick} disabled={pending}
                      onChange={(e) => setCtPick(e.target.value)}>
                      <option value="">계약 선택 —</option>
                      {props.contracts!.filter((c) => c.id !== sel.contractId).map((c) => (
                        <option key={c.id} value={c.id}>{c.id} · {c.kind} · {c.name.slice(0, 20)}</option>
                      ))}
                    </select>
                    <button className="btn sm" disabled={pending || !ctPick}
                      title="선택한 구매·유지보수 계약에 이 자산을 연계 (제품안내서 §03 계약–자산 연결)"
                      onClick={() => startTransition(async () => { const r = await setAssetContract(sel.assetNo, ctPick); setCtMsg(r.message); if (r.ok) setCtPick('') })}>연계</button>
                    {sel.contractId && (
                      <button className="btn sm ghost" disabled={pending}
                        onClick={() => startTransition(async () => setCtMsg((await setAssetContract(sel.assetNo, '')).message))}>해제</button>
                    )}
                  </div>
                )}
                {ctMsg && <div className="mut" style={{ fontSize: 11, marginTop: 3 }}>{ctMsg}</div>}
              </dd>
              {(() => {
                // 위험 신호 요약 — 대장 필터로 흩어진 자산별 주의 신호(취약·EOL·보증·점검·SPOF·교체·미실측)를 이 자산 관점에서 한 곳에 모아 트리아지를 돕는다.
                //  각 필터 셋(단일 소스)을 재사용해 임계값을 재계산하지 않는다. 2개 이상이면 '복합 위험'으로 우선 조치 대상.
                const risks = [
                  dqSet.has(sel.assetNo) && '정합성 미흡',
                  eolSet.has(sel.assetNo) && 'EOL OS',
                  warrantySet.has(sel.assetNo) && '보증 임박',
                  maintSet.has(sel.assetNo) && '정기 점검 도래',
                  spofSet.has(sel.assetNo) && '단일 장애점',
                  replaceSet.has(sel.assetNo) && '교체 대상',
                  staleSet.has(sel.assetNo) && '장기 미실측',
                ].filter(Boolean) as string[]
                if (risks.length === 0) return null
                const multi = risks.length >= 2
                return (
                  <>
                    <dt>위험 신호 <span className="dim" style={{ fontWeight: 400 }}>({risks.length})</span></dt>
                    <dd className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
                      {risks.map((r) => <Chip key={r} tone={multi ? 'err' : 'warn'} bare>{r}</Chip>)}
                      {multi && <span className="mut" style={{ fontSize: 11 }}>복합 위험 — 우선 조치 검토</span>}
                    </dd>
                  </>
                )
              })()}
              {(props.licenseSeatsByAsset?.[sel.assetNo]?.length ?? 0) > 0 && (
                <>
                  {/* 배정 라이선스 — 라이선스 좌석 배정(로56)을 자산 관점에서 역조회. 오프보딩·감사 시 이 자산에 물린 SW 라이선스(회수·재배정 대상)를 한눈에. */}
                  <dt>배정 라이선스</dt>
                  <dd className="vstack" style={{ gap: 3, alignItems: 'stretch' }}>
                    {props.licenseSeatsByAsset![sel.assetNo].map((l) => (
                      // 계약·라이선스 화면은 자산담당·Admin 전용 — 권한이 없으면 링크 없이 배정 사실만 보여준다(막다른 링크 제거)
                      <a key={l.id} className="hstack" href={props.canManage ? '/inventory/contracts' : undefined} title="라이선스 좌석 배정 대장(계약·라이선스)으로 이동"
                        style={{ gap: 6, justifyContent: 'space-between', color: 'inherit', textDecoration: 'none' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name} <span className="dim" style={{ fontSize: 11 }}>· {l.vendor}</span></span>
                        <span className="code" style={{ color: 'var(--accent-deep)', flex: 'none' }}>{l.id}</span>
                      </a>
                    ))}
                    <span className="mut" style={{ fontSize: 11 }}>SW 라이선스 좌석이 이 자산에 배정돼 있습니다 — 오프보딩·폐기 시 회수·재배정 대상.</span>
                  </dd>
                </>
              )}
              {(sel.repairCosts?.length ?? 0) > 0 && (
                <>
                  <dt>수리 비용 이력</dt>
                  <dd className="vstack" style={{ gap: 3, alignItems: 'stretch' }}>
                    <div className="hstack" style={{ gap: 6 }}>
                      <span className="strong tnum">누계 {repairTotalOf(sel).toLocaleString()}원</span>
                      <span className="mut" style={{ fontSize: 11 }}>· {sel.repairCosts!.length}건 (자사 부담)</span>
                    </div>
                    {[...sel.repairCosts!].sort((a, b) => b.date.localeCompare(a.date)).map((c) => (
                      <div key={c.id} className="hstack" style={{ gap: 8, fontSize: 12 }}>
                        <span className="tnum mut" style={{ minWidth: 76 }}>{c.date}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.item}{c.warrantyClaimed && <span className="mut"> · 무상 보증 청구</span>}</span>
                        <span className="tnum" style={{ minWidth: 78, textAlign: 'right', color: c.warrantyClaimed ? 'var(--mut)' : undefined }}>{c.warrantyClaimed ? `절감 ${c.amount.toLocaleString()}` : `${c.amount.toLocaleString()}원`}</span>
                      </div>
                    ))}
                  </dd>
                </>
              )}
              {selDeps && (selDeps.upstream.length > 0 || selDeps.blastRadius.length > 0) && (
                <>
                  <dt>의존 관계 (CMDB)</dt>
                  <dd className="vstack" style={{ gap: 3, alignItems: 'stretch', fontSize: 12 }}>
                    {selDeps.upstream.length > 0 && <div><span className="mut">상위 의존</span> {selDeps.upstream.map((no) => `${no}(${modelOf(no)})`).join(', ')}</div>}
                    {selDeps.blastRadius.length > 0 && <div><span className="mut">영향 범위(blast radius)</span> <b>{selDeps.blastRadius.length}대</b> — {selDeps.blastRadius.join(', ')}</div>}
                    {selDeps.degradedUpstream.length > 0 && <div style={{ color: 'var(--err)' }}>⚠ 저하된 상위 {selDeps.degradedUpstream.join(', ')} — 이 자산 위험</div>}
                  </dd>
                  <dt>의존 토폴로지</dt>
                  <dd style={{ overflowX: 'auto' }}><TopologyDiagram deps={selDeps} selNo={sel.assetNo} modelOf={modelOf} /></dd>
                </>
              )}
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
                <div className="ev" data-tone={EVENT_TONE[h.kind]} key={i}>
                  <div className="d">{h.date} · {h.actor}</div>
                  <div className="t">{h.kind}</div>
                  <div className="x">{h.detail}</div>
                </div>
              ))}
            </div>

            {props.canEdit && (
              <div className="hstack" style={{ marginTop: 16 }}>
                <a className="btn sm" href={`/api/label/${sel.assetNo}`} target="_blank" rel="noopener">라벨 인쇄</a>
                {props.canManage && <Link className="btn sm" href="/assets/intake">라벨 · 검수</Link>}
                {/* 이동·폐기 처리 화면은 자산담당·Admin 전용 — 보안담당에게 내주면 눌러야 대시보드로 튕긴다 */}
                {props.canManage && <Link className="btn sm" href="/assets/movement">이동 처리</Link>}
                {props.canManage && <Link className="btn sm danger" href="/assets/disposal">폐기 처리</Link>}
              </div>
            )}

            {props.canManage && sel.status === '분실' && (
              <div style={{ marginTop: 12 }}>
                {lostMsg && <div className="callout" style={{ marginBottom: 10 }}>{lostMsg}</div>}
                <div className="callout warn" style={{ marginBottom: 10, padding: '8px 11px' }}>
                  분실·도난 신고된 자산입니다 — 실물을 되찾으면 회수로 유휴 풀 복귀, 되찾지 못하면 미회수 확정으로 폐기 절차(선정)에 바로 넘깁니다.
                </div>
                <span className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <select aria-label="회수 상태(점검 결과)" className="input" style={{ width: 108, height: 28, fontSize: 12 }} value={lostCond} disabled={pending}
                    onChange={(e) => setLostCond(e.target.value as '정상' | '수리 필요' | '폐기 권고')}
                    title="되찾은 실물의 상태 점검 — 파손분은 수리중·폐기 절차로(반납·대여 반환과 동일)">
                    {(['정상', '수리 필요', '폐기 권고'] as const).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button className="btn sm pri" disabled={pending}
                    onClick={() => startTransition(async () => {
                      const r = await recoverAsset(sel.assetNo, '', lostCond)
                      setLostMsg(r.message)
                    })}>회수 (실물 확보)</button>
                  <button className="btn sm danger" disabled={pending}
                    title="되찾지 못한 분실·도난 자산을 폐기 후보로 선정합니다 — 폐기 결재·데이터 소거 절차로 이어집니다"
                    onClick={() => startTransition(async () => {
                      const r = await selectForDisposal(sel.assetNo, '분실 미회수 확정')
                      setLostMsg(r.message)
                    })}>미회수 확정 → 폐기</button>
                  {props.canDoc && <a className="btn sm" href={`/api/loss-report/${sel.assetNo}`} target="_blank" rel="noopener"
                    title="분실·도난 신고서 인쇄 — 보험 청구·보안 사고·감사 증적용">🖨 분실·도난 신고서</a>}
                </span>
              </div>
            )}

            {props.canManage && sel.status !== '분실' && sel.status !== '폐기예정' && sel.status !== '폐기완료' && (
              <div style={{ marginTop: 12 }}>
                {lostMsg && <div className="callout" style={{ marginBottom: 10 }}>{lostMsg}</div>}
                {!lostOpen ? (
                  <button className="btn sm danger" disabled={pending}
                    onClick={() => { setLostOpen(true); setLostType('분실'); setLostNote(''); setLostMsg(null) }}
                    title="실물이 사라진 자산을 분실·도난으로 신고">분실 · 도난 신고</button>
                ) : (
                  <div className="vstack" style={{ gap: 8 }}>
                    <div className="kicker mute">분실 · 도난 신고</div>
                    <select aria-label="분실 · 도난 구분" className="select" value={lostType} disabled={pending}
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

            {/* 수령 확인 — 불출 배정 후 사용자 인수 확인(체인 오브 커스터디). 소유자(사용자)가 확인하며, 자산담당도 대리 확인 가능(서버 소유 검증). */}
            {sel.receiptPending && (
              <div className="callout warn" style={{ marginTop: 12, padding: '10px 12px' }}>
                {receiptMsg ? receiptMsg : (
                  <>
                    <b>수령 확인 대기.</b> 불출 배정된 자산의 실물 인수 확인이 아직 안 됐습니다.
                    <div style={{ marginTop: 8 }}>
                      <button className="btn sm pri" disabled={pending}
                        onClick={() => startTransition(async () => setReceiptMsg((await confirmReceipt(sel.assetNo)).message))}
                        title="배정받은 자산을 실물 수령했음을 확인 — 인수 이력이 남습니다">수령 확인 (인수 확인)</button>
                    </div>
                  </>
                )}
              </div>
            )}
            {/* 정기 점검 — 예방 정비 예정일이 잡힌 자산에 점검 완료 액션(§03 유지보수). 완료 시 12개월 후로 재예약. 자산담당만(canEdit). */}
            {props.canManage && sel.maintenanceDue && (
              <div className="callout" style={{ marginTop: 12, padding: '10px 12px' }}>
                {maintMsg ? maintMsg : (
                  <>
                    <b>정기 점검 예정 {sel.maintenanceDue}{props.today && sel.maintenanceDue < props.today ? ' (경과)' : ''}.</b>{' '}
                    {/* 비운영(분실·수리중·반납대기) 자산은 점검 도래 큐·독촉에서 빠진 상태다 — 시행하지 않은 점검을 기록하면 이력이 거짓이 되고 다음 회차가 12개월 밀린다. */}
                    {NON_OPERATIONAL_STATUSES.includes(sel.status)
                      ? <>{sel.status} 상태라 예방 정비 대상이 아닙니다 — 점검 도래 큐·독촉에서 제외돼 있습니다(운영 복귀 후 시행 · 잘못 잡은 예약은 아래에서 취소).</>
                      : <>예방 정비 대상 자산입니다.</>}
                    {!maintOpen ? (
                      <div className="hstack" style={{ marginTop: 8, gap: 6 }}>
                        {!NON_OPERATIONAL_STATUSES.includes(sel.status) && (
                        <button className="btn sm pri" disabled={pending}
                          onClick={() => { setMaintOpen(true); setMaintNote(''); setMaintMsg(null) }}
                          title="예방 정비를 시행하고 다음 점검을 재예약">정기 점검 완료</button>
                        )}
                        <button className="btn sm ghost" disabled={pending}
                          onClick={() => startTransition(async () => { const r = await cancelMaintenanceSchedule(sel.assetNo); setMaintMsg(r.message) })}
                          title="잘못 잡은 예약을 완료 처리 없이 해제 — 가짜 점검 이력을 남기지 않고 정비 사이클에서 제외">예약 취소</button>
                      </div>
                    ) : (
                      <div className="vstack" style={{ gap: 8, marginTop: 8 }}>
                        <input className="input" placeholder="점검 내용 (예: 펌웨어 업데이트·팬 청소·백업 확인)" value={maintNote} disabled={pending}
                          onChange={(e) => setMaintNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                        <div className="hstack">
                          <button className="btn sm pri" disabled={pending}
                            onClick={() => startTransition(async () => { const r = await recordMaintenance(sel.assetNo, maintNote); setMaintMsg(r.message); if (r.ok) { setMaintOpen(false); setMaintNote('') } })}>완료 기록</button>
                          <button className="btn sm ghost" disabled={pending} onClick={() => { setMaintOpen(false); setMaintMsg(null) }}>취소</button>
                        </div>
                        <span className="mut" style={{ fontSize: 11 }}>완료 시 다음 점검이 12개월 후로 재예약됩니다.</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {/* 정기 점검 일정 등록 — 예방 정비 예정이 아직 없는 운영 자산을 정비 사이클에 편입(§03 점검). 완료 재예약과 달리 최초 등록 접점. 자산담당만(canEdit). */}
            {props.canManage && !sel.maintenanceDue && NON_OPERATIONAL_STATUSES.includes(sel.status) && (
              <div className="mut" style={{ marginTop: 12, fontSize: 11 }}>{sel.status} 자산은 예방 정비 대상이 아닙니다 — 점검 도래 큐·독촉이 비운영 자산을 제외하므로 예약해도 어디에도 뜨지 않습니다(운영 복귀 후 등록).</div>
            )}
            {props.canManage && !sel.maintenanceDue && !NON_OPERATIONAL_STATUSES.includes(sel.status) && (
              <div style={{ marginTop: 12 }}>
                {schedMsg && <div className="callout" style={{ marginBottom: 10 }}>{schedMsg}</div>}
                {!schedOpen ? (
                  <button className="btn sm" disabled={pending}
                    onClick={() => { setSchedOpen(true); setSchedDate(''); setSchedMsg(null) }}
                    title="예방 정비 예정일을 지정해 정기 점검 사이클에 편입 — 도래 시 대장 필터·대시보드 큐에 노출됩니다">정기 점검 일정 등록</button>
                ) : (
                  <div className="vstack" style={{ gap: 8 }}>
                    <input className="input" type="date" value={schedDate} disabled={pending}
                      onChange={(e) => setSchedDate(e.target.value)} title="점검 예정일 (오늘 이후)" />
                    <div className="hstack">
                      <button className="btn sm pri" disabled={pending || !schedDate}
                        onClick={() => startTransition(async () => { const r = await scheduleMaintenance(sel.assetNo, schedDate); setSchedMsg(r.message); if (r.ok) { setSchedOpen(false); setSchedDate('') } })}>일정 등록</button>
                      <button className="btn sm ghost" disabled={pending} onClick={() => { setSchedOpen(false); setSchedMsg(null) }}>취소</button>
                    </div>
                    <span className="mut" style={{ fontSize: 11 }}>예정일이 도래(30일 내·경과)하면 정기 점검 완료 대상으로 표시됩니다.</span>
                  </div>
                )}
              </div>
            )}
            {/* 장애 신고 — 사용 중 자산의 고장을 보유자(사용자)·자산담당이 신고. canEdit 게이트와 무관하게 사용자도 본인 자산에 대해 신고 가능(서버가 소유 검증). */}
            {sel.status === '사용중' && (
              <div style={{ marginTop: 12 }}>
                {faultMsg && <div className="callout" style={{ marginBottom: 10 }}>{faultMsg}</div>}
                {!faultOpen ? (
                  <button className="btn sm warn" disabled={pending}
                    onClick={() => { setFaultOpen(true); setFaultNote(''); setFaultMsg(null) }}
                    title="사용 중 자산의 고장·오작동을 신고 — 수리 대기로 편성됩니다">장애 신고 (수리 요청)</button>
                ) : (
                  <div className="vstack" style={{ gap: 8 }}>
                    <div className="kicker mute">장애 신고 (수리 요청)</div>
                    <input className="input" placeholder="장애 증상 (예: 전원 불량·화면 깜빡임·배터리 소모)" value={faultNote} disabled={pending}
                      onChange={(e) => setFaultNote(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && faultNote.trim()) e.currentTarget.blur() }} />
                    <div className="hstack">
                      <button className="btn sm warn" disabled={pending || !faultNote.trim()}
                        onClick={() => startTransition(async () => {
                          const r = await reportFault(sel.assetNo, faultNote)
                          setFaultMsg(r.message)
                          if (r.ok) { setFaultOpen(false); setFaultNote('') }
                        })}>신고 접수</button>
                      <button className="btn sm ghost" disabled={pending} onClick={() => { setFaultOpen(false); setFaultMsg(null) }}>취소</button>
                    </div>
                    <span className="mut" style={{ fontSize: 11 }}>접수 시 자산관리팀에 통보되고 수리 대기로 편성됩니다.</span>
                  </div>
                )}
              </div>
            )}

            {/* 자산 회수(반납 처리) — 사용 중 자산을 자산담당이 직접 회수(오프보딩·재배정). 반납대기로 보내 반납 점검 흐름을 탄다. 자산담당만(canEdit). */}
            {props.canManage && sel.status === '사용중' && (
              <div style={{ marginTop: 12 }}>
                {recoverMsg && <div className="callout" style={{ marginBottom: 10 }}>{recoverMsg}</div>}
                {!recoverOpen ? (
                  <button className="btn sm" disabled={pending}
                    onClick={() => { setRecoverOpen(true); setRecoverReason(''); setRecoverMsg(null) }}
                    title="사용 중 자산을 회수해 반납 접수 대기열로 — 퇴직 오프보딩·재배정 등 사용자가 직접 반납할 수 없을 때">자산 회수 (반납 처리)</button>
                ) : (
                  <div className="vstack" style={{ gap: 8 }}>
                    <div className="kicker mute">자산 회수 (반납 처리)</div>
                    <input className="input" placeholder="회수 사유 (예: 퇴직 오프보딩·재배정)" value={recoverReason} disabled={pending}
                      onChange={(e) => setRecoverReason(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                    <div className="hstack">
                      <button className="btn sm pri" disabled={pending}
                        onClick={() => startTransition(async () => { const r = await recoverFromUser(sel.assetNo, recoverReason); setRecoverMsg(r.message); if (r.ok) { setRecoverOpen(false); setRecoverReason('') } })}>회수 확정</button>
                      <button className="btn sm ghost" disabled={pending} onClick={() => { setRecoverOpen(false); setRecoverMsg(null) }}>취소</button>
                    </div>
                    <span className="mut" style={{ fontSize: 11 }}>회수 시 반납 접수 대기열로 편성 — 점검 후 유휴 풀/수리/폐기로 분기됩니다.</span>
                  </div>
                )}
              </div>
            )}

            {/* 자산 재배정(직접 인계) — 사용 중 자산을 반납·재불출 왕복 없이 후임/동료에게 직접 인계. 새 보유자 수령 확인 대기. 자산담당만(canEdit). */}
            {/* 이동(재배정)이 필수 결재로 지정돼 있으면 직접 인계 컨트롤을 내주지 않는다 — 서버가 거부한다(신청 · 결재로). */}
            {props.canManage && props.moveNeedsApproval && sel.status === '사용중' && (
              <div className="callout" style={{ marginTop: 12 }}>재배정(이동)은 <b>필수 결재</b>로 지정돼 있습니다 — 신청 · 결재로 상신해 승인 후 처리하세요.</div>
            )}
            {props.canManage && !props.moveNeedsApproval && sel.status === '사용중' && (props.users?.length ?? 0) > 0 && (
              <div style={{ marginTop: 12 }}>
                {reassignMsg && <div className="callout" style={{ marginBottom: 10 }}>{reassignMsg}</div>}
                {!reassignOpen ? (
                  <button className="btn sm" disabled={pending}
                    onClick={() => { setReassignOpen(true); setReassignTo(''); setReassignNote(''); setReassignMsg(null) }}
                    title="사용 중 자산을 반납·재불출 없이 새 보유자에게 직접 인계 — 팀 내 인수인계·후임 승계">자산 재배정 (직접 인계)</button>
                ) : (
                  <div className="vstack" style={{ gap: 8 }}>
                    <div className="kicker mute">자산 재배정 (직접 인계) — 현재 보유자 {sel.owner}</div>
                    <select aria-label="재배정 새 보유자" className="select" value={reassignTo} disabled={pending} onChange={(e) => setReassignTo(e.target.value)}>
                      <option value="">새 보유자 선택…</option>
                      {(props.users ?? []).filter((u) => u.name !== sel.owner).map((u) => <option key={u.name} value={u.name}>{u.name} · {u.dept}</option>)}
                    </select>
                    <input className="input" placeholder="인계 사유 (예: 팀 내 인수인계·후임 승계)" value={reassignNote} disabled={pending}
                      onChange={(e) => setReassignNote(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                    <div className="hstack">
                      <button className="btn sm pri" disabled={pending || !reassignTo}
                        onClick={() => startTransition(async () => { const r = await reassignAsset(sel.assetNo, reassignTo, reassignNote); setReassignMsg(r.message); if (r.ok) { setReassignOpen(false); setReassignTo('') } })}>재배정 확정</button>
                      <button className="btn sm ghost" disabled={pending} onClick={() => { setReassignOpen(false); setReassignMsg(null) }}>취소</button>
                    </div>
                    <span className="mut" style={{ fontSize: 11 }}>반납 없이 소유자·부서가 바뀌며, 새 보유자의 수령(인수) 확인 대기로 전환됩니다. 라이선스 좌석은 자산과 함께 승계됩니다.</span>
                  </div>
                )}
              </div>
            )}

            {props.canManage && sel.status === '유휴' && disposalSet.has(sel.assetNo) && (
              <div className="mut" style={{ marginTop: 12, fontSize: 11 }}>폐기 절차(대상 선정~소거 대기) 중인 자산이라 대여·재불출 대상이 아닙니다 — 먼저 폐기 대상 선정을 취소하세요.</div>
            )}

            {/* 대여가 필수 결재로 지정돼 있으면 직접 대여 컨트롤을 내주지 않는다(좌석 배정 종료 상태 가드와 같은 규약). */}
            {props.canManage && props.loanNeedsApproval && sel.status === '유휴' && !disposalSet.has(sel.assetNo) && (
              <div className="callout" style={{ marginTop: 12 }}>대여는 <b>필수 결재</b>로 지정돼 있습니다 — 신청 · 결재로 상신해 승인 후 처리하세요.</div>
            )}
            {props.canManage && !props.loanNeedsApproval && sel.status === '유휴' && !disposalSet.has(sel.assetNo) && (
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

            {props.canManage && sel.status === '대여중' && (
              <div style={{ marginTop: 12 }}>
                {loanMsg && <div className="callout" style={{ marginBottom: 10 }}>{loanMsg}</div>}
                {sel.returnRequest && (
                  <div className="callout" style={{ marginBottom: 10 }}>
                    <Chip tone="warn" bare>반납 신청됨</Chip> {sel.returnRequest.by} · {sel.returnRequest.at}{sel.returnRequest.note ? ` — ${sel.returnRequest.note}` : ''} · 회수·점검 후 아래 <b>대여 반환 접수</b>로 처리하세요.
                  </div>
                )}
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
                ...(sel.ip !== undefined ? [{ key: 'ip' as ConfigField, label: 'IP', cur: sel.ip }] : []),
                ...(sel.mac !== undefined ? [{ key: 'mac' as ConfigField, label: 'MAC', cur: sel.mac }] : []),
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
                      <select aria-label="구성변경 항목" className="select" value={cfgField} disabled={pending}
                        onChange={(e) => pickField(e.target.value as ConfigField)}>
                        {fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.cur !== undefined ? ` · 현재 ${f.cur}` : ''}</option>)}
                      </select>
                      {cfgField === '유형' ? (
                        <select aria-label="구성변경 값" className="select" value={cfgValue} disabled={pending} onChange={(e) => setCfgValue(e.target.value)}
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
