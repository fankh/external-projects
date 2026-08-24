/** 리포트 본문 생성 — 스토어 데이터에서 결정적으로 산출한다.
 *  AI는 이 섹션들을 근거로 서술(headline)만 덧붙이므로, 수치는 항상 화면 데이터와 일치한다. */
import { effectiveClassifyAccuracy } from './ai-accuracy'
import { recordAiCall } from './ai-status'
import { buildMaintenance } from './maintenance'
import { buildProcurement } from './procurement'
import { missingContractDocs } from './contract'
import { appendAudit } from './audit'
import { addYears, nowMinute, today, daysUntil, fmtAmount, isLoanOverdue, isLoanDueSoon, isStaleVerify, isRepairOverdue, roundProgressPct } from './dates'
import { ACQ_COST, USEFUL_LIFE_YEARS, acquisitionCostOf, bookValueOf, repairTotalOf, warrantySavingsOf } from './cost'
import { eolOsOf } from './eol'
import { assetDataIssues, hasDataIssue } from './quality'
import { getStore } from './store'
import { buildVulnPriority } from './vuln-priority'
import { buildAnomalies } from './anomaly'
import { criticalDependencies, impactSources } from './cmdb'
// 복합 위험 단일 소스 — risk.ts 는 이 파일의 replacementCandidates 를 참조하므로 상호 import 이나
// 양쪽 모두 함수 본문에서만 서로를 호출(모듈 최상위 미참조)해 순환이 안전하다.
import { compositeRiskAssetNos, riskSignals } from './risk'
import type { CellValue, Sheet } from './xlsx'
import type { ReportKind, ReportSchedule, ReportSection, SaasUsage } from './types'

/** 중복 기능 SaaS 통합 후보 — 같은 기능 분류에 서로 다른 서비스가 2종 이상이면 통합 대상
 *  (제품안내서 §05 라이선스 최적화: 중복 기능 SaaS 통합 후보). Shadow SaaS 화면과 라이선스 컴플라이언스
 *  리포트가 같은 산출을 쓰도록 한 곳에 둔다. */
export function saasConsolidationCandidates(): { category: string; services: SaasUsage[]; users: number; shadowN: number; sanctioned?: SaasUsage }[] {
  const s = getStore()
  // 차단 판정된 서비스는 이미 정리(통합)된 것이므로 중복 후보에서 제외한다 — 통합 정리(로69)로 미인가 중복을
  // 표준으로 몰아 차단하면 해당 분류가 후보에서 빠져야 조치가 화면에 반영된다.
  const blocked = new Set(s.saasCatalog.filter((c) => c.status === '차단').map((c) => c.service))
  return Object.values(
    s.saas.filter((x) => !blocked.has(x.service)).reduce<Record<string, { category: string; services: SaasUsage[] }>>((acc, x) => {
      ;(acc[x.category] ??= { category: x.category, services: [] }).services.push(x)
      return acc
    }, {}),
  )
    .filter((g) => new Set(g.services.map((x) => x.service)).size >= 2)
    .map((g) => {
      const services = [...g.services].sort((a, b) => b.users - a.users)
      return {
        category: g.category,
        services,
        users: services.reduce((n, x) => n + x.users, 0),
        shadowN: services.filter((x) => !x.sanctioned).length,
        sanctioned: services.find((x) => x.sanctioned),
      }
    })
    .sort((a, b) => b.services.length - a.services.length || b.users - a.users)
}

/** 라이선스 최적화 산정(§05 AI 기능05) — 초과 사용·미사용 회수·만료 경과·중복 SaaS 통합을 한 번에 뽑는다.
 *  라이선스 컴플라이언스 리포트와 분석 화면 패널이 같은 근거를 쓰도록 단일 소스로 둔다(해지분 제외). */
export function licenseOptimization() {
  const s = getStore()
  const active = s.licenses.filter((l) => l.status !== '해지')
  const over = active.filter((l) => l.used > l.purchased)
  const under = active.filter((l) => l.used / l.purchased < 0.6)
  // 만료 경과 — 유효인데 만료일이 지난(미갱신) 라이선스. 만료 라이선스 사용은 컴플라이언스 위반이므로 별도 집계한다.
  const isExpired = (l: (typeof s.licenses)[number]) => l.status !== '해지' && l.expiry !== '-' && (daysUntil(l.expiry) ?? 0) < 0
  const expired = active.filter(isExpired)
  const saving = under.reduce((n, l) => n + (l.purchased - l.used) * l.unitCost, 0)
  const overCost = over.reduce((n, l) => n + (l.used - l.purchased) * l.unitCost, 0)
  const saasCons = saasConsolidationCandidates()
  return { active, over, under, expired, isExpired, saving, overCost, saasCons }
}

export const REPORT_KINDS: { kind: ReportKind; period: '주간' | '월간' | '수시'; desc: string }[] = [
  { kind: '주간 Shadow IT 브리핑', period: '주간', desc: '신규 발견 미등록 자산 · 외부 노출 · 미인가 SaaS · 인증·계정·엔드포인트 정책 위반 · 처리 현황' },
  { kind: '월간 자산 현황', period: '월간', desc: '유형별 보유·상태 분포, 수명주기 처리 실적, 만료 임박 계약, 유지보수(수리) 비용, 자산 처분 실적·폐기 진행 현황' },
  { kind: '라이선스 컴플라이언스', period: '월간', desc: '보유–사용 대사, 초과 사용 감사 리스크, 미사용 회수 절감액, 갱신 협상 근거, 중복 SaaS 통합 후보' },
  { kind: '재물조사 결과 요약', period: '수시', desc: '조사 진행률·차이 항목·차이 유형별 대장 대조·조정 결과(대장 보정·분실 처리·신규 등록)·조정 결재 대상' },
  { kind: '감사 대응 자료', period: '수시', desc: '권한 통제·감사 로그·정책 이행·대장 정합성(CMDB 정확도)·위협 대응 현황·이상 자산 행위 탐지 증빙 초안' },
  { kind: '연간 교체 계획', period: '수시', desc: '내용연수·보증 경과·OS 지원 종료(EOL)·장애 이력(잦은 수리) 기준 교체 대상·잔존가치·유형별 예산 추정' },
  { kind: '취약점 조치 우선순위', period: '수시', desc: '자산 중요도 × 노출도 스코어링 — 외부 CVE·EOL OS·미인가 SW·크리덴셜 노출을 P1/P2/P3로 순위화' },
  { kind: 'AI 거버넌스·성능', period: '월간', desc: '모델·프롬프트 버전·분류 정확도 · AI 기능별 제안 채택률(재학습 신호) · 감사·권한 필터 거버넌스 준수' },
  { kind: '부서별 IT 비용 배분', period: '월간', desc: '부서별 IT 자산 원가(취득가·잔존가치·누적 유지보수)·라이선스 좌석 비용·유지보수 계약비를 합산해 IT 비용을 부서로 배분(차지백·예산 근거)' },
  { kind: '계약 관리 현황', period: '월간', desc: '구매·유지보수 계약 포트폴리오·만료 임박·유지보수 예산 집행·구매 발주 이행·SLA·부속서류 거버넌스 점검(계약 이행 보고)' },
  { kind: '정보보호 컴플라이언스 증적', period: '수시', desc: 'ISMS/ISO 27001 통제별 증적 번들 — 자산 인벤토리 통제·접근 통제/SW 라이선스·매체 폐기 증적·운영 보안(취약점 노출)·로깅/변경 추적을 감사 대응용 한 문서로 집약' },
  { kind: '라이선스 갱신·트루업 계획', period: '수시', desc: '만료 임박 라이선스의 예상 갱신액·트루업 권고(초과=추가 구매·미사용=감축 갱신·근거 계약 해지=재계약)·갱신 예산 및 좌석 감축 절감을 선제 계획(컴플라이언스 리포트의 시점 감사와 달리 전방 예측)' },
  { kind: '단일 장애점·영향 분석', period: '수시', desc: 'CMDB 의존 그래프 기반 단일 장애점(SPOF)·영향 범위(blast radius) 분석 — 장애 시 전이 영향이 큰 자산, 현재 저하 상태로 하위에 위험을 주는 상위 자산, 이중화 우선순위 근거' },
  { kind: '자산 운영 리스크', period: '수시', desc: '분실·도난, 장기 미실측(유령 자산 후보), 대여 반환 연체, 수리 지연, 수령 미확인을 한 문서로 집약한 운영 리스크 현황 — 대시보드 운영 큐와 같은 판정, 항목별 조치(회수·재물조사·독촉) 연결' },
  { kind: '복합 위험 자산', period: '수시', desc: '정합성 미흡·EOL OS·보증 임박·정기 점검 도래·단일 장애점(SPOF)·교체 대상·장기 미실측 중 2개 이상이 겹치는 자산 — 신호가 중첩된 우선 조치 대상을 자산별 신호 조합·부서별 분포로 집약(대장 ?risk=1 필터·대시보드 복합 위험 큐와 같은 판정)' },
  { kind: '감가상각 명세', period: '월간', desc: '정액법(내용연수 5년) 기준 연도별 감가상각 명세 — 연초·연말 장부가·연간 상각액·상각 완료 대수의 향후 전개, 유형별 상각 현황, 상각 완료 예정 연도. 고정자산 회계·감가상각비 예산·교체(재취득) 시점 근거(부서별 IT 비용 배분의 현재 스냅샷과 달리 전방 전개)' },
  { kind: '계약 갱신 전망', period: '월간', desc: '구매·유지보수 계약의 분기별 갱신 전망 — 향후 8개 분기 만료 계약 수·예상 갱신액(유지보수/구매 구분)·만료 경과(미갱신) 집계, 갱신 임박 계약 상세. 계약 갱신 예산·현금흐름 계획 근거(계약 관리 현황의 D-90 스냅샷과 달리 다분기 전방 전개)' },
]

/** 교체 대상 산정 — 내용연수(도입 5년) 초과 또는 보증 경과 자산(폐기 대상 제외).
 *  AI 수명예측 제안 승인 시 이 근거로 연간 교체 계획 리포트가 생성된다.
 *  교체 예산 단가는 lib/cost 의 유형 표준 단가(ACQ_COST)를 재사용(대장 취득가·재고 가치와 동일 기준). */
export function replacementCandidates() {
  const s = getStore()
  const t = today()
  // 도입 5년 초과 기준일 — 문자열 비교로 TZ 문제를 피한다 (예: 2026-08-01 → 2021-08-01)
  const cutoff = addYears(t, -5)
  // 하드웨어 교체 계획 — 실물 자산만 대상. SW(라이선스 만료·최적화로 다룸)·가상자원(클라우드·사용량 과금)은
  //  내용연수·보증 경과 기반 하드웨어 교체 대상이 아니다(lib/cost ACQ_COST 도 SW·가상자원=0으로 같은 전제).
  const active = s.assets.filter((a) => !['폐기완료', '폐기예정'].includes(a.status) && a.category !== 'SW' && a.category !== '가상자원')
  const cands = active
    .map((a) => {
      const warr = a.warrantyEnd !== '-' && a.warrantyEnd < t
      const aged = a.purchaseDate < cutoff
      // 장애 이력 — 반복 수리(2회 이상)는 잦은 고장 신호. 사용 연한·보증과 별개로 교체 시점을 앞당기는 드라이버(제품안내서 §05 기능03: 장애 이력 기반 교체 예측).
      const repairs = a.repairCosts ?? []
      const failing = repairs.length >= 2
      const reasons: string[] = []
      if (aged) reasons.push('내용연수 초과')
      if (warr) reasons.push('보증 경과')
      // 누계는 자사 부담분만(repairTotalOf) — 무상 보증 청구분(제조사 부담)은 제외해 월간 리포트·TCO 와 정합. 빈도(repairs.length)는 자사 부담 무관하게 고장 신호이므로 전체 건수 유지.
      if (failing) reasons.push(`잦은 장애(수리 ${repairs.length}회·누계 ${repairTotalOf(a).toLocaleString()}원)`)
      return { a, why: reasons.join(' · '), book: bookValueOf(a, t) }
    })
    .filter((x) => x.why)
  const budget = cands.reduce((n, x) => n + (ACQ_COST[x.a.category] ?? 0), 0)
  // 잔여 장부가 — 교체 시 상각 전 남아있는 장부가치(대부분 내용연수 초과라 0에 수렴). 회계상 폐기손실 규모.
  const residualBook = cands.reduce((n, x) => n + x.book, 0)
  return { cands, budget, residualBook }
}

/** 다음 실행 예정일 — 마지막 실행 + 주기. 스케줄이 밀렸는지 화면에서 드러나야 한다.
 *  ('use server' 모듈은 async 함수만 export 할 수 있어 순수 계산은 여기에 둔다) */
export function nextRunOf(sc: ReportSchedule): string | null {
  if (!sc.lastRunAt) return null
  const last = new Date(sc.lastRunAt)
  if (sc.period === '주간') return new Date(last.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)
  // 월간 — setMonth(+1) 은 말일(1/31)에서 오버플로(Feb 31 → 3/3)되므로 대상 월 말일로 클램프한다(1/31 → 2/28).
  const [y, mo, dy] = sc.lastRunAt.slice(0, 10).split('-').map(Number)
  const targetY = mo === 12 ? y + 1 : y
  const targetMo = mo === 12 ? 1 : mo + 1 // 1-based 대상 월
  const lastDay = new Date(Date.UTC(targetY, targetMo, 0)).getUTCDate() // 대상 월의 말일
  return new Date(Date.UTC(targetY, targetMo - 1, Math.min(dy, lastDay))).toISOString().slice(0, 10)
}

