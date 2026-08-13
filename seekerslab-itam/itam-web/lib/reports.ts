/** 리포트 본문 생성 — 스토어 데이터에서 결정적으로 산출한다.
 *  AI는 이 섹션들을 근거로 서술(headline)만 덧붙이므로, 수치는 항상 화면 데이터와 일치한다. */
import { recordAiCall } from './ai-status'
import { appendAudit } from './audit'
import { nowMinute, today, daysUntil, fmtAmount, isLoanOverdue, isLoanDueSoon } from './dates'
import { ACQ_COST, bookValueOf } from './cost'
import { assetDataIssues, hasDataIssue } from './quality'
import { getStore } from './store'
import type { ReportKind, ReportSchedule, ReportSection } from './types'

export const REPORT_KINDS: { kind: ReportKind; period: string; desc: string }[] = [
  { kind: '주간 Shadow IT 브리핑', period: '주간', desc: '신규 발견 미등록 자산 · 외부 노출 · 미인가 SaaS · 인증·계정·SW 정책 위반 · 처리 현황' },
  { kind: '월간 자산 현황', period: '월간', desc: '유형별 보유·상태 분포, 수명주기 처리 실적, 만료 임박 계약, 유지보수(수리) 비용, 자산 처분 실적' },
  { kind: '라이선스 컴플라이언스', period: '월간', desc: '보유–사용 대사, 초과 사용 감사 리스크, 미사용 회수 절감액' },
  { kind: '재물조사 결과 요약', period: '수시', desc: '조사 진행률·차이 항목·조정 결재 대상' },
  { kind: '감사 대응 자료', period: '수시', desc: '권한 통제·감사 로그·정책 이행·대장 정합성(CMDB 정확도)·위협 대응 현황 증빙 초안' },
  { kind: '연간 교체 계획', period: '수시', desc: '내용연수·보증 경과 기준 교체 대상·잔존가치·유형별 예산 추정' },
]

/** 교체 대상 산정 — 내용연수(도입 5년) 초과 또는 보증 경과 자산(폐기 대상 제외).
 *  AI 수명예측 제안 승인 시 이 근거로 연간 교체 계획 리포트가 생성된다.
 *  교체 예산 단가는 lib/cost 의 유형 표준 단가(ACQ_COST)를 재사용(대장 취득가·재고 가치와 동일 기준). */
