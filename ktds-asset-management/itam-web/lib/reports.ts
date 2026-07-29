/** 리포트 본문 생성 — 스토어 데이터에서 결정적으로 산출한다.
 *  AI는 이 섹션들을 근거로 서술(headline)만 덧붙이므로, 수치는 항상 화면 데이터와 일치한다. */
import { TODAY, daysUntil, fmtAmount } from './dates'
import { getStore } from './store'
import type { ReportKind, ReportSection } from './types'

export const REPORT_KINDS: { kind: ReportKind; period: string; desc: string }[] = [
  { kind: '주간 Shadow IT 브리핑', period: '주간', desc: '신규 발견 미등록 자산 · 처리 현황 · 미인가 SaaS 변동' },
  { kind: '월간 자산 현황', period: '월간', desc: '유형별 보유·상태 분포, 수명주기 처리 실적, 만료 임박 계약' },
  { kind: '라이선스 컴플라이언스', period: '월간', desc: '보유–사용 대사, 초과 사용 감사 리스크, 미사용 회수 절감액' },
  { kind: '재물조사 결과 요약', period: '수시', desc: '조사 진행률·차이 항목·조정 결재 대상' },
  { kind: '감사 대응 자료', period: '수시', desc: '권한 통제·감사 로그·정책 이행 증빙 초안' },
]

export function buildSections(kind: ReportKind): ReportSection[] {
  const s = getStore()

  if (kind === '주간 Shadow IT 브리핑') {
    const unreg = s.discovered.filter((d) => d.state === '미등록')
    const handled = s.discovered.filter((d) => d.action)
    const shadowSaas = s.saas.filter((x) => !x.sanctioned)
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
        title: '조치 현황',
        bullets: [
          `편입 요청 ${handled.filter((d) => d.action?.startsWith('편입')).length}건 · 격리 요청 ${handled.filter((d) => d.action?.startsWith('격리')).length}건`,
          `결재 대기 ${s.approvals.filter((a) => a.status === '대기').length}건`,
          `활성 탐지 채널 ${s.scanPolicies.filter((p) => p.enabled).length}/${s.scanPolicies.length}`,
        ],
      },
    ]
  }

  if (kind === '월간 자산 현황') {
    const cats = [...new Set(s.assets.map((a) => a.category))]
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
      {
        title: '만료 임박 계약 (90일 이내)',
        columns: ['계약번호', '계약명', '공급사', '만료일', '잔여'],
        rows: s.contracts
          .filter((c) => { const d = daysUntil(c.end); return d !== null && d <= 90 })
          .sort((a, b) => a.end.localeCompare(b.end))
          .map((c) => [c.id, c.name, c.vendor, c.end, (daysUntil(c.end) ?? 0) < 0 ? '경과' : `${daysUntil(c.end)}일`]),
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
    const over = s.licenses.filter((l) => l.used > l.purchased)
    const under = s.licenses.filter((l) => l.used / l.purchased < 0.6)
    const saving = under.reduce((n, l) => n + (l.purchased - l.used) * l.unitCost, 0)
    return [
      {
        title: '보유–사용 대사',
        note: `초과 사용 ${over.length}건 · 미사용 보유 ${under.length}건`,
        columns: ['라이선스', '공급사', '보유', '사용', '사용률', '만료일', '판정'],
        rows: s.licenses.map((l) => [
          l.name, l.vendor, String(l.purchased), String(l.used),
          `${Math.round((l.used / l.purchased) * 100)}%`, l.expiry,
          l.used > l.purchased ? '초과 사용' : l.used / l.purchased < 0.6 ? '미사용 보유' : '적정',
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

  // 감사 대응 자료
  return [
    {
      title: '권한 통제 현황',
      note: '화면·기능 단위 최소권한 — 사용자에게는 매핑된 메뉴·기능만 노출',
      columns: ['계정', '이름', '부서', '권한그룹', 'MFA'],
      rows: s.users.map((u) => [u.login, u.name, u.dept, u.role, u.mfa ? '적용' : '미적용']),
    },
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
    return `이번 주 미등록 자산 ${n('신규 발견')}건이 발견되었고, 이 중 위험도 높음은 ${s.discovered.filter((d) => d.state === '미등록' && d.risk === '높음').length}건입니다. `
      + `외부 공격표면에서는 미등록 노출 자산 ${n('외부 공격표면')}건이 확인되었으며 CVE가 확인된 자산이 ${s.external.filter((e) => e.cve).length}건 포함됩니다. `
      + `미인가 SaaS는 ${n('미인가 SaaS')}종으로, 소유자 확인 후 편입 또는 차단 판정이 필요합니다.`
  }
  if (kind === '월간 자산 현황') {
    return `총 등록 자산은 ${s.assets.length}대이며 사용중 ${s.assets.filter((a) => a.status === '사용중').length}대, 유휴·반납 ${s.assets.filter((a) => ['유휴', '반납대기'].includes(a.status)).length}대입니다. `
      + `90일 내 만료 계약이 ${n('만료 임박')}건 있어 갱신 검토가 필요하며, Discovery를 통해 대장에 편입된 자산은 ${s.assets.filter((a) => a.discoveredVia).length}대입니다.`
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
  return `사용자 ${s.users.length}명에 대해 화면·기능 단위 최소권한이 적용되어 있으며 MFA 적용률은 ${Math.round((s.users.filter((u) => u.mfa).length / s.users.length) * 100)}%입니다. `
    + `필수 결재 지정 화면은 ${s.approvalLines.filter((l) => l.required).length}개이며, 탐지 채널 ${s.scanPolicies.filter((p) => p.enabled).length}/${s.scanPolicies.length}이 정책에 따라 운영 중입니다.`
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
  const out: string[] = [`# ${title}`, '', `> ${period} · ${meta} · 생성일 ${TODAY}`, '', headline, '']
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