/** 정례 리포트 배포 기한 경과 — 가동(enabled) 스케줄의 다음 실행 예정일이 지났는데 아직 미배포(자동 생성 밀림).
 *  제품안내서 §05 리포트 자동화(정례 증적) — 화면·대시보드가 같은 판정을 공유한다. 중지(disabled) 스케줄은 제외. */
export function isScheduleOverdue(sc: ReportSchedule): boolean {
  if (!sc.enabled) return false
  const next = nextRunOf(sc)
  return next === null || next <= today()
}

export function buildSections(kind: ReportKind): ReportSection[] {
  const s = getStore()

  if (kind === '주간 Shadow IT 브리핑') {
    const unreg = s.discovered.filter((d) => d.state === '미등록')
    const handled = s.discovered.filter((d) => d.action)
    const shadowSaas = s.saas.filter((x) => !x.sanctioned)
    // 인증·계정·SW 위생 — 외부/내부 채널의 정책 위반 위협(크리덴셜 노출·휴면 계정·미인가 SW). 주간 브리핑이 결재·감사 증적이 되려면 함께 담아야 한다.
    const credOpen = s.credentials.filter((c) => c.status !== '조치 완료')
    const acctOpen = s.accounts.filter((a) => !a.action)
    const swOpen = s.unauthorizedSw.filter((w) => !w.action)
    const usbOpen = s.usbFindings.filter((u) => !u.action)
    const vmOpen = s.localVms.filter((v) => !v.action)
    return [
      {
        title: '신규 발견 미등록 자산',
        note: `총 ${unreg.length}건 — 위험도 높음 ${unreg.filter((d) => d.risk === '높음').length}건`,
        columns: ['발견 ID', '호스트명', '유형', '채널', '위험도', '처리 상태'],
        rows: unreg.map((d) => [d.id, d.hostname, d.type, d.channel, d.risk, d.action ?? '미처리']),
      },
      {
        title: '외부 공격표면 노출',
        note: `외부 노출 ${s.external.length}건 중 미등록 ${s.external.filter((e) => e.state === '미등록').length}건, CVE 확인 ${s.external.filter((e) => e.cve).length}건`,
        columns: ['호스트', '발견 방법', '노출 서비스', 'CVE', '위험도'],
        rows: s.external.filter((e) => e.state === '미등록').map((e) => [e.host, e.method, e.services ?? '-', e.cve ?? '-', e.risk]),
      },
      {
        title: '미인가 SaaS 사용',
        note: `미인가 ${shadowSaas.length}종 · 추정 사용자 ${shadowSaas.reduce((n, x) => n + x.users, 0)}명`,
        columns: ['서비스', '분류', '주 사용 부서', '추정 사용자', '위험도'],
        rows: shadowSaas.map((x) => [x.service, x.category, x.dept, String(x.users), x.risk]),
      },
      {
        title: '인증 · 계정 · 엔드포인트 정책 위반',
        note: `크리덴셜 노출 ${credOpen.length} · 휴면 계정 ${acctOpen.length} · 미인가 SW ${swOpen.length} · USB 매체 ${usbOpen.length} · 로컬 VM ${vmOpen.length} (전건 미조치)`,
        columns: ['구분', '대상', '상세', '위험도', '조치 상태'],
        rows: [
          ...credOpen.map((c) => ['크리덴셜 노출', `${c.service} ${c.host}`, c.issue, c.severity, '미조치']),
          ...acctOpen.map((a) => ['휴면 계정', a.account, `${a.kind} · ${a.dormantDays}일`, a.risk, '미처리']),
          ...swOpen.map((w) => ['미인가 SW', `${w.name} @ ${w.assetNo}`, w.kind, w.risk, '미조치']),
          ...usbOpen.map((u) => ['USB 저장매체', `${u.device} @ ${u.assetNo}`, u.kind, u.risk, '미조치']),
          ...vmOpen.map((v) => ['로컬 VM', `${v.vm} @ ${v.assetNo}`, `${v.kind} · ${v.guestOs}`, v.risk, '미조치']),
        ],
      },
      {
        title: '조치 현황',
        bullets: [
          `편입 요청 ${handled.filter((d) => d.action?.startsWith('편입')).length}건 · 격리 요청 ${handled.filter((d) => d.action?.startsWith('격리')).length}건`,
          `외부·엔드포인트 위협 미조치 — 크리덴셜 노출 ${credOpen.length} · IOC 상관 ${s.iocMatches.filter((i) => !i.action).length} · 휴면 계정 ${acctOpen.length} · 미인가 SW ${swOpen.length} · USB 매체 ${usbOpen.length} · 로컬 VM ${vmOpen.length} · 다크웹 유출 ${s.leaks.filter((l) => l.status !== '조치 완료').length}`,
          `결재 대기 ${s.approvals.filter((a) => a.status === '대기').length}건`,
          `활성 탐지 채널 ${s.scanPolicies.filter((p) => p.enabled).length}/${s.scanPolicies.length}`,
        ],
      },
    ]
  }

  if (kind === '월간 자산 현황') {
    const cats = [...new Set(s.assets.map((a) => a.category))]
    // 유지보수(수리) 비용 — 자산 단위 수리비(repairCosts) 롤업. 월간 운영 보고에 TCO 반영. 무상 보증 청구분은 제조사 부담이라 자사 수리비에서 제외(repairTotalOf).
    const sumRepair = (a: (typeof s.assets)[number]) => repairTotalOf(a)
    const repaired = s.assets.filter((a) => repairTotalOf(a) > 0).sort((x, y) => sumRepair(y) - sumRepair(x))
    const totalRepair = repaired.reduce((n, a) => n + sumRepair(a), 0)
    // 보증 절감 — 무상 보증 청구로 자사가 부담하지 않은 수리비. 자사 수리비 총계에서 빠진 금액을 리더십 보고에 명시(비용 회피 가시화·숫자 투명성).
    const totalWarrantySaved = s.assets.reduce((n, a) => n + warrantySavingsOf(a), 0)
    const savedNote = totalWarrantySaved > 0 ? ` · 보증 절감 ${totalWarrantySaved.toLocaleString()}원(무상 보증 청구)` : ''
    const repairSection: ReportSection = repaired.length === 0
      ? { title: '유지보수(수리) 비용 현황', bullets: [totalWarrantySaved > 0 ? `자사 부담 수리 비용 없음 · 보증 절감 ${totalWarrantySaved.toLocaleString()}원(무상 보증 청구)` : '등록된 수리 비용 이력이 없습니다.'] }
      : {
          title: '유지보수(수리) 비용 현황',
          note: `누적 수리비 총 ${totalRepair.toLocaleString()}원 · 수리 이력 자산 ${repaired.length}대${savedNote}`,
          columns: ['자산번호', '모델', '수리 건수', '누적 수리비'],
          rows: repaired.map((a) => [a.assetNo, a.model, String(a.repairCosts!.length), `${sumRepair(a).toLocaleString()}원`]),
        }
    // 자산 처분 실적 — 완료 폐기의 물리 처분 방식·매각 대금 회수(수리 비용의 반대편 = 가치 회수). 회계·ESG 보고.
    const disposed = s.disposals.filter((d) => d.status === '완료' && d.disposition)
    const totalProceeds = disposed.reduce((n, d) => n + (d.proceeds ?? 0), 0)
    const disposalSection: ReportSection = disposed.length === 0
      ? { title: '자산 처분 실적 (불용 처리)', bullets: ['완료된 자산 처분 실적이 없습니다.'] }
      : {
          title: '자산 처분 실적 (불용 처리)',
          note: `완료 처분 ${disposed.length}건 · 매각 대금 회수 총 ${totalProceeds.toLocaleString()}원`,
          columns: ['폐기번호', '자산번호', '모델', '처분 방식', '매각 대금'],
          rows: disposed.map((d) => [d.id, d.assetNo, d.model, d.disposition ?? '', d.proceeds ? `${d.proceeds.toLocaleString()}원` : '-']),
        }
    // 폐기 진행 현황 — 완료 전 파이프라인(대상 선정·결재 대기·소거 대기). 장기 유휴·분실·EOL 등에서 편입된 폐기 대상이 어느 단계에 있는지 드러낸다.
    const inProcess = s.disposals.filter((d) => d.status !== '완료')
    const stageN = (st: string) => inProcess.filter((d) => d.status === st).length
    const pipelineSection: ReportSection = inProcess.length === 0
      ? { title: '폐기 진행 현황 (결재·소거 대기)', bullets: ['진행 중인 폐기 절차가 없습니다.'] }
      : {
          title: '폐기 진행 현황 (결재·소거 대기)',
          note: `진행 ${inProcess.length}건 — 대상 선정 ${stageN('대상 선정')} · 결재 대기 ${stageN('결재 대기')} · 소거 대기 ${stageN('소거 대기')}`,
          columns: ['폐기번호', '자산번호', '모델', '단계', '사유'],
          rows: inProcess.map((d) => [d.id, d.assetNo, d.model, d.status, d.reason]),
        }
    return [
      {
        title: '유형별 보유 현황',
        note: `총 ${s.assets.length}대`,
        columns: ['유형', '보유', '사용중', '유휴·반납', '기타'],
        rows: cats.map((c) => {
          const list = s.assets.filter((a) => a.category === c)
          return [
            c, String(list.length),
            String(list.filter((a) => a.status === '사용중').length),
            String(list.filter((a) => ['유휴', '반납대기'].includes(a.status)).length),
            String(list.filter((a) => !['사용중', '유휴', '반납대기'].includes(a.status)).length),
          ]
        }),
      },
      {
        title: '수명주기 처리 대상',
        columns: ['자산번호', '모델', '상태', '위치'],
        // 수명주기 처리 대기열 화면(lifecycle/page.tsx)과 동일 필터 — 운영 중(사용중)·종결(폐기완료)은 처리 대상이 아니다.
        //  화면은 폐기완료를 제외하나 리포트가 사용중만 제외해, 종결 자산이 '처리 대상'(할 일) 리포트에 남던 드리프트(화면=리포트 정합).
        rows: s.assets.filter((a) => a.status !== '사용중' && a.status !== '폐기완료').map((a) => [a.assetNo, a.model, a.status, a.location]),
      },
      repairSection,
      disposalSection,
      pipelineSection,
      {
        // 만료 임박 창은 운영 정책(expiryWindowDays)을 따른다 — 대시보드·만료 알림과 같은 기준(v1.240)
        title: `만료 임박 계약 (${s.opsPolicy.expiryWindowDays}일 이내)`,
        columns: ['계약번호', '계약명', '공급사', '만료일', '잔여'],
        rows: s.contracts
          .filter((c) => { const d = daysUntil(c.end); return c.status !== '해지' && d !== null && d <= s.opsPolicy.expiryWindowDays })
          .sort((a, b) => a.end.localeCompare(b.end))
          .map((c) => [c.id, c.name, c.vendor, c.end, (daysUntil(c.end) ?? 0) < 0 ? '경과' : `${daysUntil(c.end)}일`]),
      },
      {
        // 대여(반출) 현황 — 반환 기한부 반출 자산과 연체·임박(loops 41/42). 월간 운영 보고에 반영.
        title: '대여(반출) 현황',
        note: `대여중 ${s.assets.filter((a) => a.status === '대여중').length}건 · 연체 ${s.assets.filter(isLoanOverdue).length}건`,
        columns: ['자산번호', '모델', '대여자', '부서', '반환 기한', '상태'],
        rows: s.assets
          .filter((a) => a.status === '대여중')
          .sort((a, b) => (a.loanDueDate ?? '').localeCompare(b.loanDueDate ?? ''))
          .map((a) => {
            const d = a.loanDueDate ? daysUntil(a.loanDueDate) : null
            const st = isLoanOverdue(a) ? `연체 ${d !== null ? -d : ''}일` : isLoanDueSoon(a) ? `반환 임박 D-${d}` : '정상'
            return [a.assetNo, a.model, a.owner, a.dept, a.loanDueDate ?? '-', st]
          }),
      },
      {
        title: 'Discovery 편입 실적',
        bullets: [
          `Discovery 채널로 편입된 자산 ${s.assets.filter((a) => a.discoveredVia).length}대`,
          `대장 미등록 발견 잔여 ${s.discovered.filter((d) => d.state === '미등록' && !d.action).length}건`,
        ],
      },
    ]
  }

  if (kind === '라이선스 컴플라이언스') {
    // 해지 라이선스는 컴플라이언스 판정(초과·미사용) 대상에서 제외한다 — 구독 중단분은 감사 리스크·비용 절감 대상이 아니다.
    // 산정 근거는 licenseOptimization() 단일 소스 — 분석 화면 패널과 수치가 어긋나지 않게 한다.
    const { active, over, under, expired, isExpired, saving, saasCons } = licenseOptimization()
    return [
      {
        title: '보유–사용 대사',
        note: `초과 사용 ${over.length}건 · 미사용 보유 ${under.length}건 · 만료 경과 ${expired.length}건 (해지 제외)`,
        columns: ['라이선스', '공급사', '보유', '사용', '사용률', '만료일', '판정'],
        rows: s.licenses.map((l) => [
          l.name, l.vendor, String(l.purchased), String(l.used),
          `${Math.round((l.used / l.purchased) * 100)}%`, l.expiry,
          `${isExpired(l) ? '만료·' : ''}${l.status === '해지' ? '해지' : l.used > l.purchased ? '초과 사용' : l.used / l.purchased < 0.6 ? '미사용 보유' : '적정'}`,
        ]),
      },
      {
        title: '감사 리스크 — 초과 사용',
        note: over.length ? '추가 구매 품의 또는 미사용자 회수가 필요합니다.' : '초과 사용 항목이 없습니다.',
        columns: ['라이선스', '초과 좌석', '추가 구매 시 비용'],
        rows: over.map((l) => [l.name, `${l.used - l.purchased}석`, `${fmtAmount((l.used - l.purchased) * l.unitCost)}원`]),
      },
      {
        title: '비용 최적화 — 미사용 회수 후보',
        note: `연간 최대 ${fmtAmount(saving)}원 절감 가능`,
        columns: ['라이선스', '회수 후보', '연간 절감액'],
        rows: under.map((l) => [l.name, `${l.purchased - l.used}석`, `${fmtAmount((l.purchased - l.used) * l.unitCost)}원`]),
      },
      {
        // 갱신 협상 근거 데이터 — 사용 패턴(사용률) 기반 만료·갱신 시 권고 수량. 라이선스 최적화(§05)의 세 번째 축(회수·통합의 짝).
        title: '비용 최적화 — 갱신 협상 근거 (사용률 기반 권고)',
        note: '만료·갱신 시점의 우측 조정 근거 — 초과는 증설, 미사용은 감축, 적정은 현행 유지',
        columns: ['라이선스', '사용률', '만료일', '갱신 권고 수량', '협상 방향'],
        rows: active.map((l) => {
          const rate = Math.round((l.used / l.purchased) * 100)
          const rec = l.used > l.purchased ? Math.ceil(l.used * 1.05) : l.used / l.purchased < 0.6 ? Math.ceil(l.used * 1.1) : l.purchased
          const dir = l.used > l.purchased
            ? `증설 협상 — ${l.used - l.purchased}석 초과 (권고 ${rec}석)`
            : l.used / l.purchased < 0.6
              ? `감축 협상 — ${l.purchased - rec}석 감축·연 ${fmtAmount((l.purchased - rec) * l.unitCost)}원 절감`
              : '현행 유지 (적정 활용)'
          return [l.name, `${rate}%`, l.expiry, `${rec}석`, dir]
        }),
      },
      {
        // 중복 기능 SaaS 통합 후보 — 라이선스 최적화(§05)의 SaaS 축. Shadow SaaS 화면(v1.250)과 같은 산출을 결재 첨부 리포트에도 담는다.
        title: '비용 최적화 — 중복 기능 SaaS 통합 후보',
        note: saasCons.length ? `같은 기능 분류에 2종 이상 서비스 — ${saasCons.length}개 분류 통합 검토` : '중복 기능 SaaS 통합 후보가 없습니다.',
        columns: ['기능 분류', '중복 서비스', '서비스 수', '사용자 합', '통합 권고'],
        rows: saasCons.map((r) => [
          r.category,
          r.services.map((x) => `${x.service}(${x.sanctioned ? '인가' : '미인가'})`).join(' · '),
          String(r.services.length),
          String(r.users),
          r.sanctioned ? `인가 ${r.sanctioned.service} 기준 통합 — 미인가 ${r.shadowN}종 정리` : `미인가 ${r.shadowN}종 중복 — 카탈로그 등재 후 1종 통합`,
        ]),
      },
    ]
  }

  if (kind === '재물조사 결과 요약') {
    return [
      {
        title: '조사 회차별 진행 현황',
        columns: ['회차', '범위', '계획', '스캔', '진행률', '차이', '기한', '상태'],
        rows: s.inventoryRounds.map((r) => [
          r.name, r.scope, String(r.planned), String(r.scanned),
          `${roundProgressPct(r)}%`, String(r.mismatched), r.dueDate, r.status,
        ]),
      },
      {
        title: '차이 항목 — 미확인 자산',
        note: '대장에 있으나 일정 기간 실측되지 않은 자산 (유휴·분실 후보)',
        columns: ['발견 ID', '호스트명', '최근 실측', '비고'],
        rows: s.discovered.filter((d) => d.state === '미확인').map((d) => [d.id, d.hostname, d.lastSeen, d.note ?? '-']),
      },
      {
        // 실사에서 확인된 차이(surveyDiffs) 상세 — 유형·대장/실사 대조·조정 결과(resolution). 감사에서 "무엇이 어긋났고 어떻게 조정됐는지" 증빙.
        title: '차이 상세 · 조정 결과',
        note: '실사 차이 항목과 조정 결과(대장 보정·분실 처리·신규 등록) — 유형별 대장 대조 및 감사 추적',
        columns: ['자산번호', '유형', '대장(기대)', '실사(실측)', '상태', '조정 결과'],
        rows: s.surveyDiffs.length
          ? s.surveyDiffs.map((d) => [d.assetNo, d.kind, d.expected, d.actual, d.status, d.resolution ?? '-'])
          : [['-', '-', '-', '-', '-', '확인된 차이 없음']],
      },
      {
        title: '조정 결재 대상',
        bullets: [
          `누적 차이 ${s.inventoryRounds.reduce((n, r) => n + r.mismatched, 0)}건`,
          `유형별 분포 — ${(['위치 불일치', '상태 불일치', '미확인 (실사 없음)', '대장 미등록'] as const).map((k) => `${k} ${s.surveyDiffs.filter((d) => d.kind === k).length}`).join(' · ')}`,
          `조정 완료 ${s.surveyDiffs.filter((d) => d.status === '조정 완료').length}건 · 미해결 ${s.surveyDiffs.filter((d) => d.status !== '조정 완료').length}건`,
          `차이 조정 결재는 필수 결재 — 결재선: ${s.approvalLines.find((l) => l.kind === '차이 조정')?.steps.join(' → ') ?? '-'}`,
        ],
      },
    ]
  }

  if (kind === '연간 교체 계획') {
    const { cands, budget, residualBook } = replacementCandidates()
    const cats = [...new Set(cands.map((x) => x.a.category))]
    const warrN = cands.filter((x) => x.why.includes('보증')).length
    const agedN = cands.filter((x) => x.why.includes('내용연수')).length
    const failingN = cands.filter((x) => x.why.includes('잦은 장애')).length
    // OS 지원 종료(EOL) — 하드웨어 노후(내용연수·보증)와 별개의 교체·업그레이드 드라이버. 미패치 취약점 상시 노출.
    const t = today()
    const eolAssets = s.assets.filter((a) => !['폐기완료', '폐기예정'].includes(a.status) && eolOsOf(a.os, t))
    const eolSection: ReportSection = eolAssets.length === 0
      ? { title: 'OS 지원 종료(EOL) 자산 — 업그레이드·교체', bullets: ['OS 지원 종료가 경과한 운영 자산이 없습니다.'] }
      : {
          title: 'OS 지원 종료(EOL) 자산 — 업그레이드·교체',
          note: `${eolAssets.length}대 — 미패치 취약점 상시 노출, 하드웨어 노후와 별개 드라이버(내용연수 초과분과 일부 중복 가능)`,
          columns: ['자산번호', '유형', '모델', 'OS', '지원 종료', '업무 중요도'],
          rows: eolAssets.map((a) => {
            const e = eolOsOf(a.os, t)!
            return [a.assetNo, a.category, a.model, a.os ?? '-', `${e.label} (${e.eol} 경과)`, a.criticality ?? '일반']
          }),
        }
    return [
      {
        title: '교체 대상 자산',
        note: `총 ${cands.length}대 — 보증 경과 ${warrN} · 내용연수 초과 ${agedN} · 잦은 장애 ${failingN} · 잔여 장부가 ${fmtAmount(residualBook)}원`,
        columns: ['자산번호', '유형', '모델', '도입일', '보증만료', '잔존가치', '교체 사유'],
        rows: cands.map((x) => [x.a.assetNo, x.a.category, x.a.model, x.a.purchaseDate, x.a.warrantyEnd, `${x.book.toLocaleString()}원`, x.why]),
      },
      {
        title: '유형별 교체 수요 · 예산 추정',
        note: `총 추정 예산 ${fmtAmount(budget)}원 (내용연수 5년 · 유형별 표준 단가 기준)`,
        columns: ['유형', '대상 대수', '대당 추정 단가', '소계'],
        rows: cats.map((c) => {
          const cnt = cands.filter((x) => x.a.category === c).length
          const unit = ACQ_COST[c as keyof typeof ACQ_COST] ?? 0
          return [c, `${cnt}대`, `${fmtAmount(unit)}원`, `${fmtAmount(cnt * unit)}원`]
        }),
      },
      eolSection,
      {
        title: '우선순위 · 집행 계획',
        bullets: [
          `보증 경과 ${warrN}대는 장애 시 무상 수리가 불가 — 우선 교체 대상`,
          `수리중 자산 ${s.assets.filter((a) => a.status === '수리중').length}대는 수리 불가 판정 시 교체 대상에 편입`,
          `OS 지원 종료(EOL) ${eolAssets.length}대는 OS 업그레이드 또는 교체로 미패치 노출 해소 — 취약점 우선순위(P1) 연계 조치`,
          '예산 확정 후 노후·장애 이력 순으로 분기별 집행 계획 수립',
        ],
      },
    ]
  }

  if (kind === '취약점 조치 우선순위') {
    const { items, p1, p2, p3, bySource } = buildVulnPriority()
    // 위험도 기준(보안담당 관리) — 판정 컷오프를 리포트 문구에도 반영해 화면과 어긋나지 않게 한다.
    const { p1MinScore, p2MinScore } = s.riskPolicy
    return [
      {
        title: '조치 우선순위 요약',
        note: `미조치 취약점 ${items.length}건 — P1 즉시 ${p1} · P2 우선 ${p2} · P3 계획 ${p3} (위험도 기준 P1≥${p1MinScore}·P2≥${p2MinScore})`,
        columns: ['우선순위 등급', '건수', '판정 기준'],
        rows: [
          ['P1 (즉시 조치)', String(p1), `높은 심각도 × 높은 자산 중요도 (점수 ${p1MinScore} 이상)`],
          ['P2 (우선 조치)', String(p2), `중간 위험 결합 (점수 ${p2MinScore}~${p1MinScore - 1})`],
          ['P3 (계획 조치)', String(p3), `낮은 위험 결합 (점수 ${p2MinScore - 1} 이하)`],
        ],
      },
      {
        title: '출처별 취약점 분포',
        columns: ['출처', '건수'],
        rows: bySource.filter((x) => x.count > 0).map((x) => [x.source, String(x.count)]),
      },
      {
        title: '우선순위 상세 (점수순)',
        note: '자산 중요도 × 노출도 스코어링 · 미조치 취약점만',
        columns: ['등급', '점수', '출처', '대상', '상세', '노출도', '자산 중요도'],
        rows: items.map((v) => [v.tier, String(v.score), v.source, v.target, v.detail, v.severity, v.criticality]),
      },
    ]
  }

  if (kind === '부서별 IT 비용 배분') {
    const t = today()
    // 운영 자산(폐기완료 제외)의 원가를 소유 부서로 배분 — SW·가상자원 등 취득원가가 없는 항목은 제외
    const valued = s.assets.filter((a) => a.status !== '폐기완료' && acquisitionCostOf(a) > 0)
    const dc = new Map<string, { n: number; acq: number; book: number; repair: number }>()
    for (const a of valued) {
      const d = a.dept || '미지정'
      const r = dc.get(d) ?? { n: 0, acq: 0, book: 0, repair: 0 }
      r.n += 1
      r.acq += acquisitionCostOf(a)
      r.book += bookValueOf(a, t)
      r.repair += repairTotalOf(a)
      dc.set(d, r)
    }
    const deptRows = [...dc.entries()].sort((x, y) => y[1].acq - x[1].acq)
    // 라이선스 좌석 비용 — 배정 좌석의 라이선스 단가를 좌석 부서로 배분(해지 라이선스 제외)
    const sc = new Map<string, { seats: number; cost: number }>()
    for (const l of s.licenses) {
      if (l.status === '해지') continue
      for (const st of l.seats ?? []) {
        const d = st.dept || '미지정'
        const r = sc.get(d) ?? { seats: 0, cost: 0 }
        r.seats += 1
        r.cost += l.unitCost
        sc.set(d, r)
      }
    }
    const seatRows = [...sc.entries()].sort((x, y) => y[1].cost - x[1].cost)
    // 유지보수 계약비 — 계약 총액을 주관 부서로 배분(해지 제외). 구매 계약은 자산 취득가·라이선스 좌석과
    //  중복 계상이라 제외하고, 자산 취득가에 잡히지 않는 상시 서비스 비용(유지보수)만 부서로 귀속한다.
    const mc = new Map<string, { n: number; cost: number }>()
    for (const c of s.contracts) {
      if (c.kind !== '유지보수' || c.status === '해지') continue
      const d = c.ownerDept || '미지정'
      const r = mc.get(d) ?? { n: 0, cost: 0 }
      r.n += 1
      r.cost += c.amount
      mc.set(d, r)
    }
    const mcRows = [...mc.entries()].sort((x, y) => y[1].cost - x[1].cost)
    const totalAcq = deptRows.reduce((n, [, v]) => n + v.acq, 0)
    const totalBook = deptRows.reduce((n, [, v]) => n + v.book, 0)
    const totalRepair = deptRows.reduce((n, [, v]) => n + v.repair, 0)
    const totalSeat = seatRows.reduce((n, [, v]) => n + v.cost, 0)
    const totalMc = mcRows.reduce((n, [, v]) => n + v.cost, 0)
    const top = deptRows[0]
    return [
      {
        title: '부서별 IT 자산 원가',
        note: '운영 자산(폐기완료 제외) · 정액법 감가상각(내용연수 5년 기준 잔존가치) · 취득원가 없는 SW·가상자원 제외',
        columns: ['부서', '자산 수', '취득가', '잔존가치(장부가)', '누적 유지보수비'],
        rows: [
          ...deptRows.map(([d, v]) => [
            d,
            String(v.n),
            `${fmtAmount(v.acq)}원`,
            `${fmtAmount(v.book)}원`,
            v.repair > 0 ? `${fmtAmount(v.repair)}원` : '-',
          ]),
          // 합계 행 — 전사 IT 자산 원가·잔존가치·누적 유지보수비를 표 안에서 바로 확인(차지백·예산 근거)
          ['합계', String(deptRows.reduce((n, [, v]) => n + v.n, 0)), `${fmtAmount(totalAcq)}원`, `${fmtAmount(totalBook)}원`, `${fmtAmount(totalRepair)}원`],
        ],
      },
      {
        title: '부서별 라이선스 좌석 비용',
        note: '배정 라이선스 좌석의 단가를 좌석 배정 부서로 배분(해지 라이선스 제외) — 연간 구독 기준',
        columns: ['부서', '배정 좌석', '좌석 비용(단가 합)'],
        rows: seatRows.length
          ? [
              ...seatRows.map(([d, v]) => [d, `${v.seats}석`, `${fmtAmount(v.cost)}원`]),
              ['합계', `${seatRows.reduce((n, [, v]) => n + v.seats, 0)}석`, `${fmtAmount(totalSeat)}원`],
            ]
          : [['-', '0석', '배정 좌석 없음']],
      },
      {
        title: '부서별 유지보수 계약 비용',
        note: '유지보수 계약 총액을 주관 부서로 배분(해지 제외) — 구매 계약은 자산 취득가·라이선스와 중복이라 제외',
        columns: ['부서', '계약 수', '유지보수 계약비'],
        rows: mcRows.length
          ? [
              ...mcRows.map(([d, v]) => [d, `${v.n}건`, `${fmtAmount(v.cost)}원`]),
              ['합계', `${mcRows.reduce((n, [, v]) => n + v.n, 0)}건`, `${fmtAmount(totalMc)}원`],
            ]
          : [['-', '0건', '유지보수 계약 없음']],
      },
      {
        title: '배분 요약',
        note: '차지백·부서 예산 배정 근거 — 자산 원가·라이선스 좌석·유지보수 계약비를 부서로 귀속',
        bullets: [
          `IT 자산 취득가 합계 ${fmtAmount(totalAcq)}원 · 현재 장부가(잔존가치) ${fmtAmount(totalBook)}원 · 누적 유지보수비 ${fmtAmount(totalRepair)}원`,
          `라이선스 좌석 비용 합계 ${fmtAmount(totalSeat)}원 (배정 좌석 ${seatRows.reduce((n, [, v]) => n + v.seats, 0)}석 기준)`,
          `유지보수 계약비 합계 ${fmtAmount(totalMc)}원 (유지보수 계약 ${mcRows.reduce((n, [, v]) => n + v.n, 0)}건 · 주관 부서 기준)`,
          top ? `최고 원가 부서: ${top[0]} — 취득가 ${fmtAmount(top[1].acq)}원 · 자산 ${top[1].n}대` : '배분 대상 자산 없음',
          '배분 기준: 유형 자산은 소유 부서, 라이선스는 좌석 배정 부서, 유지보수 계약은 주관 부서로 귀속. 소유·부서 미지정 항목은 "미지정"으로 집계하며 자산관리팀 확인 대상.',
        ],
      },
    ]
  }

  if (kind === '계약 관리 현황') {
    const live = s.contracts.filter((c) => c.status !== '해지')
    const purchase = live.filter((c) => c.kind === '구매')
    const maintC = live.filter((c) => c.kind === '유지보수')
    const isExpiring = (c: (typeof live)[number]) => {
      const d = daysUntil(c.end)
      return d !== null && d <= 90
    }
    const expiring = live.filter(isExpiring).sort((a, b) => (daysUntil(a.end) ?? 0) - (daysUntil(b.end) ?? 0))
    const mb = buildMaintenance()
    const proc = buildProcurement()
    const docGap = live.filter((c) => missingContractDocs(c).length > 0)
    const sumAmt = (list: typeof live) => list.reduce((n, c) => n + c.amount, 0)
    const ddayLabel = (end: string) => {
      const d = daysUntil(end)
      return d === null ? '-' : d >= 0 ? `D-${d}` : `D+${-d}`
    }
    return [
      {
        title: '계약 포트폴리오 요약',
        note: '유효 계약(해지 제외) — 구분별 계약 수·총 계약액·만료 임박(D-90 이내)',
        columns: ['구분', '계약 수', '총 계약액', '만료 임박(D-90)'],
        rows: [
          ['구매 계약', String(purchase.length), `${fmtAmount(sumAmt(purchase))}원`, String(purchase.filter(isExpiring).length)],
          ['유지보수 계약', String(maintC.length), `${fmtAmount(sumAmt(maintC))}원`, String(maintC.filter(isExpiring).length)],
        ],
      },
      {
        title: '만료 임박 계약 (D-90 이내)',
        note: '갱신·정산·재계약 검토 대상 — D-day 오름차순',
        columns: ['계약', '구분', '공급사', '만료일', '기한'],
        rows: expiring.length
          ? expiring.map((c) => [c.name, c.kind, c.vendor, c.end, ddayLabel(c.end)])
          : [['-', '-', '-', '-', '만료 임박 계약 없음']],
      },
      {
        title: '유지보수 예산 집행',
        note: '유지보수 계약 누계 지출 대비 계약액 — 집행률·판정(예산 초과·소진 임박·미집행)',
        columns: ['계약', '계약액', '누계 지출', '집행률', '판정'],
        rows: mb.rows.length
          ? mb.rows.map((r) => [r.name, `${fmtAmount(r.amount)}원`, `${fmtAmount(r.spent)}원`, `${r.rate}%`, r.status])
          : [['-', '-', '-', '-', '유지보수 계약 없음']],
      },
      {
        title: '구매 발주 이행',
        note: '구매 계약 입고 로트 대사 — 발주 소진률·검수 완료액(정산 근거)·이행 판정',
        columns: ['계약', '계약액', '발주 입고액', '발주율', '이행 판정'],
        rows: proc.rows.length
          ? proc.rows.map((r) => [r.name, `${fmtAmount(r.amount)}원`, `${fmtAmount(r.orderedValue)}원`, `${r.rate}%`, r.atRisk ? '발주 미이행' : r.pendingInspection > 0 ? '검수 진행' : '정상'])
          : [['-', '-', '-', '-', '입고 연계 구매 계약 없음']],
      },
      {
        title: '계약 거버넌스 점검',
        note: '계약 이행·정산·문서 리스크 — 조치 대상',
        bullets: [
          `만료 임박 계약 ${expiring.length}건 (D-90 이내) — 갱신·정산·재계약 검토`,
          `발주 미이행 위험 ${proc.atRisk.length}건 — 발주율 저조 + 만료 임박(집행·정산 종결 필요)`,
          `유지보수 예산 초과 ${mb.overBudget}건 — 추가 예산·재협상 대상`,
          `SLA 미설정 유지보수 계약 ${mb.noSla}건 — 서비스 수준 협약(장애 대응·가동률) 기록 필요`,
          `부속서류 미비 계약 ${docGap.length}건 — 계약서·견적서·세금계산서 등 근거 문서 보완`,
        ],
      },
    ]
  }

  if (kind === 'AI 거버넌스·성능') {
    const p = s.aiPolicy
    const INSIGHT_KINDS = ['자동분류', '이상탐지', '수명예측', '취약점 우선순위', '라이선스 최적화'] as const
    const approved = s.insights.filter((i) => i.status === '승인').length
    const rejected = s.insights.filter((i) => i.status === '반려').length
    const pending = s.insights.filter((i) => i.status === '제안').length
    const adoption = approved + rejected ? Math.round((approved / (approved + rejected)) * 100) : null
    return [
      {
        title: '모델 · 프롬프트 · 실행 환경',
        columns: ['항목', '값'],
        rows: [
          ['실행 환경', p.deployment],
          ['모델', p.modelId],
          ['프롬프트 버전', p.promptVersion],
          ['분류 정확도', `${effectiveClassifyAccuracy(p, s.insights)}%`],
        ],
      },
      {
        title: 'AI 기능별 제안 채택률 (재학습 신호)',
        note: `판정 대기 ${pending} · 누적 판정 ${approved + rejected}건 · 전체 채택률 ${adoption === null ? '판정 전' : `${adoption}%`}`,
        columns: ['기능', '제안', '승인', '반려', '채택률'],
        rows: INSIGHT_KINDS.map((k) => {
          const rows = s.insights.filter((i) => i.kind === k)
          const ok = rows.filter((i) => i.status === '승인').length
          const no = rows.filter((i) => i.status === '반려').length
          return [k, String(rows.length), String(ok), String(no), ok + no ? `${Math.round((ok / (ok + no)) * 100)}%` : '판정 전']
        }),
      },
      {
        title: 'AI 거버넌스 준수',
        bullets: [
          `AI 제안·질의·응답 감사 로그 보존 ${p.auditRetentionDays}일`,
          `권한 범위 필터 ${p.scopeFilter ? '적용 — 권한 밖 데이터는 질의 컨텍스트에서 원천 배제' : '미적용'}`,
          `AI 제안 자동승인 ${p.autoApprove ? '허용' : '차단 — 담당자 확인·결재 원칙'}`,
          `판정 결과 재학습 환류 ${p.feedbackLearning ? '적용 — 승인·반려가 정확도 개선에 반영' : '미적용'}`,
        ],
      },
    ]
  }

  if (kind === '정보보호 컴플라이언스 증적') {
    // ISMS/ISO 27001 통제별 증적 — 기존 대장·라이선스·폐기·위협 데이터를 감사 대응 번들로 집약(추가 데이터 없음).
    const liveC = s.assets.filter((a) => a.status !== '폐기완료')
    const unregC = s.discovered.filter((d) => d.state === '미등록').length
    const flaggedC = liveC.filter(hasDataIssue).length
    const accuracyC = liveC.length ? Math.round(((liveC.length - flaggedC) / liveC.length) * 100) : 100
    const byCatC = [...new Set(liveC.map((a) => a.category))].map((c) => [c, String(liveC.filter((a) => a.category === c).length)])
    const licC = s.licenses.filter((l) => l.status !== '해지')
    const disposedC = s.disposals.filter((d) => d.status === '완료')
    const vulnC = buildVulnPriority()
    return [
      {
        title: 'A.8.1 자산 인벤토리 통제',
        note: `대장 등록 운영 자산 ${liveC.length}건 · 미등록 발견 자산 ${unregC}건(편입 대상) · 대장 정합성(CMDB 정확도) ${accuracyC}%`,
        columns: ['자산 유형', '보유 대수'],
        rows: byCatC,
      },
      {
        title: 'A.9 접근 통제 · SW 라이선스 컴플라이언스',
        note: `라이선스 초과 사용 ${licC.filter((l) => l.used > l.purchased).length}종(감사 리스크) · 휴면 계정 미처리 ${s.accounts.filter((a) => !a.action).length}건`,
        columns: ['라이선스', '보유', '사용', '판정'],
        rows: licC.map((l) => [l.name, String(l.purchased), String(l.used), l.used > l.purchased ? '초과(구매 필요)' : l.used / l.purchased < 0.6 ? '미사용(회수 후보)' : '적정']),
      },
      {
        title: 'A.8.3 매체 폐기 · 데이터 소거 증적',
        note: `완료 폐기 ${disposedC.length}건 · 소거 방식 기록 ${disposedC.filter((d) => d.wipeMethod).length}건 (매체 처리 증적)`,
        columns: ['자산번호', '소거 방식', '물리 처분'],
        rows: disposedC.length ? disposedC.map((d) => [d.assetNo, d.wipeMethod ?? '-', d.disposition ?? '-']) : [['-', '완료 폐기 없음', '-']],
      },
      {
        title: 'A.12 운영 보안 (취약점 노출)',
        note: `조치 우선순위 P1 ${vulnC.p1}건 · P2 ${vulnC.p2}건 · 외부 노출 미조치 ${s.external.filter((e) => !e.action && e.state !== '등록·일치').length}건 · 크리덴셜 노출 미조치 ${s.credentials.filter((c) => c.status !== '조치 완료').length}건`,
        bullets: ['외부 CVE·EOL OS·미인가 SW·크리덴셜 노출을 자산 중요도와 결합해 P1/P2/P3로 순위화(취약점 조치 우선순위 리포트와 동일 산출).'],
      },
      {
        title: 'A.12.4 로깅 · 변경 추적',
        bullets: [
          `감사 로그 보존 ${s.auditLogs.length}건 — 자산·결재·정책 변경 추적`,
          `AI 제안·질의·응답 감사 로그 보존 ${s.aiPolicy.auditRetentionDays}일 · 권한 범위 필터 ${s.aiPolicy.scopeFilter ? '적용(권한 밖 데이터 원천 배제)' : '미적용'}`,
          `결재 워크플로 추적 — 완료(승인·반려) ${s.approvals.filter((a) => a.status === '승인' || a.status === '반려').length}건 · 대기 ${s.approvals.filter((a) => a.status === '대기').length}건`,
        ],
      },
    ]
  }

  if (kind === '라이선스 갱신·트루업 계획') {
    // 전방 갱신 계획 — 기존 라이선스(만료·보유·사용·단가) 집약. 컴플라이언스(시점 감사)와 달리 만료 임박·예상 갱신액·트루업 권고를 선제 제시.
    const loR = licenseOptimization()
    const ddayR = (l: (typeof loR.active)[number]) => daysUntil(l.expiry) ?? 9999
    const upcomingR = loR.active.filter((l) => l.expiry !== '-' && ddayR(l) <= 180).sort((a, b) => ddayR(a) - ddayR(b))
    const baseTerminatedR = (l: (typeof loR.active)[number]) => !!l.contractId && s.contracts.some((c) => c.id === l.contractId && c.status === '해지')
    const recosR = loR.active.map((l) => {
      const reco = baseTerminatedR(l) ? '근거 계약 해지 → 이관·재계약'
        : l.used > l.purchased ? `추가 구매(트루업) +${l.used - l.purchased}석 · 약 ${((l.used - l.purchased) * l.unitCost).toLocaleString()}원`
        : l.used / l.purchased < 0.6 ? `감축 갱신 -${l.purchased - l.used}석 · 절감 약 ${((l.purchased - l.used) * l.unitCost).toLocaleString()}원`
        : '현행 갱신'
      return [l.name, `${l.used}/${l.purchased}`, reco]
    })
    return [
      {
        title: '갱신 예정 (만료 180일 이내)',
        note: `갱신 예정 ${upcomingR.length}종 · 예상 갱신액 ${fmtAmount(upcomingR.reduce((n, l) => n + l.purchased * l.unitCost, 0))}원`,
        columns: ['라이선스', '만료일', 'D-day', '보유', '사용', '예상 갱신액'],
        rows: upcomingR.length ? upcomingR.map((l) => [l.name, l.expiry, ddayR(l) < 0 ? `경과 ${-ddayR(l)}일` : `D-${ddayR(l)}`, String(l.purchased), String(l.used), `${(l.purchased * l.unitCost).toLocaleString()}원`]) : [['-', '만료 임박 라이선스 없음', '-', '-', '-', '-']],
      },
      {
        title: '트루업 권고',
        note: `초과 사용 ${loR.over.length}종(추가 구매·트루업) · 미사용 ${loR.under.length}종(감축 갱신)`,
        columns: ['라이선스', '사용/보유', '갱신 권고'],
        rows: recosR,
      },
      {
        title: '갱신 예산 · 절감 요약',
        bullets: [
          `만료 180일 이내 예상 갱신액 ${fmtAmount(upcomingR.reduce((n, l) => n + l.purchased * l.unitCost, 0))}원`,
          `트루업(초과 사용 해소) 추가 비용 약 ${fmtAmount(loR.overCost)}원`,
          `미사용 좌석 감축 시 연 약 ${fmtAmount(loR.saving)}원 절감`,
        ],
      },
    ]
  }

  if (kind === '단일 장애점·영향 분석') {
    // 영향 범위 2대 이상(단일 장애점)·저하 상위(즉시 전이 리스크)를 CMDB 의존 그래프에서 산출.
    // 화면(대시보드 blast radius 큐·자산 카드 토폴로지)과 같은 lib/cmdb 단일 소스를 쓴다.
    const spof = criticalDependencies() // blast ≥2, 저하 우선 정렬
    const degraded = impactSources() // 현재 저하 상태이면서 하위 의존이 있는 상위
    return [
      {
        title: '단일 장애점 (SPOF · 영향 범위 2대 이상)',
        note: spof.length
          ? `단일 장애점 ${spof.length}건 · 이 중 현재 저하 상태 ${spof.filter((x) => x.degraded).length}건(즉시 리스크) · 최대 영향 ${spof[0].blastRadius.length}대`
          : '영향 범위 2대 이상 자산 없음 — 단일 장애점 미검출',
        columns: ['자산번호', '유형', '상태', '영향 대수', '영향 자산(blast radius)'],
        rows: spof.length
          ? spof.map((x) => [x.asset.assetNo, x.asset.category, x.asset.status, `${x.blastRadius.length}대`, x.blastRadius.join(', ')])
          : [['-', '-', '-', '-', '단일 장애점 없음']],
      },
      {
        title: '저하 상태 상위 자산 (즉시 조치)',
        note: degraded.length
          ? `분실·폐기·수리 등 저하 상태이면서 하위 의존이 있는 상위 ${degraded.length}건 — 장애가 하위로 전이됩니다`
          : '저하 상태로 하위에 위험을 주는 상위 자산 없음',
        columns: ['자산번호', '유형', '상태', '영향 대수', '영향 자산'],
        rows: degraded.length
          ? degraded.map((x) => [x.asset.assetNo, x.asset.category, x.asset.status, `${x.blastRadius.length}대`, x.blastRadius.join(', ')])
          : [['-', '-', '-', '-', '저하 상위 없음']],
      },
      {
        title: '이중화 · 조치 권고',
        bullets: [
          spof.length ? `영향 범위 상위 ${Math.min(3, spof.length)}건을 이중화(HA)·백업 경로 우선 대상으로 검토하십시오.` : '이중화 우선 대상 단일 장애점이 없습니다.',
          degraded.length ? `저하 상태 상위 ${degraded.length}건은 하위 자산으로 장애가 전이되므로 우선 복구·교체가 필요합니다.` : '저하 상태로 하위에 위험을 주는 상위 자산이 없습니다.',
          '자산별 상위 의존·영향 범위는 자산 대장 상세(의존 토폴로지)·자산 카드에서 확인할 수 있습니다.',
        ],
      },
    ]
  }

  if (kind === '자산 운영 리스크') {
    // 운영 리스크(분실·미실측·연체·수리 지연·수령 미확인)를 한 문서로 집약 — 어시스턴트 '운영 리스크 자산' 인라인 답변의 리포트판(export).
    //  대시보드 운영 큐·대장 필터와 같은 판정(단일 소스)을 쓴다.
    const lost = s.assets.filter((a) => a.status === '분실')
    const stale = s.assets.filter((a) => isStaleVerify(a, s.opsPolicy.staleVerifyDays))
    const overdue = s.assets.filter(isLoanOverdue)
    const repairLate = s.assets.filter((a) => a.status === '수리중' && isRepairOverdue(a))
    const receiptPend = s.assets.filter((a) => a.receiptPending && a.status === '사용중')
    const total = lost.length + stale.length + overdue.length + repairLate.length + receiptPend.length
    const sec = (title: string, note: string, arr: typeof lost, detail: (a: (typeof lost)[number]) => string): ReportSection => ({
      title,
      note,
      columns: ['자산번호', '유형', '모델', '소유자 · 부서', '상세'],
      rows: arr.length ? arr.map((a) => [a.assetNo, a.category, a.model, `${a.owner} · ${a.dept}`, detail(a)]) : [['-', '-', '-', '-', '해당 없음']],
    })
    return [
      sec('분실·도난 자산 (회수·폐기 확정 대상)', `분실 상태 ${lost.length}건`, lost, (a) => `상태 ${a.status} · 최종 보유 ${a.owner}`),
      sec('장기 미실측 (유령 자산 후보 · 재물조사 편성)', `최근 실측 ${s.opsPolicy.staleVerifyDays}일 초과·없음 ${stale.length}건`, stale, (a) => `최근 실측 ${a.lastVerifiedAt ?? '없음'}`),
      sec('대여 반환 연체 (반환 독촉)', `연체 ${overdue.length}건`, overdue, (a) => `반환 기한 ${a.loanDueDate ?? '-'} 경과 · 대여자 ${a.owner}`),
      sec('수리 지연 (예상 반환 경과 · 업체 독촉)', `예상 반환 경과 ${repairLate.length}건`, repairLate, (a) => `${a.repair?.vendor ?? '업체 미배정'}${a.repair?.eta ? ` · 예상반환 ${a.repair.eta}` : ''}`),
      sec('수령 미확인 (불출 후 인수 대기)', `인수 미확인 ${receiptPend.length}건`, receiptPend, (a) => `불출 후 인수 확인 대기 · ${a.owner}`),
      {
        title: '종합 · 조치 권고',
        bullets: [
          `운영 리스크 총 ${total}건 — 분실 ${lost.length} · 미실측 ${stale.length} · 연체 ${overdue.length} · 수리 지연 ${repairLate.length} · 수령 미확인 ${receiptPend.length}.`,
          '분실은 회수·폐기 확정, 장기 미실측은 수시 재물조사 편성, 대여 연체는 반환 독촉, 수리 지연은 업체 독촉, 수령 미확인은 수령 확인 독촉으로 처리하십시오.',
          '각 항목은 대시보드 운영 큐·자산 대장 필터(분실·장기 미실측·수령 미확인 등)에서 조치 화면으로 연결됩니다.',
        ],
      },
    ]
  }

  if (kind === '복합 위험 자산') {
    // 정합성·EOL·보증·정기점검·SPOF·교체·미실측 중 2+ 신호가 겹치는 자산 — 대장 ?risk=1 필터·대시보드 복합 위험 큐와
    //  같은 판정(lib/risk 단일 소스). '자산 운영 리스크'(분실·연체 등 보유상태)와 달리 기술·수명주기 신호의 중첩을 본다.
    const t = today()
    const liveR = s.assets.filter((a) => a.status !== '폐기완료')
    const riskNos = new Set(compositeRiskAssetNos(liveR))
    const rows = liveR
      .map((a) => ({ a, sigs: riskSignals(a) }))
      .filter((x) => riskNos.has(x.a.assetNo))
      .sort((x, y) => y.sigs.length - x.sigs.length)
    // 신호별 출현 빈도 — 복합 위험 자산에서 어떤 신호가 가장 자주 겹치는지(선제 개선 포인트)
    const SIGNALS = ['정합성 미흡', 'EOL OS', '보증 임박', '정기 점검 도래', '단일 장애점', '교체 대상', '장기 미실측']
    const freq = SIGNALS.map((sig) => [sig, String(rows.filter((x) => x.sigs.includes(sig)).length)]).filter((r) => r[1] !== '0')
    // 부서별 분포
    const byDept = [...new Set(rows.map((x) => x.a.dept || '미지정'))]
      .map((d) => ({ d, n: rows.filter((x) => (x.a.dept || '미지정') === d).length }))
      .sort((p, q) => q.n - p.n)
    const three = rows.filter((x) => x.sigs.length >= 3).length
    return [
      {
        title: '복합 위험 자산 (주의 신호 2개 이상 중첩)',
        note: rows.length === 0
          ? `운영 자산 ${liveR.length}건 중 복합 위험 없음 — 신호가 2개 이상 겹치는 자산이 없습니다`
          : `운영 자산 ${liveR.length}건 중 복합 위험 ${rows.length}건 (신호 3개 이상 ${three}건) — 신호 수 내림차순`,
        columns: ['자산번호', '유형', '모델', '소유자 · 부서', '신호 수', '중첩 신호'],
        rows: rows.length
          ? rows.map((x) => [x.a.assetNo, x.a.category, x.a.model, `${x.a.owner} · ${x.a.dept}`, String(x.sigs.length), x.sigs.join(', ')])
          : [['-', '-', '-', '-', '-', '해당 없음']],
      },
      {
        title: '신호별 출현 빈도 (선제 개선 포인트)',
        note: '복합 위험 자산에서 자주 겹치는 신호 — 근본 원인을 먼저 줄이면 복합 위험이 함께 낮아진다',
        columns: ['위험 신호', '해당 자산'],
        rows: freq.length ? freq : [['-', '해당 없음']],
      },
      {
        title: '부서별 분포',
        columns: ['부서', '복합 위험 자산'],
        rows: byDept.length ? byDept.map((x) => [x.d, String(x.n)]) : [['-', '해당 없음']],
      },
      {
        title: '종합 · 조치 권고',
        bullets: rows.length === 0
          ? ['복합 위험(주의 신호 2개 이상 중첩) 자산이 없습니다. 단일 신호는 각 화면(교체 대상·보증 임박·정기 점검 등)에서 개별 관리하십시오.']
          : [
              `복합 위험 총 ${rows.length}건 — 신호 3개 이상 ${three}건을 최우선 조치 대상으로 봅니다.`,
              '신호가 중첩된 자산은 단일 조치로 여러 위험을 동시에 해소할 수 있어(예: 교체 시 EOL·보증·정기 점검 동시 해소) 우선순위가 높습니다.',
              '대장 복합 위험 필터(?risk=1)·대시보드 복합 위험 큐에서 자산별 조치 화면(교체 검토·재물조사 편성·정합성 보정)으로 연결됩니다.',
            ],
      },
    ]
  }

  if (kind === '감가상각 명세') {
    // 정액법(내용연수 5년) 연도별 감가상각 전개 — bookValueOf 단일 소스를 연말 날짜로 호출해 상각 곡선을 산출한다(공식 재구현 없음).
    //  부서별 IT 비용 배분(현재 잔존가 스냅샷)과 달리 전방 연도별 상각액·상각 완료 시점을 보여 고정자산 회계·재취득 예산에 쓴다.
    const t = today()
    const curY = Number(t.slice(0, 4))
    const dep = s.assets.filter((a) => a.status !== '폐기완료' && acquisitionCostOf(a) > 0)
    const yearEnd = (y: number) => `${y}-12-31`
    const bookAtEnd = (y: number) => dep.reduce((n, a) => n + bookValueOf(a, yearEnd(y)), 0)
    const totalAcq = dep.reduce((n, a) => n + acquisitionCostOf(a), 0)
    const nowBook = dep.reduce((n, a) => n + bookValueOf(a, t), 0)
    const years: string[][] = []
    let prevBook = bookAtEnd(curY - 1) // 올해 연초 = 전년말 장부가
    let futureDep = 0
    for (let y = curY; y <= curY + USEFUL_LIFE_YEARS; y++) {
      const endBook = bookAtEnd(y)
      const annual = Math.max(0, prevBook - endBook)
      const doneCount = dep.filter((a) => bookValueOf(a, yearEnd(y - 1)) > 0 && bookValueOf(a, yearEnd(y)) === 0).length
      years.push([String(y), prevBook.toLocaleString(), annual.toLocaleString(), endBook.toLocaleString(), String(doneCount)])
      futureDep += annual
      prevBook = endBook
    }
    const catRows = [...new Set(dep.map((a) => a.category))].map((c) => {
      const arr = dep.filter((a) => a.category === c)
      const acq = arr.reduce((n, a) => n + acquisitionCostOf(a), 0)
      const book = arr.reduce((n, a) => n + bookValueOf(a, t), 0)
      const pct = acq > 0 ? Math.floor(((acq - book) / acq) * 100) : 0
      return [c, String(arr.length), acq.toLocaleString(), Math.round(acq / USEFUL_LIFE_YEARS).toLocaleString(), book.toLocaleString(), `${pct}%`]
    })
    return [
      {
        title: `연도별 감가상각 명세 (정액법 · 내용연수 ${USEFUL_LIFE_YEARS}년)`,
        note: `운영 실물 자산 ${dep.length}대 · 총 취득가 ${totalAcq.toLocaleString()}원 · 현재 잔존가(장부가) ${nowBook.toLocaleString()}원 — 향후 ${USEFUL_LIFE_YEARS + 1}개 연도 전개(연말 기준)`,
        columns: ['연도', '연초 장부가', '연간 상각액', '연말 장부가', '상각 완료 대수'],
        rows: years,
      },
      {
        title: '유형별 상각 현황 (현재)',
        note: '유형별 취득가·연간 상각액(취득가÷내용연수)·현재 잔존가·상각률 — SW·가상자원(자산 단위 취득가 없음) 제외',
        columns: ['유형', '대수', '총 취득가', '연간 상각액', '현재 잔존가', '상각률'],
        rows: catRows.length ? catRows : [['-', '0', '0', '0', '0', '0%']],
      },
      {
        title: '요약 · 회계 활용',
        bullets: [
          `운영 실물 자산 ${dep.length}대의 총 취득가는 ${totalAcq.toLocaleString()}원, 현재 잔존가(장부가)는 ${nowBook.toLocaleString()}원입니다(누적 상각 ${(totalAcq - nowBook).toLocaleString()}원).`,
          `${curY}년 상각 예정액은 ${years[0]?.[2] ?? '0'}원이며, 향후 ${USEFUL_LIFE_YEARS + 1}개 연도에 걸쳐 총 ${futureDep.toLocaleString()}원이 상각됩니다.`,
          '연도별 상각액은 감가상각비 예산·고정자산 명세에, 상각 완료(잔존가 0) 시점은 재취득(교체) 예산 타이밍의 근거로 활용합니다. 자산별 상세는 대장 엑셀 내보내기(잔존가치 열)로 확인합니다.',
        ],
      },
    ]
  }

  if (kind === '계약 갱신 전망') {
    // 계약 만료(=갱신 시점)를 분기 버킷으로 전방 전개해 갱신 예산·현금흐름을 계획한다. 계약 관리 현황(현재 포트폴리오·D-90 스냅샷)과 달리 다분기 전망.
    //  갱신액 추정은 현재 계약액(amount) 기준(갱신 시 유사 규모 가정) — 라이선스 갱신·트루업(라이선스 엔티티)과 별개로 구매·유지보수 계약을 다룬다.
    const t = today()
    const live2 = s.contracts.filter((c) => c.status !== '해지')
    const qKey = (d: string) => { const y = Number(d.slice(0, 4)); const m = Number(d.slice(5, 7)); return y * 4 + Math.floor((m - 1) / 3) }
    const curKey = qKey(t)
    const HORIZON = 8
    const buckets = new Map<number, { label: string; count: number; amount: number; maint: number; purch: number }>()
    for (let i = 0; i < HORIZON; i++) {
      const key = curKey + i
      buckets.set(key, { label: `${Math.floor(key / 4)} Q${(key % 4) + 1}`, count: 0, amount: 0, maint: 0, purch: 0 })
    }
    const horizonEnd = curKey + HORIZON - 1
    let overdueN = 0
    let overdueAmt = 0
    for (const c of live2) {
      if (c.end < t) { overdueN += 1; overdueAmt += c.amount; continue }
      const b = buckets.get(qKey(c.end))
      if (b) { b.count += 1; b.amount += c.amount; if (c.kind === '유지보수') b.maint += c.amount; else b.purch += c.amount }
    }
    const bucketList = [...buckets.values()]
    const totalHorizon = bucketList.reduce((n, b) => n + b.amount, 0)
    const soon = live2.filter((c) => c.end >= t && qKey(c.end) <= horizonEnd).sort((a, b) => a.end.localeCompare(b.end)).slice(0, 15)
    const peak = bucketList.reduce((mx, b) => (b.amount > mx.amount ? b : mx), bucketList[0])
    return [
      {
        title: '분기별 갱신 전망 (향후 8개 분기)',
        note: overdueN > 0
          ? `향후 8개 분기 갱신 예상 총액 ${fmtAmount(totalHorizon)}원 · 만료 경과(미갱신) ${overdueN}건 ${fmtAmount(overdueAmt)}원 — 갱신 예산·현금흐름 계획`
          : `향후 8개 분기 갱신 예상 총액 ${fmtAmount(totalHorizon)}원 — 갱신 예산·현금흐름 계획`,
        columns: ['분기', '만료 계약', '예상 갱신액', '유지보수', '구매'],
        rows: [
          ...bucketList.map((b) => [b.label, String(b.count), b.amount.toLocaleString(), b.maint.toLocaleString(), b.purch.toLocaleString()]),
          // 합계 행 — 분기별 갱신 예산의 지평 총액을 표 안에서 바로 확인(예산 계획용). 금액은 네이티브 숫자 셀로 반출돼 회계가 합산·검산 가능.
          ['합계', String(bucketList.reduce((n, b) => n + b.count, 0)), totalHorizon.toLocaleString(), bucketList.reduce((n, b) => n + b.maint, 0).toLocaleString(), bucketList.reduce((n, b) => n + b.purch, 0).toLocaleString()],
        ],
      },
      {
        title: '갱신 임박 계약 상세 (기한순)',
        note: soon.length ? `향후 8개 분기 내 만료 예정 ${soon.length}건 (최대 15건 표시)` : '향후 8개 분기 내 만료 예정 계약이 없습니다',
        columns: ['계약', '구분', '공급사', '만료일', 'D-day', '갱신 예상액'],
        rows: soon.length
          ? soon.map((c) => [`${c.name} (${c.id})`, c.kind, c.vendor, c.end, `D-${daysUntil(c.end) ?? '-'}`, c.amount.toLocaleString()])
          : [['-', '-', '-', '-', '-', '해당 없음']],
      },
      {
        title: '요약 · 예산 계획',
        bullets: [
          `유효 계약 ${live2.length}건 중 향후 8개 분기 만료(갱신) 예정은 ${bucketList.reduce((n, b) => n + b.count, 0)}건, 예상 갱신 총액 ${fmtAmount(totalHorizon)}원입니다.`,
          peak && peak.amount > 0 ? `갱신 집중 분기는 ${peak.label}(${fmtAmount(peak.amount)}원)로, 이 시점 예산을 선제 확보해야 합니다.` : '해당 지평 내 만료 예정 계약이 없습니다.',
          overdueN > 0
            ? `만료 경과(미갱신) ${overdueN}건 ${fmtAmount(overdueAmt)}원은 갱신 또는 해지 판단이 지연된 건으로, 우선 정리가 필요합니다.`
            : '만료 경과(미갱신) 계약은 없습니다 — 갱신·해지 판단이 적시에 이뤄지고 있습니다.',
        ],
      },
    ]
  }

  // 감사 대응 자료
  const live = s.assets.filter((a) => a.status !== '폐기완료')
  const flagged = live.filter(hasDataIssue)
  const accuracy = live.length ? Math.round(((live.length - flagged.length) / live.length) * 100) : 100
  const dqSection: ReportSection = flagged.length === 0
    ? { title: '대장 정합성 (CMDB 정확도)', note: `운영 자산 ${live.length}건 · 정확도 ${accuracy}% — 핵심 필드 누락·불일치 없음`, bullets: ['소유자·시리얼·위치 등 핵심 필드 누락·불일치 자산이 없습니다.'] }
    : {
        title: '대장 정합성 (CMDB 정확도)',
        note: `운영 자산 ${live.length}건 중 정합성 미흡 ${flagged.length}건 · 정확도 ${accuracy}%`,
        columns: ['자산번호', '유형', '상태', '미흡 항목'],
        rows: flagged.map((a) => [a.assetNo, a.category, a.status, assetDataIssues(a).join(', ')]),
      }
  // 이상 자산 행위 탐지(§05 기능02) — 위협 '대응 현황'(검출·조치 카운트)과 달리, 미해결 이탈을 심각도 순으로 나열한 증적.
  // 특히 '유휴 자산 사용'(대장 유휴인데 실사에서 사용 중 = 미승인 불출)은 위협 카운트 섹션에 없는 행위 이상. 화면 패널·어시스턴트와 같은 buildAnomalies() 단일 소스.
  const anomalies = buildAnomalies()
  const anomalySection: ReportSection = anomalies.items.length === 0
    ? { title: '이상 자산 행위 탐지 (프로파일 이탈)', note: '평시 프로파일(설치 SW·상태·반출 패턴) 대비 미해결 이탈 없음', bullets: ['미인가 SW 설치·유휴 자산 사용·USB 대용량 반출 이탈이 없습니다.'] }
    : {
        title: '이상 자산 행위 탐지 (프로파일 이탈)',
        note: `미해결 이탈 ${anomalies.items.length}건 — ${anomalies.byKind.filter((k) => k.count).map((k) => `${k.kind} ${k.count}`).join(' · ')}`,
        columns: ['유형', '대상', '상세', '심각도', '판정 근거'],
        rows: anomalies.items.map((i) => [i.kind, i.target, i.detail, i.severity, i.basis]),
      }
  return [
    {
      title: '권한 통제 현황',
      note: '화면·기능 단위 최소권한 — 사용자에게는 매핑된 메뉴·기능만 노출',
      columns: ['계정', '이름', '부서', '권한그룹', 'MFA'],
      rows: s.users.map((u) => [u.login, u.name, u.dept, u.role, u.mfa ? '적용' : '미적용']),
    },
    dqSection,
    {
      title: '필수 결재 지정 화면',
      columns: ['화면', '결재 구분', '결재선'],
      rows: s.approvalLines.filter((l) => l.required).map((l) => [l.screen, l.kind, l.steps.join(' → ')]),
    },
    {
      title: '탐지 정책 이행',
      columns: ['채널', '방식', '대상', '시간대', '강도', '사용'],
      rows: s.scanPolicies.map((p) => [p.channel, p.kind, p.targets, p.window, p.intensity, p.enabled ? '사용' : '중지']),
    },
    {
      // 운영·거버넌스 정책 기준 — 화면·리포트·스케줄러가 강제하는 임계값과 AI 거버넌스 설정. "정책 이행"을 탐지 정책만이 아니라
      // 운영 기한·위험도 기준·AI 정책까지 증빙한다(§05 감사 대응 자료: 정책 이행, §07 감사 추적성).
      title: '운영 · 거버넌스 정책 기준',
      note: '화면·리포트·스케줄러가 공유·강제하는 임계값 — 정책 이행 증빙 (설정 변경은 감사 로그에 적재)',
      columns: ['정책 항목', '기준값', '적용 범위 · 관리 주체'],
      rows: [
        ['소유자 확인 기한', `${s.opsPolicy.confirmDeadlineDays}일`, '발견 자산 소유자 확인 — 경과 시 격리 에스컬레이션 (Admin)'],
        ['결재 SLA', `${s.opsPolicy.approvalSlaDays}일`, '결재 대기 지연 판정 — 대시보드·결재함 지연 표기 (Admin)'],
        ['장기 미실측 기준', `${s.opsPolicy.staleVerifyDays}일`, '유령 자산 후보 판정 — 재물조사 자동 편성 (Admin)'],
        ['만료 알림 창', `${s.opsPolicy.expiryWindowDays}일`, '계약·보증·라이선스 만료 임박 알림 (Admin)'],
        ['취약점 우선순위 P1', `점수 ${s.riskPolicy.p1MinScore} 이상`, '즉시 조치 등급 컷오프 (보안담당)'],
        ['취약점 우선순위 P2', `점수 ${s.riskPolicy.p2MinScore}~${s.riskPolicy.p1MinScore - 1}`, '우선 조치 등급 컷오프 (보안담당)'],
        ['AI 실행 환경 · 모델', `${s.aiPolicy.deployment} · ${s.aiPolicy.modelId}`, 'AI 거버넌스 — 실행 환경·모델 버전 (Admin)'],
        ['AI 프롬프트 버전 · 분류 정확도', `${s.aiPolicy.promptVersion} · ${effectiveClassifyAccuracy(s.aiPolicy, s.insights)}%`, 'AI 거버넌스 — 버전 관리·성능 (Admin)'],
        ['AI 로그 보존 · 권한 필터', `${s.aiPolicy.auditRetentionDays}일 · ${s.aiPolicy.scopeFilter ? 'ON' : 'OFF'}`, '질의·응답 감사 추적성·권한 밖 데이터 배제 (Admin)'],
      ],
    },
    {
      // 미인가 SW·SaaS 정책 상태 — 보안담당이 관리하는 허용/차단 정책의 현재 규모(§01 보안담당: 미인가 SW·SaaS 정책 관리)
      title: 'SW · SaaS 정책 상태',
      note: '보안담당 관리 — 허용(화이트리스트·인가)과 차단·미인가의 현황',
      columns: ['정책 영역', '허용', '검토·미인가', '차단'],
      rows: [
        ['SaaS 카탈로그', String(s.saasCatalog.filter((x) => x.status === '인가').length), String(s.saasCatalog.filter((x) => x.status === '검토중').length), String(s.saasCatalog.filter((x) => x.status === '차단').length)],
        ['설치 SW (EDR)', `화이트리스트 ${s.swAllowlist.length}`, String(s.unauthorizedSw.filter((w) => !w.action).length), String(s.unauthorizedSw.filter((w) => w.action === '제거 요청').length)],
      ],
    },
    {
      // 위협 대응 현황 — 검출에서 끝내지 않고 조치까지 이어졌는지(발견→조치 거버넌스)의 증적. 감사에서 "탐지만 하고 방치"를 반증한다.
      title: '외부 · 계정 · SW 위협 대응 현황',
      note: '검출 대비 조치 완료 — 발견에서 조치까지의 폐쇄 루프 이행 증적',
      columns: ['위협 유형', '검출', '조치 완료', '미조치'],
      rows: [
        ['크리덴셜 노출 (인증 취약점)', String(s.credentials.length), String(s.credentials.filter((c) => c.status === '조치 완료').length), String(s.credentials.filter((c) => c.status !== '조치 완료').length)],
        ['휴면 계정 (AD/IdP·SSO)', String(s.accounts.length), String(s.accounts.filter((a) => a.action).length), String(s.accounts.filter((a) => !a.action).length)],
        ['미인가 SW (EDR)', String(s.unauthorizedSw.length), String(s.unauthorizedSw.filter((w) => w.action).length), String(s.unauthorizedSw.filter((w) => !w.action).length)],
        ['USB 저장매체 (EDR·DLP)', String(s.usbFindings.length), String(s.usbFindings.filter((u) => u.action).length), String(s.usbFindings.filter((u) => !u.action).length)],
        ['로컬 가상머신 (EDR)', String(s.localVms.length), String(s.localVms.filter((v) => v.action).length), String(s.localVms.filter((v) => !v.action).length)],
        ['외부 노출 자산', String(s.external.length), String(s.external.filter((e) => e.action).length), String(s.external.filter((e) => !e.action && e.state !== '등록·일치').length)],
        ['위협 인텔 IOC 상관', String(s.iocMatches.length), String(s.iocMatches.filter((i) => i.action).length), String(s.iocMatches.filter((i) => !i.action).length)],
        ['다크웹 유출·침해', String(s.leaks.length), String(s.leaks.filter((l) => l.status === '조치 완료').length), String(s.leaks.filter((l) => l.status !== '조치 완료').length)],
      ],
    },
    anomalySection,
    {
      title: '감사 로그 (최근)',
      note: `AI 로그 보존 ${s.aiPolicy.auditRetentionDays}일 · 권한 범위 필터 ${s.aiPolicy.scopeFilter ? 'ON' : 'OFF'}`,
      columns: ['일시', '수행자', '동작', '대상', '결과'],
      rows: s.auditLogs.slice(0, 10).map((l) => [l.at, l.actor, l.action, l.target, l.result]),
    },
  ]
}