function replacementCandidates() {
  const s = getStore()
  const t = today()
  // 도입 5년 초과 기준일 — 문자열 비교로 TZ 문제를 피한다 (예: 2026-08-01 → 2021-08-01)
  const cutoff = `${Number(t.slice(0, 4)) - 5}${t.slice(4)}`
  const active = s.assets.filter((a) => !['폐기완료', '폐기예정'].includes(a.status))
  const cands = active
    .map((a) => {
      const warr = a.warrantyEnd !== '-' && a.warrantyEnd < t
      const aged = a.purchaseDate < cutoff
      const why = warr && aged ? '보증 경과·내용연수 초과' : warr ? '보증 경과' : aged ? '내용연수 초과' : ''
      return { a, why, book: bookValueOf(a, t) }
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
  const d = new Date(last)
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
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
        title: '인증 · 계정 · SW 정책 위반',
        note: `크리덴셜 노출 미조치 ${credOpen.length} · 휴면 계정 미처리 ${acctOpen.length} · 미인가 SW 미조치 ${swOpen.length}`,
        columns: ['구분', '대상', '상세', '위험도', '조치 상태'],
        rows: [
          ...credOpen.map((c) => ['크리덴셜 노출', `${c.service} ${c.host}`, c.issue, c.severity, '미조치']),
          ...acctOpen.map((a) => ['휴면 계정', a.account, `${a.kind} · ${a.dormantDays}일`, a.risk, '미처리']),
          ...swOpen.map((w) => ['미인가 SW', `${w.name} @ ${w.assetNo}`, w.kind, w.risk, '미조치']),
        ],
      },
      {
        title: '조치 현황',
        bullets: [
          `편입 요청 ${handled.filter((d) => d.action?.startsWith('편입')).length}건 · 격리 요청 ${handled.filter((d) => d.action?.startsWith('격리')).length}건`,
          `외부 위협 미조치 — 크리덴셜 노출 ${credOpen.length} · 휴면 계정 ${acctOpen.length} · 미인가 SW ${swOpen.length} · 다크웹 유출 ${s.leaks.filter((l) => l.status === '미조치').length}`,
          `결재 대기 ${s.approvals.filter((a) => a.status === '대기').length}건`,
          `활성 탐지 채널 ${s.scanPolicies.filter((p) => p.enabled).length}/${s.scanPolicies.length}`,
        ],
      },
    ]
  }

  if (kind === '월간 자산 현황') {
    const cats = [...new Set(s.assets.map((a) => a.category))]
    // 유지보수(수리) 비용 — 자산 단위 수리비(repairCosts) 롤업. 월간 운영 보고에 TCO 반영.
    const sumRepair = (a: (typeof s.assets)[number]) => (a.repairCosts ?? []).reduce((n, c) => n + c.amount, 0)
    const repaired = s.assets.filter((a) => (a.repairCosts?.length ?? 0) > 0).sort((x, y) => sumRepair(y) - sumRepair(x))
    const totalRepair = repaired.reduce((n, a) => n + sumRepair(a), 0)
    const repairSection: ReportSection = repaired.length === 0
      ? { title: '유지보수(수리) 비용 현황', bullets: ['등록된 수리 비용 이력이 없습니다.'] }
      : {
          title: '유지보수(수리) 비용 현황',
          note: `누적 수리비 총 ${totalRepair.toLocaleString()}원 · 수리 이력 자산 ${repaired.length}대`,
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
        rows: s.assets.filter((a) => a.status !== '사용중').map((a) => [a.assetNo, a.model, a.status, a.location]),
      },
      repairSection,
      disposalSection,
      {
        title: '만료 임박 계약 (90일 이내)',
        columns: ['계약번호', '계약명', '공급사', '만료일', '잔여'],
        rows: s.contracts
          .filter((c) => { const d = daysUntil(c.end); return c.status !== '해지' && d !== null && d <= 90 })
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
    const active = s.licenses.filter((l) => l.status !== '해지')
    const over = active.filter((l) => l.used > l.purchased)
    const under = active.filter((l) => l.used / l.purchased < 0.6)
    const saving = under.reduce((n, l) => n + (l.purchased - l.used) * l.unitCost, 0)
    return [
      {
        title: '보유–사용 대사',
        note: `초과 사용 ${over.length}건 · 미사용 보유 ${under.length}건 (해지 제외)`,
        columns: ['라이선스', '공급사', '보유', '사용', '사용률', '만료일', '판정'],
        rows: s.licenses.map((l) => [
          l.name, l.vendor, String(l.purchased), String(l.used),
          `${Math.round((l.used / l.purchased) * 100)}%`, l.expiry,
          l.status === '해지' ? '해지' : l.used > l.purchased ? '초과 사용' : l.used / l.purchased < 0.6 ? '미사용 보유' : '적정',
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
    ]
  }

  if (kind === '재물조사 결과 요약') {
    return [
      {
        title: '조사 회차별 진행 현황',
        columns: ['회차', '범위', '계획', '스캔', '진행률', '차이', '기한', '상태'],
        rows: s.inventoryRounds.map((r) => [
          r.name, r.scope, String(r.planned), String(r.scanned),
          `${Math.round((r.scanned / r.planned) * 100)}%`, String(r.mismatched), r.dueDate, r.status,
        ]),
      },
      {
        title: '차이 항목 — 미확인 자산',
        note: '대장에 있으나 일정 기간 실측되지 않은 자산 (유휴·분실 후보)',
        columns: ['발견 ID', '호스트명', '최근 실측', '비고'],
        rows: s.discovered.filter((d) => d.state === '미확인').map((d) => [d.id, d.hostname, d.lastSeen, d.note ?? '-']),
      },
      {
        title: '조정 결재 대상',
        bullets: [
          `누적 차이 ${s.inventoryRounds.reduce((n, r) => n + r.mismatched, 0)}건`,
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
    return [
      {
        title: '교체 대상 자산',
        note: `총 ${cands.length}대 — 보증 경과 ${warrN} · 내용연수 초과 ${agedN} · 잔여 장부가 ${fmtAmount(residualBook)}원`,
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
      {
        title: '우선순위 · 집행 계획',
        bullets: [
          `보증 경과 ${warrN}대는 장애 시 무상 수리가 불가 — 우선 교체 대상`,
          `수리중 자산 ${s.assets.filter((a) => a.status === '수리중').length}대는 수리 불가 판정 시 교체 대상에 편입`,
          '예산 확정 후 노후·장애 이력 순으로 분기별 집행 계획 수립',
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
      // 위협 대응 현황 — 검출에서 끝내지 않고 조치까지 이어졌는지(발견→조치 거버넌스)의 증적. 감사에서 "탐지만 하고 방치"를 반증한다.
      title: '외부 · 계정 · SW 위협 대응 현황',
      note: '검출 대비 조치 완료 — 발견에서 조치까지의 폐쇄 루프 이행 증적',
      columns: ['위협 유형', '검출', '조치 완료', '미조치'],
      rows: [
        ['크리덴셜 노출 (인증 취약점)', String(s.credentials.length), String(s.credentials.filter((c) => c.status === '조치 완료').length), String(s.credentials.filter((c) => c.status !== '조치 완료').length)],
        ['휴면 계정 (AD/IdP·SSO)', String(s.accounts.length), String(s.accounts.filter((a) => a.action).length), String(s.accounts.filter((a) => !a.action).length)],
        ['미인가 SW (EDR)', String(s.unauthorizedSw.length), String(s.unauthorizedSw.filter((w) => w.action).length), String(s.unauthorizedSw.filter((w) => !w.action).length)],
        ['외부 노출 자산', String(s.external.length), String(s.external.filter((e) => e.action).length), String(s.external.filter((e) => !e.action && e.state !== '등록·일치').length)],
        ['다크웹 유출·침해', String(s.leaks.length), String(s.leaks.filter((l) => l.status === '조치 완료').length), String(s.leaks.filter((l) => l.status === '미조치').length)],
      ],
    },
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

  if (kind === '주간 Shadow IT 브리핑') {
    const credN = s.credentials.filter((c) => c.status !== '조치 완료').length
    const acctN = s.accounts.filter((a) => !a.action).length
    const swN = s.unauthorizedSw.filter((w) => !w.action).length
    return `이번 주 미등록 자산 ${n('신규 발견')}건이 발견되었고, 이 중 위험도 높음은 ${s.discovered.filter((d) => d.state === '미등록' && d.risk === '높음').length}건입니다. `
      + `외부 공격표면에서는 미등록 노출 자산 ${n('외부 공격표면')}건이 확인되었으며 CVE가 확인된 자산이 ${s.external.filter((e) => e.cve).length}건 포함됩니다. `
      + `미인가 SaaS는 ${n('미인가 SaaS')}종으로, 소유자 확인 후 편입 또는 차단 판정이 필요합니다. `
      + `인증·계정·SW 위생에서는 크리덴셜 노출 ${credN}건·휴면 계정 ${acctN}건·미인가 SW ${swN}건이 미조치 상태로, 보안담당의 제거·비활성화·소유자 확인 조치가 필요합니다.`
  }
  if (kind === '월간 자산 현황') {
    const totalRepair = s.assets.reduce((t, a) => t + (a.repairCosts ?? []).reduce((n, c) => n + c.amount, 0), 0)
    const proceeds = s.disposals.filter((d) => d.status === '완료').reduce((t, d) => t + (d.proceeds ?? 0), 0)
    return `총 등록 자산은 ${s.assets.length}대이며 사용중 ${s.assets.filter((a) => a.status === '사용중').length}대, 유휴·반납 ${s.assets.filter((a) => ['유휴', '반납대기'].includes(a.status)).length}대입니다. `
      + `90일 내 만료 계약이 ${n('만료 임박')}건 있어 갱신 검토가 필요하며, Discovery를 통해 대장에 편입된 자산은 ${s.assets.filter((a) => a.discoveredVia).length}대입니다. `
      + `당월까지 누적 유지보수(수리) 비용은 총 ${fmtAmount(totalRepair)}원이며, 자산 처분(매각) 대금 회수는 ${fmtAmount(proceeds)}원입니다.`
  }
  if (kind === '라이선스 컴플라이언스') {
    const over = s.licenses.filter((l) => l.used > l.purchased)
    const under = s.licenses.filter((l) => l.used / l.purchased < 0.6)
    return `초과 사용 ${over.length}건${over.length ? ` (${over.map((l) => l.name).join(', ')})` : ''}으로 감사 리스크가 있으며, `
      + `장기 미사용 보유 ${under.length}건에서 연간 ${fmtAmount(under.reduce((x, l) => x + (l.purchased - l.used) * l.unitCost, 0))}원의 절감 여지가 있습니다.`
  }
  if (kind === '재물조사 결과 요약') {
    const cur = s.inventoryRounds.find((r) => r.status === '진행중')
    return cur
      ? `${cur.name}가 진행 중이며 진행률은 ${Math.round((cur.scanned / cur.planned) * 100)}% (${cur.scanned.toLocaleString()}/${cur.planned.toLocaleString()})입니다. `
        + `현재까지 차이 항목 ${cur.mismatched}건이 확인되어 조정 결재 대상이며, 기한은 ${cur.dueDate}입니다.`
      : '진행 중인 재물조사가 없습니다.'
  }
  if (kind === '연간 교체 계획') {
    const { cands, budget, residualBook } = replacementCandidates()
    const warrN = cands.filter((x) => x.why.includes('보증')).length
    return `내용연수·보증 경과 기준 교체 대상은 ${cands.length}대이며 추정 예산은 ${fmtAmount(budget)}원입니다. `
      + `이 중 보증이 경과한 ${warrN}대는 장애 시 무상 수리가 불가해 우선 교체 대상이며, 잔여 장부가는 ${fmtAmount(residualBook)}원입니다. `
      + '예산 확정 후 노후·장애 이력 순으로 분기별 집행 계획을 수립할 것을 권고합니다.'
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
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
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