/** 키 미설정 시 서술 — 섹션 수치에서 결정적으로 생성 */
export function ruleHeadline(kind: ReportKind, sections: ReportSection[]): string {
  const s = getStore()
  const n = (t: string) => sections.find((x) => x.title.includes(t))?.rows?.length ?? 0

  if (kind === '자산 운영 리스크') {
    const lostN = s.assets.filter((a) => a.status === '분실').length
    const staleN = s.assets.filter((a) => isStaleVerify(a, s.opsPolicy.staleVerifyDays)).length
    const overdueN = s.assets.filter(isLoanOverdue).length
    const repairLateN = s.assets.filter((a) => a.status === '수리중' && isRepairOverdue(a)).length
    const receiptN = s.assets.filter((a) => a.receiptPending && a.status === '사용중').length
    return `자산 운영 리스크는 총 ${lostN + staleN + overdueN + repairLateN + receiptN}건입니다 — 분실·도난 ${lostN}건, 장기 미실측 ${staleN}건, 대여 반환 연체 ${overdueN}건, 수리 지연 ${repairLateN}건, 수령 미확인 ${receiptN}건. 각각 회수·폐기, 재물조사 편성, 반환 독촉, 업체 독촉, 수령 확인 독촉으로 조치가 필요합니다.`
  }
  if (kind === '복합 위험 자산') {
    const liveH = s.assets.filter((a) => a.status !== '폐기완료')
    const riskH = new Set(compositeRiskAssetNos(liveH))
    const rowsH = liveH.map((a) => riskSignals(a)).filter((sig, i) => riskH.has(liveH[i].assetNo))
    const threeH = rowsH.filter((sig) => sig.length >= 3).length
    return rowsH.length === 0
      ? `복합 위험(주의 신호 2개 이상 중첩) 자산이 없습니다. 단일 신호 자산은 교체 대상·보증 임박·정기 점검 등 각 화면에서 개별 관리하십시오.`
      : `복합 위험 자산은 ${rowsH.length}건입니다 — 정합성·EOL·보증·정기 점검·단일 장애점·교체·미실측 중 2개 이상이 겹칩니다. 신호 3개 이상 ${threeH}건이 최우선 조치 대상이며, 중첩 자산은 단일 조치(예: 교체)로 여러 위험을 동시에 해소할 수 있어 우선순위가 높습니다.`
  }
  if (kind === '감가상각 명세') {
    const tD = today()
    const curYD = Number(tD.slice(0, 4))
    const depH = s.assets.filter((a) => a.status !== '폐기완료' && acquisitionCostOf(a) > 0)
    const totalAcqH = depH.reduce((n, a) => n + acquisitionCostOf(a), 0)
    const nowBookH = depH.reduce((n, a) => n + bookValueOf(a, tD), 0)
    const curYearDepH = Math.max(0, depH.reduce((n, a) => n + bookValueOf(a, `${curYD - 1}-12-31`), 0) - depH.reduce((n, a) => n + bookValueOf(a, `${curYD}-12-31`), 0))
    return `운영 실물 자산 ${depH.length}대의 총 취득가 ${fmtAmount(totalAcqH)}원 중 현재 잔존가(장부가)는 ${fmtAmount(nowBookH)}원입니다(누적 상각 ${fmtAmount(totalAcqH - nowBookH)}원). 정액법(내용연수 ${USEFUL_LIFE_YEARS}년) 기준 ${curYD}년 상각 예정액은 ${fmtAmount(curYearDepH)}원이며, 연도별 상각액과 상각 완료 시점을 아래 명세에 전개했습니다 — 감가상각비 예산·재취득(교체) 시점 근거로 활용합니다.`
  }
  if (kind === '계약 갱신 전망') {
    const tC = today()
    const liveC2 = s.contracts.filter((c) => c.status !== '해지')
    const qKeyC = (d: string) => { const y = Number(d.slice(0, 4)); const m = Number(d.slice(5, 7)); return y * 4 + Math.floor((m - 1) / 3) }
    const curKeyC = qKeyC(tC)
    const inHorizon = liveC2.filter((c) => c.end >= tC && qKeyC(c.end) <= curKeyC + 7)
    const horizonAmt = inHorizon.reduce((n, c) => n + c.amount, 0)
    const overdueC = liveC2.filter((c) => c.end < tC)
    return `유효 계약 ${liveC2.length}건 중 향후 8개 분기 만료(갱신) 예정은 ${inHorizon.length}건, 예상 갱신 총액은 ${fmtAmount(horizonAmt)}원입니다(현재 계약액 기준). ${overdueC.length ? `만료 경과(미갱신) ${overdueC.length}건은 갱신·해지 판단 지연 건으로 우선 정리가 필요합니다. ` : ''}분기별 갱신 캐시플로우를 아래에 전개해 예산·현금흐름 계획 근거로 제시합니다 — 계약 관리 현황의 현재 스냅샷과 달리 다분기 전방 전망입니다.`
  }
  if (kind === '단일 장애점·영향 분석') {
    const spofH = criticalDependencies()
    const degH = impactSources()
    const maxB = spofH.length ? spofH[0].blastRadius.length : 0
    return `CMDB 의존 그래프 상 영향 범위 2대 이상인 단일 장애점(SPOF)은 ${spofH.length}건이며, 최대 영향 범위는 ${maxB}대입니다. `
      + `이 중 현재 저하(분실·폐기·수리) 상태로 하위에 장애가 전이될 수 있는 상위 자산은 ${degH.length}건으로, 우선 복구·이중화 검토가 필요합니다.`
  }
  if (kind === '정보보호 컴플라이언스 증적') {
    return `정보보호 컴플라이언스 증적 — 대장 등록 운영 자산 ${s.assets.filter((a) => a.status !== '폐기완료').length}건, 미등록 발견 자산 ${s.discovered.filter((d) => d.state === '미등록').length}건이 편입 대상입니다. ISMS/ISO 27001 통제(자산 관리·접근 통제·매체 폐기·운영 보안·로깅)별 증적을 아래 섹션에 집약했습니다.`
  }
  if (kind === '라이선스 갱신·트루업 계획') {
    const loH = licenseOptimization()
    const soon = loH.active.filter((l) => l.expiry !== '-' && (daysUntil(l.expiry) ?? 9999) <= 180)
    return `만료 180일 이내 갱신 예정 라이선스는 ${soon.length}종이며, 초과 사용 ${loH.over.length}종은 추가 구매(트루업)·미사용 ${loH.under.length}종은 감축 갱신 대상입니다. 미사용 좌석 감축 시 연 약 ${fmtAmount(loH.saving)}원 절감이 가능합니다.`
  }
  if (kind === '주간 Shadow IT 브리핑') {
    const credN = s.credentials.filter((c) => c.status !== '조치 완료').length
    const acctN = s.accounts.filter((a) => !a.action).length
    const swN = s.unauthorizedSw.filter((w) => !w.action).length
    const usbN = s.usbFindings.filter((u) => !u.action).length
    const vmN = s.localVms.filter((v) => !v.action).length
    return `이번 주 미등록 자산 ${n('신규 발견')}건이 발견되었고, 이 중 위험도 높음은 ${s.discovered.filter((d) => d.state === '미등록' && d.risk === '높음').length}건입니다. `
      + `외부 공격표면에서는 미등록 노출 자산 ${n('외부 공격표면')}건이 확인되었으며 CVE가 확인된 자산이 ${s.external.filter((e) => e.cve).length}건 포함됩니다. `
      + `미인가 SaaS는 ${n('미인가 SaaS')}종으로, 소유자 확인 후 편입 또는 차단 판정이 필요합니다. `
      + `인증·계정·엔드포인트 위생에서는 크리덴셜 노출 ${credN}건·휴면 계정 ${acctN}건·미인가 SW ${swN}건·USB 매체 ${usbN}건·로컬 VM ${vmN}건이 미조치 상태로, 보안담당의 차단·제거·회수·비활성화·소유자 확인 조치가 필요합니다.`
  }
  if (kind === '월간 자산 현황') {
    const totalRepair = s.assets.reduce((t, a) => t + repairTotalOf(a), 0)
    const proceeds = s.disposals.filter((d) => d.status === '완료').reduce((t, d) => t + (d.proceeds ?? 0), 0)
    return `총 등록 자산은 ${s.assets.length}대이며 사용중 ${s.assets.filter((a) => a.status === '사용중').length}대, 유휴·반납 ${s.assets.filter((a) => ['유휴', '반납대기'].includes(a.status)).length}대입니다. `
      + `${s.opsPolicy.expiryWindowDays}일 내 만료 계약이 ${n('만료 임박')}건 있어 갱신 검토가 필요하며, Discovery를 통해 대장에 편입된 자산은 ${s.assets.filter((a) => a.discoveredVia).length}대입니다. `
      + `당월까지 누적 유지보수(수리) 비용은 총 ${fmtAmount(totalRepair)}원이며, 자산 처분(매각) 대금 회수는 ${fmtAmount(proceeds)}원입니다.`
  }
  if (kind === '라이선스 컴플라이언스') {
    // 섹션표와 동일한 단일 소스(licenseOptimization — 해지 제외)로 산출. 그동안 헤드라인만 전체 라이선스로 재계산해
    // 해지분을 초과·미사용·절감액에 포함, 같은 리포트 안에서 섹션과 수치가 어긋났다.
    const { over, under, saving } = licenseOptimization()
    return `초과 사용 ${over.length}건${over.length ? ` (${over.map((l) => l.name).join(', ')})` : ''}으로 감사 리스크가 있으며, `
      + `장기 미사용 보유 ${under.length}건에서 연간 ${fmtAmount(saving)}원의 절감 여지가 있습니다.`
  }
  if (kind === '재물조사 결과 요약') {
    const cur = s.inventoryRounds.find((r) => r.status === '진행중')
    return cur
      ? `${cur.name}가 진행 중이며 진행률은 ${roundProgressPct(cur)}% (${cur.scanned.toLocaleString()}/${cur.planned.toLocaleString()})입니다. `
        + `현재까지 차이 항목 ${cur.mismatched}건이 확인되어 조정 결재 대상이며, 기한은 ${cur.dueDate}입니다.`
      : '진행 중인 재물조사가 없습니다.'
  }
  if (kind === '연간 교체 계획') {
    const { cands, budget, residualBook } = replacementCandidates()
    const warrN = cands.filter((x) => x.why.includes('보증')).length
    const eolN = s.assets.filter((a) => !['폐기완료', '폐기예정'].includes(a.status) && eolOsOf(a.os, today())).length
    return `내용연수·보증 경과 기준 교체 대상은 ${cands.length}대이며 추정 예산은 ${fmtAmount(budget)}원입니다. `
      + `이 중 보증이 경과한 ${warrN}대는 장애 시 무상 수리가 불가해 우선 교체 대상이며, 잔여 장부가는 ${fmtAmount(residualBook)}원입니다. `
      + `하드웨어 노후와 별개로 OS 지원 종료(EOL) 자산이 ${eolN}대 있어 업그레이드 또는 교체가 필요합니다. `
      + '예산 확정 후 노후·장애 이력 순으로 분기별 집행 계획을 수립할 것을 권고합니다.'
  }
  if (kind === '취약점 조치 우선순위') {
    const { items, p1, p2 } = buildVulnPriority()
    return `미조치 취약점 ${items.length}건에 대해 자산 중요도 × 노출도로 조치 우선순위를 산출했습니다. `
      + `즉시 조치가 필요한 P1 은 ${p1}건, 우선 조치 P2 는 ${p2}건입니다. `
      + '외부 노출 CVE·EOL OS·미인가 SW·크리덴셜 노출을 통합해, 인터넷 노출·서버/네트워크·IDC·핵심 지정 자산일수록 상위에 배치했습니다. P1 부터 순차 조치를 권고합니다.'
  }
  if (kind === 'AI 거버넌스·성능') {
    const p = s.aiPolicy
    const approved = s.insights.filter((i) => i.status === '승인').length
    const rejected = s.insights.filter((i) => i.status === '반려').length
    const adoption = approved + rejected ? Math.round((approved / (approved + rejected)) * 100) : null
    return `AI 실행 환경은 ${p.deployment}(${p.modelId}, 프롬프트 ${p.promptVersion})이며 분류 정확도는 ${effectiveClassifyAccuracy(p, s.insights)}%입니다(승인·반려 판정 환류 반영). `
      + `AI 기능 제안의 누적 채택률은 ${adoption === null ? '판정 전' : `${adoption}%`}로, 승인·반려 결과가 재학습에 환류됩니다. `
      + `AI 제안·질의·응답은 ${p.auditRetentionDays}일 감사 보존되며, 권한 범위 필터가 ${p.scopeFilter ? '적용' : '미적용'}되고 제안 자동승인은 ${p.autoApprove ? '허용' : '차단(담당자 확인·결재 원칙)'}으로 운영됩니다.`
  }
  if (kind === '부서별 IT 비용 배분') {
    const t = today()
    const valued = s.assets.filter((a) => a.status !== '폐기완료' && acquisitionCostOf(a) > 0)
    const totalAcq = valued.reduce((n, a) => n + acquisitionCostOf(a), 0)
    const totalBook = valued.reduce((n, a) => n + bookValueOf(a, t), 0)
    const seatCost = s.licenses
      .filter((l) => l.status !== '해지')
      .reduce((n, l) => n + (l.seats?.length ?? 0) * l.unitCost, 0)
    const mcCost = s.contracts
      .filter((c) => c.kind === '유지보수' && c.status !== '해지')
      .reduce((n, c) => n + c.amount, 0)
    const deptN = new Set(valued.map((a) => a.dept || '미지정')).size
    return `운영 IT 자산 ${valued.length}대의 취득가 ${fmtAmount(totalAcq)}원을 ${deptN}개 부서로 배분했습니다. 현재 장부가(잔존가치)는 ${fmtAmount(totalBook)}원입니다. `
      + `라이선스 좌석 비용 ${fmtAmount(seatCost)}원은 좌석 배정 부서로, 유지보수 계약비 ${fmtAmount(mcCost)}원은 주관 부서로 귀속했습니다. `
      + '자산은 소유 부서, 라이선스는 좌석 부서, 유지보수 계약은 주관 부서를 기준으로 IT 비용을 배분해 부서별 차지백·예산 배정의 근거로 활용할 수 있습니다.'
  }
  if (kind === '계약 관리 현황') {
    const live = s.contracts.filter((c) => c.status !== '해지')
    const expiring = live.filter((c) => { const d = daysUntil(c.end); return d !== null && d <= 90 }).length
    const mb = buildMaintenance()
    const proc = buildProcurement()
    return `유효 계약 ${live.length}건(구매 ${live.filter((c) => c.kind === '구매').length} · 유지보수 ${live.filter((c) => c.kind === '유지보수').length}) 중 만료 임박(D-90) ${expiring}건입니다. `
      + `유지보수 예산 초과 ${mb.overBudget}건, 구매 발주 미이행 위험 ${proc.atRisk.length}건이 조치 대상입니다. `
      + '만료·예산 집행·발주 이행·SLA·부속서류를 한 곳에서 점검해 계약 갱신·정산·재협상 결정의 근거로 씁니다.'
  }
  const liveA = s.assets.filter((a) => a.status !== '폐기완료')
  const flaggedA = liveA.filter(hasDataIssue).length
  const accuracyA = liveA.length ? Math.round(((liveA.length - flaggedA) / liveA.length) * 100) : 100
  return `사용자 ${s.users.length}명에 대해 화면·기능 단위 최소권한이 적용되어 있으며 MFA 적용률은 ${Math.round((s.users.filter((u) => u.mfa).length / s.users.length) * 100)}%입니다. `
    + `필수 결재 지정 화면은 ${s.approvalLines.filter((l) => l.required).length}개이며, 탐지 채널 ${s.scanPolicies.filter((p) => p.enabled).length}/${s.scanPolicies.length}이 정책에 따라 운영 중입니다. `
    + `대장 정합성(CMDB 정확도)은 ${accuracyA}%로, 핵심 필드 누락·불일치 ${flaggedA}건은 정합성 보정 대상입니다.`
}

/** 결재 첨부용 — 엑셀 호환 CSV (UTF-8 BOM) */
export function toCsv(title: string, sections: ReportSection[], headline: string): string {
  // CSV 수식 인젝션 방지 — 스캔에서 온 호스트명 등 값이 =,+,-,@,탭,CR 로 시작하면 Excel 이 수식으로 실행한다.
  // 따옴표로 감싸도 무력화되지 않으므로 선행 작은따옴표로 텍스트 고정한 뒤 CSV 이스케이프한다.
  const esc = (v: string) => {
    const guarded = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
    return `"${guarded.replace(/"/g, '""')}"`
  }
  const lines: string[] = [esc(title), '', esc(headline), '']
  for (const sec of sections) {
    lines.push(esc(`■ ${sec.title}`))
    if (sec.note) lines.push(esc(sec.note))
    if (sec.columns) lines.push(sec.columns.map(esc).join(','))
    for (const r of sec.rows ?? []) lines.push(r.map(esc).join(','))
    for (const b of sec.bullets ?? []) lines.push(esc(`- ${b}`))
    lines.push('')
  }
  return '﻿' + lines.join('\r\n')
}

/** 결재 첨부용 — 네이티브 엑셀(xlsx) 시트 구성. 다른 대장·로그 반출과 동일한 buildXlsx 를 쓴다.
 *  요약 시트(리포트명·총평·섹션 개요) + 섹션별 시트(표는 열/행 그대로, 불릿 섹션은 '내용' 단일 열).
 *  시트명은 색인 접두로 유일성을 보장한다(같은 제목 섹션이 있어도 중복 시트명이 되지 않도록). */
export function toSheets(title: string, headline: string, sections: ReportSection[]): Sheet[] {
  const cover: Sheet = {
    name: '요약',
    header: ['구분', '내용'],
    rows: [
      ['리포트', title],
      ['총평', headline],
      ...sections.map((sec) => [`· ${sec.title}`, sec.note ?? '']),
    ],
  }
  // 천단위 구분 금액 문자열("3,000,000")은 네이티브 숫자 셀로 반출 — 결재 첨부 후 회계가 합산·수식·피벗할 수 있다.
  //  콤마가 있는 순수 정수만 변환한다: 연도('2026')·대수 같은 콤마 없는 값은 문자열로 남겨(연도에 #,##0 콤마 서식이 붙는 오표기 방지),
  //  자산번호(AST-…)·비율('92%')·판정('판정 전') 등 비순수-숫자도 그대로 문자열. (감가상각 명세·계약 갱신 전망 등 금액 리포트가 네이티브 숫자화)
  const numify = (v: string): CellValue => (/^-?\d{1,3}(,\d{3})+$/.test(v) ? Number(v.replace(/,/g, '')) : v)
  const sectionSheets: Sheet[] = sections.map((sec, i) => {
    const name = `${i + 1}. ${sec.title}`
    return sec.columns && sec.columns.length
      ? { name, header: sec.columns, rows: (sec.rows ?? []).map((r) => r.map(numify)) }
      : { name, header: ['내용'], rows: (sec.bullets ?? []).map((b) => [b]) }
  })
  return [cover, ...sectionSheets]
}

/** 결재 첨부용 — 문서(Markdown) */
export function toMarkdown(title: string, period: string, headline: string, sections: ReportSection[], meta: string): string {
  const out: string[] = [`# ${title}`, '', `> ${period} · ${meta} · 생성일 ${today()}`, '', headline, '']
  for (const sec of sections) {
    out.push(`## ${sec.title}`, '')
    if (sec.note) out.push(`_${sec.note}_`, '')
    if (sec.columns?.length) {
      out.push(`| ${sec.columns.join(' | ')} |`)
      out.push(`|${sec.columns.map(() => '---').join('|')}|`)
      for (const r of sec.rows ?? []) out.push(`| ${r.join(' | ')} |`)
      out.push('')
    }
    for (const b of sec.bullets ?? []) out.push(`- ${b}`)
    if (sec.bullets?.length) out.push('')
  }
  return out.join('\n')
}

/** 섹션 표를 LLM 입력용 텍스트로 압축 — 수치는 섹션에서만 오고 AI는 서술만 담당 */
function sectionsAsText(sections: ReportSection[]): string {
  return sections
    .map((s) => {
      const head = `## ${s.title}${s.note ? ` (${s.note})` : ''}`
      const table = s.columns ? [s.columns.join(' | '), ...(s.rows ?? []).map((r) => r.join(' | '))].join('\n') : ''
      const bullets = (s.bullets ?? []).map((b) => `- ${b}`).join('\n')
      return [head, table, bullets].filter(Boolean).join('\n')
    })
    .join('\n\n')
}

/** 리포트 1건 생성 — 수동 생성·스케줄 실행·AI 제안 승인이 모두 같은 경로를 쓴다.
 *  수치는 buildSections 가 스토어에서 결정적으로 산출하고, AI 는 서술(headline)만 덧붙인다. */
export async function createReport(kind: ReportKind, by: string): Promise<string> {
  const s = getStore()
  const sections = buildSections(kind)
  let headline = ruleHeadline(kind, sections)
  let mode: 'AI' | '규칙' = '규칙'

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey })
      const response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL_ID || 'claude-opus-5',
        max_tokens: 4096,
        system:
          'IT 자산관리 리포트의 요약 서술을 작성합니다. 아래 표 데이터에 있는 수치만 사용하고 ' +
          '없는 사실을 추가하지 마세요. 3~5문장의 한국어 평서문으로, 담당자가 조치를 판단할 수 있게 ' +
          '위험·이상 항목을 우선 언급하세요. 제목이나 머리말 없이 본문만 출력하세요.',
        messages: [{ role: 'user', content: `리포트: ${kind}\n\n${sectionsAsText(sections)}` }],
      })
      if (response.stop_reason !== 'refusal') {
        const text = response.content
          .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
          .map((b) => b.text).join('').trim()
        if (text) { headline = text; mode = 'AI' }
      }
      recordAiCall(mode === 'AI', mode === 'AI' ? undefined : '응답에 텍스트 없음')
    } catch (err) {
      // 라이브 생성 실패 시 규칙 기반 서술 유지 — 리포트 생성 자체는 성공시킨다.
      // 다만 실패 사실은 남긴다. 조용히 폴백하면 화면이 계속 'AI 가동'이라 주장하게 된다.
      recordAiCall(false, err instanceof Error ? err.message.slice(0, 80) : '알 수 없는 오류')
    }
  }

  s.seq += 1
  const id = `RPT-${s.seq}`
  s.reports.unshift({
    id,
    kind,
    title: `${kind} (${today()})`,
    period: today(),
    generatedAt: nowMinute(),
    generatedBy: by,
    mode,
    headline,
    sections,
  })
  appendAudit({ actor: by, action: `AI 리포트 생성 (${mode})`, target: kind })
  return id
}
