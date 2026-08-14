'use server'
import { revalidatePath } from 'next/cache'
import { recordAiCall } from '@/lib/ai-status'
import { appendAudit } from '@/lib/audit'
import { acquisitionCostOf, assetTco, bookValueOf } from '@/lib/cost'
import { daysUntil, isLoanOverdue, isLoanDueSoon, isMaintenanceDue, isMaintenanceOverdue, isRepairOverdue, isStaleVerify, parsePeriodWindow, roundProgressPct, today } from '@/lib/dates'
import { eolOsOf } from '@/lib/eol'
import { lowStockCategories } from '@/lib/stock'
import { REPORT_KINDS, createReport, licenseOptimization, replacementCandidates } from '@/lib/reports'
import { buildVulnPriority } from '@/lib/vuln-priority'
import { buildAnomalies } from '@/lib/anomaly'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { canDecideApproval } from '@/lib/approval'
import { ASSET_CATEGORIES } from '@/lib/types'
import type { ChatMessage, ReportKind, Role } from '@/lib/types'

/** 리포트 생성 인텐트 — 어시스턴트가 실제로 리포트를 만든다 (제품안내서 §05 리포트 자동화:
 *  "자연어 자산 질의·리포트 생성"). 생성 동사 + (리포트 언급 또는 리포트 종류 매칭)일 때만 발동한다.
 *  반환: null=일반 질의 / {kind}=해당 종류 생성 / {}=종류 미지정(되물음). */
function detectReportIntent(q: string): { kind?: ReportKind } | null {
  if (!/(생성|만들|만드|작성|뽑아|뽑|출력|발행|산출)/.test(q)) return null
  const kindMatchers: [RegExp, ReportKind][] = [
    [/월간|자산\s*현황/, '월간 자산 현황'],
    [/라이선스|컴플라이언스|license/i, '라이선스 컴플라이언스'],
    [/재물조사|실사|재고조사/, '재물조사 결과 요약'],
    [/감사\s*대응|감사\s*자료|감사/, '감사 대응 자료'],
    [/교체|수명|내용연수|노후/, '연간 교체 계획'],
    [/취약점|우선순위|vuln|cve/i, '취약점 조치 우선순위'],
    [/ai\s*거버넌스|거버넌스|정확도|채택률|프롬프트|모델\s*버전|ai\s*성능/i, 'AI 거버넌스·성능'],
    [/shadow|섀도|쉐도|발견|브리핑|주간/i, '주간 Shadow IT 브리핑'],
  ]
  const kind = kindMatchers.find(([re]) => re.test(q))?.[1]
  if (!kind && !/(리포트|보고서)/.test(q)) return null
  return { kind }
}

/** 권한 범위 내 자산 데이터를 질의 컨텍스트로 요약 (RAG 대체 — 데모 스코프) */
function buildContext(userName: string, isUser: boolean): string {
  const s = getStore()
  const assets = isUser ? s.assets.filter((a) => a.owner === userName) : s.assets
  const mine = s.approvals.filter((a) => a.requester === userName)
  const lines: string[] = [
    `기준일: ${today()}`,
    `[자산 대장] 총 ${assets.length}건`,
    ...assets.map((a) => `- ${a.assetNo} | ${a.category} | ${a.model} | ${a.status} | ${a.owner}/${a.dept} | ${a.location} | IP:${a.ip ?? '-'} | 보증만료:${a.warrantyEnd}`),
    `[내 신청] ${mine.length}건`,
    ...mine.map((a) => `- ${a.id} | ${a.kind} | ${a.title} | ${a.status}${a.status === '대기' ? ` (${a.currentStep})` : ''}`),
  ]
  if (!isUser) {
    lines.push(
      `[발견 자산] ${s.discovered.length}건`,
      ...s.discovered.map((d) => `- ${d.id} | ${d.hostname} | ${d.type} | ${d.channel} | ${d.state} | 위험도:${d.risk} | 최근:${d.lastSeen}${d.note ? ` | ${d.note}` : ''}`),
      `[계약] ${s.contracts.length}건`,
      ...s.contracts.map((c) => `- ${c.id} | ${c.name} | ${c.vendor} | 만료:${c.end} (D-${daysUntil(c.end)})${c.status === '해지' ? ' | 해지' : ''}`),
      `[라이선스]`,
      ...s.licenses.map((l) => `- ${l.name} | 보유:${l.purchased} 사용:${l.used} | 만료:${l.expiry}${l.status === '해지' ? ' | 해지' : ''}`),
      `[Shadow SaaS]`,
      ...s.saas.map((x) => `- ${x.service} | ${x.dept} | 사용자:${x.users} | ${x.sanctioned ? '인가' : '미인가'} | 위험도:${x.risk}`),
      `[재물조사] ${s.inventoryRounds.length}회차`,
      ...s.inventoryRounds.map((r) => `- ${r.name} | ${r.status} | ${r.scanned}/${r.planned} 스캔 | 차이:${r.mismatched} | 기한:${r.dueDate}`),
      `[결재 대기] ${s.approvals.filter((a) => a.status === '대기').length}건`,
      ...s.approvals.filter((a) => a.status === '대기').map((a) => `- ${a.id} | ${a.kind} | ${a.title} | ${a.currentStep}`),
      `[외부 위협] 외부 노출 미조치 ${s.external.filter((e) => !e.action && e.state !== '등록·일치').length} · 크리덴셜 노출 미조치 ${s.credentials.filter((c) => c.status !== '조치 완료').length} · IOC 상관 미조치 ${s.iocMatches.filter((i) => !i.action).length} · 다크웹 유출·침해 미조치 ${s.leaks.filter((l) => l.status !== '조치 완료').length}`,
      ...s.iocMatches.filter((i) => !i.action).map((i) => `- ${i.id} | IOC 상관 | ${i.iocType} ${i.iocValue} | 귀속:${i.threatActor} | 상관:${i.matchedAsset} | 위험도:${i.severity}`),
      `[엔드포인트·계정 위생] 휴면 계정 미처리 ${s.accounts.filter((a) => !a.action).length} · 미인가 SW 미조치 ${s.unauthorizedSw.filter((w) => !w.action).length} · USB 매체 미조치 ${s.usbFindings.filter((u) => !u.action).length} · 로컬 VM 미조치 ${s.localVms.filter((v) => !v.action).length}`,
      ...s.credentials.filter((c) => c.status !== '조치 완료').map((c) => `- ${c.id} | 크리덴셜 노출 | ${c.service} ${c.host}:${c.port} | ${c.issue} | 위험도:${c.severity}`),
      `[운영 리스크] 분실·도난 ${s.assets.filter((a) => a.status === '분실').length} · 장기미실측 ${s.assets.filter((a) => isStaleVerify(a, s.opsPolicy.staleVerifyDays)).length} · 대여연체 ${s.assets.filter(isLoanOverdue).length} · 수리중 ${s.assets.filter((a) => a.status === '수리중').length}(예상반환경과 ${s.assets.filter(isRepairOverdue).length})`,
      ...s.assets
        .filter((a) => a.status === '분실' || isStaleVerify(a, s.opsPolicy.staleVerifyDays) || isLoanOverdue(a) || a.status === '수리중')
        .map((a) => `- ${a.assetNo} | ${a.model} | ${a.status === '분실' ? '분실·도난' : a.status === '수리중' ? `수리중(${a.repair?.vendor ?? '의뢰 전'}${isRepairOverdue(a) ? ' · 예상반환경과' : ''})` : isLoanOverdue(a) ? `대여연체(${a.owner}, 기한 ${a.loanDueDate})` : `장기미실측(최근 실측 ${a.lastVerifiedAt ?? '없음'})`}`),
    )
  }
  return lines.join('\n')
}

/** 키 미설정 시 스텁 — 스토어 데이터 기반 결정적 응답 (edim 패턴: 샘플 모드) */
function stubAnswer(question: string, userName: string, isUser: boolean, role: Role): ChatMessage {
  const s = getStore()
  const q = question.toLowerCase()

  // 내 신청 상태 — 본인이 상신한 결재 (전 권한그룹, 본인 범위). 조직 결재 큐(비사용자)와 구분해 '내 신청'으로 잡는다.
  if (q.includes('내 신청') || q.includes('신청 상태') || q.includes('내 요청')) {
    const mine = s.approvals.filter((a) => a.requester === userName)
    const cnt = (st: string) => mine.filter((a) => a.status === st).length
    return {
      role: 'assistant',
      text: mine.length
        ? `${userName}님이 상신한 신청은 총 ${mine.length}건입니다 (대기 ${cnt('대기')} · 승인 ${cnt('승인')} · 반려 ${cnt('반려')} · 취소 ${cnt('취소')}).\n\n${mine
            .slice(0, 8)
            .map((a) => `· ${a.id} — ${a.title} [${a.status}${a.status === '대기' ? ` · ${a.currentStep}` : a.status === '반려' && a.rejectReason ? ` · 사유: ${a.rejectReason}` : ''}]`)
            .join('\n')}`
        : `${userName}님이 상신한 신청 내역이 없습니다. 자산 신청·반납·이동은 워크플로 › 신청·결재에서 상신할 수 있습니다.`,
      evidence: [{ label: '결재함', href: '/workflow/approvals' }],
    }
  }

  // 특정 자산 조회 — 질의에 자산번호(AST-YYYY-NNN…)가 있으면 그 자산의 현황·구성·변경 이력 타임라인을 답한다.
  //  근거는 레코드 단위 딥링크(?sel=)로 건다(안내서 §05 "근거 데이터 링크 — 해당 화면·레코드").
  //  AI 질의도 화면과 동일한 권한 범위 — 사용자 권한그룹은 본인 보유 자산만(대장 스코프와 동일).
  const anMatch = question.toUpperCase().match(/AST-\d{4}-\d{3,6}/)
  if (anMatch) {
    const no = anMatch[0]
    const asset = s.assets.find((a) => a.assetNo === no)
    if (!asset) {
      return { role: 'assistant', text: `${no} 자산을 대장에서 찾을 수 없습니다. 자산번호를 확인해 주세요.`, evidence: [{ label: '자산 대장', href: '/assets/register' }] }
    }
    if (isUser && asset.owner !== userName) {
      return { role: 'assistant', text: `${no}는 본인 보유 자산이 아니어서 상세를 조회할 수 없습니다. AI 질의도 화면과 동일한 권한 범위를 적용합니다.`, evidence: [{ label: '내 보유 자산', href: '/assets/register' }] }
    }
    const wd = asset.warrantyEnd && asset.warrantyEnd !== '-' ? daysUntil(asset.warrantyEnd) : null
    const eol = eolOsOf(asset.os, today())
    const hist = asset.history.slice(-6)
    const cfg = [asset.cpu, asset.memory, asset.os && `OS ${asset.os}`].filter(Boolean).join(' · ') || '-'
    return {
      role: 'assistant',
      text: [
        `${asset.assetNo} — ${asset.model} (${asset.category})`,
        ``,
        `· 상태 ${asset.status} · 사용자 ${asset.owner} / ${asset.dept} · 위치 ${asset.location}${asset.criticality ? ` · 업무 중요도 ${asset.criticality}` : ''}`,
        `· 구성: ${cfg}${eol ? ` (OS 지원 종료 ${eol.label} · EOL — 교체·업그레이드 대상)` : ''} · IP ${asset.ip ?? '-'} · MAC ${asset.mac ?? '-'} · S/N ${asset.serial}`,
        `· 취득 ${asset.purchaseDate} · 보증 ${asset.warrantyEnd}${wd !== null ? ` (${wd < 0 ? `만료 경과 ${-wd}일` : `D-${wd}`})` : ''}${asset.contractId ? ` · 계약 ${asset.contractId}` : ''}${asset.discoveredVia ? ` · 편입 경로 ${asset.discoveredVia}` : ''}`,
        ``,
        `변경 이력 (최근 ${hist.length}건 · 전체 ${asset.history.length}건):`,
        ...hist.map((h) => `   - ${h.date} [${h.kind}] ${h.detail} · ${h.actor}`),
      ].join('\n'),
      evidence: [{ label: '자산 대장 (해당 레코드)', href: `/assets/register?sel=${no}` }],
    }
  }

  if (!isUser && (q.includes('재물조사') || q.includes('실사') || q.includes('재고조사'))) {
    const cur = s.inventoryRounds.find((r) => r.status === '진행중')
    const rounds = s.inventoryRounds
    return {
      role: 'assistant',
      text: cur
        ? `진행 중인 재물조사는 '${cur.name}'이며 진행률 ${roundProgressPct(cur)}% (${cur.scanned.toLocaleString()}/${cur.planned.toLocaleString()} 스캔)입니다. 차이 항목 ${cur.mismatched}건이 조정 결재 대상이며 기한은 ${cur.dueDate}입니다.\n\n전체 회차 ${rounds.length}개 — ${rounds.map((r) => `${r.name}(${r.status})`).join(', ')}.`
        : `현재 진행 중인 재물조사가 없습니다. 전체 회차 ${rounds.length}개: ${rounds.map((r) => `${r.name}(${r.status})`).join(', ')}.`,
      evidence: [
        { label: '재물조사 수행', href: '/inventory/survey' },
        { label: '재물조사 계획', href: '/inventory/survey-plan' },
      ],
    }
  }
  if (!isUser && (q.includes('결재') || q.includes('승인 대기') || q.includes('상신'))) {
    const pend = s.approvals.filter((a) => a.status === '대기')
    const byKind = [...new Set(pend.map((a) => a.kind))].map((k) => `${k} ${pend.filter((a) => a.kind === k).length}건`)
    // 내가 지금 결재할 수 있는 건 — 대시보드 '내 결재 차례'와 동일 게이트(canDecideApproval + 본인 상신분 제외)를
    //  재사용해, 전체 대기 중 이 권한그룹이 현재 단계에서 처리 가능한 실행 대상을 함께 제시한다(AI 질의도 동일 권한 모델).
    const canDo = (a: (typeof pend)[number]) => a.requester !== userName && canDecideApproval(role, a)
    const mineNow = pend.filter(canDo)
    return {
      role: 'assistant',
      text: `현재 결재 대기 ${pend.length}건입니다 (이 중 ${userName}님이 지금 결재할 수 있는 건 ${mineNow.length}건).${pend.length
        ? `\n\n종류별: ${byKind.join(', ')}.\n\n${(mineNow.length ? mineNow : pend).slice(0, 6).map((a) => `· ${a.id} — ${a.title} (현재 단계: ${a.currentStep}${canDo(a) ? ' · 내 결재 가능' : ''})`).join('\n')}`
        : ''}`,
      evidence: [{ label: '결재함', href: '/workflow/approvals' }],
    }
  }
  if (!isUser && (q.includes('미인가') || q.includes('saas') || q.includes('새스') || q.includes('섀도'))) {
    const shadow = s.saas.filter((x) => !x.sanctioned)
    const saasEv = [
      { label: 'Shadow SaaS', href: '/discovery/saas' },
      { label: 'SaaS 카탈로그', href: '/settings/saas-catalog' },
    ]
    // "A부서에서 쓰는 …" — 질문에 언급된 부서로 좁힌다. 부서 후보는 SaaS 목록뿐 아니라 대장 전체에서 모아,
    //  미인가 SaaS 기록이 없는 부서를 물어도 전체로 잘못 확장하지 않고 '해당 없음'으로 정확히 답한다.
    //  이름이 겹치면(영업팀 vs 영업1팀) 더 긴(구체적인) 부서명을 우선 매칭한다.
    const allDepts = [...new Set([...s.saas.map((x) => x.dept), ...s.assets.map((a) => a.dept)])]
      .filter((d) => d && d !== '전사' && d !== '미지정').sort((a, b) => b.length - a.length)
    const dept = allDepts.find((d) => question.includes(d))
    const items = dept ? shadow.filter((x) => x.dept === dept) : shadow
    if (dept && items.length === 0) {
      return {
        role: 'assistant',
        text: `${dept}에서 사용하는 미인가(Shadow) SaaS는 없습니다. (전사 미인가 SaaS는 ${shadow.length}종입니다.)`,
        evidence: saasEv,
      }
    }
    const users = items.reduce((n, x) => n + x.users, 0)
    return {
      role: 'assistant',
      text: `${dept ? `${dept}의 ` : ''}미인가(Shadow) SaaS는 ${items.length}종이며 추정 사용자는 총 ${users}명입니다.\n\n${items
        .map((x) => `· ${x.service} — ${x.dept} · 추정 사용자 ${x.users}명 (분류 ${x.category}, 위험도 ${x.risk})`)
        .join('\n')}\n\n인가·차단 판정은 Discovery › Shadow SaaS 또는 환경설정 › SaaS 카탈로그에서 처리합니다.`,
      evidence: saasEv,
    }
  }
  // 발견 자산 AI 요약 브리핑 (제품안내서 §05) — 목록 나열이 아니라 Discovery 전반의 상태를 한눈에 요약.
  // 문구 특정 키워드로 일반 '발견'/'미등록' 인텐트보다 먼저 매칭한다.
  if (!isUser && (q.includes('브리핑') || q.includes('발견 자산 요약') || q.includes('발견 현황') || q.includes('디스커버리 요약') || q.includes('discovery 요약'))) {
    const disc = s.discovered
    const byState = (st: string) => disc.filter((d) => d.state === st).length
    const byRisk = (r: string) => disc.filter((d) => d.risk === r).length
    const chan = [...new Set(disc.map((d) => d.channel))]
      .map((c) => `${c} ${disc.filter((d) => d.channel === c).length}`).join(' · ')
    const untriaged = disc.filter((d) => d.state === '미등록' && !d.action).length
    const confirming = disc.filter((d) => d.action === '확인요청').length
    const extOpen = s.external.filter((e) => !e.action && e.state !== '등록·일치').length
    const leakOpen = s.leaks.filter((l) => l.status !== '조치 완료').length
    const credOpen = s.credentials.filter((c) => c.status !== '조치 완료').length
    // 엔드포인트·계정 위생(채널 04 EDR · 06 AD/IdP) — 대시보드·리포트와 동일 기준으로 브리핑에 함께 요약
    const acctOpen = s.accounts.filter((a) => !a.action).length
    const swOpen = s.unauthorizedSw.filter((w) => !w.action).length
    const usbOpen = s.usbFindings.filter((u) => !u.action).length
    const vmOpen = s.localVms.filter((v) => !v.action).length
    const endpointOpen = acctOpen + swOpen + usbOpen + vmOpen
    return {
      role: 'assistant',
      text: [
        `【발견 자산 요약 브리핑】 총 ${disc.length}건이 지문 병합 기준으로 관측되었습니다.`,
        ``,
        `· 대사 상태: 등록·일치 ${byState('등록·일치')} · 등록·불일치 ${byState('등록·불일치')} · 미등록 ${byState('미등록')} · 미확인 ${byState('미확인')}`,
        `· 위험도: 높음 ${byRisk('높음')} · 중간 ${byRisk('중간')} · 낮음 ${byRisk('낮음')}`,
        `· 채널별 관측: ${chan}`,
        ``,
        `▶ 외부 위협 미조치: 외부 노출 ${extOpen}건, 크리덴셜 노출 ${credOpen}건(인증 취약점), IOC 상관 ${s.iocMatches.filter((i) => !i.action).length}건(위협 인텔), 다크웹 유출·침해 ${leakOpen}건.`,
        `▶ 엔드포인트·계정 위생 미조치: 휴면 계정 ${acctOpen}건, 미인가 SW ${swOpen}건, USB 매체 ${usbOpen}건, 로컬 VM ${vmOpen}건 (채널 04 EDR·06 AD/IdP).`,
        `▶ 미처리 미등록 ${untriaged}건(소유자 확인·편입·격리 판정 대기), 확인요청 진행 ${confirming}건.`,
        untriaged + extOpen + leakOpen + credOpen + endpointOpen > 0
          ? `우선순위: 다크웹 유출·크리덴셜 노출·외부 노출(외부 위협) → 미등록 고위험 → 엔드포인트·계정 위생(EOL 게스트·관리자 계정 우선) 순으로 처리하고, 확인 기한 경과 건은 격리 요청으로 에스컬레이션하십시오.`
          : `현재 즉시 조치가 필요한 미처리 건은 없습니다. 정기 재탐지 주기를 유지하십시오.`,
      ].join('\n'),
      evidence: [
        { label: '발견 자산 목록', href: '/discovery/found' },
        { label: 'CMDB 대사', href: '/discovery/reconcile' },
        { label: '외부 공격표면', href: '/discovery/external' },
      ],
    }
  }
  if (!isUser && (q.includes('미등록') || q.includes('발견') || q.includes('shadow'))) {
    const all = s.discovered.filter((d) => d.state === '미등록' && !d.action)
    // 기간 스코프 — "이번 달 새로 발견된…"처럼 시점을 좁히면 최초 발견일(firstSeen) 기준으로 그 창 안만 답한다
    //  (안내서 §05 예시 질의 #1). 기간 토큰이 없으면 전량(처리 대기 미등록)을 답한다.
    const period = parsePeriodWindow(q, today())
    const items = period ? all.filter((d) => d.firstSeen >= period.start && d.firstSeen <= period.end) : all
    // 네트워크 세그먼트 — 서버·IDC망 10.10.x / 사무·업무망 10.20.x / 클라우드망 10.30~31.x.
    // (시드 기준: 서버는 10.10.x IDC 대역, 10.20.31.x 는 플랫폼개발팀 사무망 — 서버 대역이 아니다)
    const seg = (ip: string) => ip.startsWith('10.10.') ? '서버·IDC망'
      : ip.startsWith('10.20.') ? '사무·업무망'
        : /^10\.3[01]\./.test(ip) ? '클라우드망' : '기타'
    const inServer = items.filter((d) => seg(d.ip) === '서버·IDC망')
    // 서버망에 있는 미등록 '단말' = 서버 VLAN 침입 의심(높은 우선순위)
    const rogueTermInServer = inServer.filter((d) => d.type.includes('단말'))
    return {
      role: 'assistant',
      text: [
        period
          ? `${period.label}에 새로 발견된(최초 발견일 기준) 미등록 자산은 ${items.length}건입니다.`
          : `처리 대기 중인 미등록 발견 자산은 ${items.length}건입니다.`,
        ``,
        ...(items.length === 0 ? ['해당 기간에 새로 발견된 미등록 자산이 없습니다.'] : []),
        ...items.map((d) => `· ${d.id} — ${d.hostname} (${d.type}, ${d.channel}, ${d.ip} · ${seg(d.ip)}, 최초 발견 ${d.firstSeen}, 위험도 ${d.risk})`),
        ``,
        `서버·IDC망(10.10.x)에 있는 미등록 자산은 ${inServer.length}건${rogueTermInServer.length > 0 ? `이며, 그중 단말 ${rogueTermInServer.length}건은 서버 VLAN 침입 의심으로 최우선 격리 대상입니다` : '입니다'}.`,
        `소유자 확인 요청 후 편입 또는 격리 처리를 권장합니다.`,
      ].join('\n'),
      evidence: [
        { label: '발견 자산 목록', href: '/discovery/found' },
        { label: 'CMDB 대사', href: '/discovery/reconcile' },
      ],
    }
  }
  // 교체 대상·수명 예측 (AI 기능 03 수명주기·교체 예측) — 내용연수 초과·보증 경과·OS 지원 종료(EOL) 자산을
  //  연간 교체 계획 리포트와 동일한 근거(replacementCandidates)로 인라인 답변한다. 리포트 생성 동사가 없을 때 이 인텐트가 받는다.
  if (!isUser && (q.includes('교체') || q.includes('수명') || q.includes('내용연수') || q.includes('노후') || q.includes('eol'))) {
    const t = today()
    const { cands, budget, residualBook } = replacementCandidates()
    const eolAssets = s.assets.filter((a) => !['폐기완료', '폐기예정'].includes(a.status) && eolOsOf(a.os, t))
    const cat = ASSET_CATEGORIES.find((c) => q.includes(c.toLowerCase()))
    const scoped = cat ? cands.filter((x) => x.a.category === cat) : cands
    const list = scoped.slice(0, 12)
    return {
      role: 'assistant',
      text: [
        `${cat ? `${cat} ` : ''}교체 대상 자산은 ${scoped.length}건입니다 (내용연수 5년 초과·보증 경과·장애 이력(잦은 수리) 기준${cat ? '' : ` · 교체 예산 추정 ${budget.toLocaleString()}원 · 잔여 장부가 ${residualBook.toLocaleString()}원`}).`,
        ``,
        ...(scoped.length === 0 ? ['해당 조건의 교체 대상 자산이 없습니다.'] : []),
        ...list.map((x) => `· ${x.a.assetNo} — ${x.a.model} (${x.a.category}, 도입 ${x.a.purchaseDate} · ${x.why}, 잔여 장부가 ${x.book.toLocaleString()}원)`),
        scoped.length > list.length ? `… 외 ${scoped.length - list.length}건` : ``,
        ``,
        eolAssets.length > 0
          ? `▶ OS 지원 종료(EOL) 자산 ${eolAssets.length}건 — 하드웨어 노후와 별개의 교체·업그레이드 드라이버(미패치 취약점 상시 노출): ${eolAssets.slice(0, 6).map((a) => `${a.assetNo}(${eolOsOf(a.os, t)?.label})`).join(', ')}.`
          : `▶ OS 지원 종료(EOL) 자산은 없습니다.`,
      ].filter(Boolean).join('\n'),
      evidence: [
        { label: '연간 교체 계획 리포트', href: '/ai/reports' },
        { label: '자산 대장 (EOL OS 필터)', href: '/assets/register?os=eol' },
      ],
    }
  }
  // 취약점 조치 우선순위 인라인 질의 (AI 기능 04) — 자산 중요도 × 노출도 스코어링을 P1/P2/P3 로 요약. 리포트 생성(생성 동사)과 별개.
  if (!isUser && (q.includes('취약점') || q.includes('조치 우선순위') || q.includes('vuln') || q.includes('p1'))) {
    const { items, p1, p2, p3 } = buildVulnPriority()
    const top = items.slice(0, 8)
    return {
      role: 'assistant',
      text: [
        `취약점 조치 우선순위 — 총 ${items.length}건 (P1 즉시 ${p1} · P2 우선 ${p2} · P3 계획 ${p3}). 자산 중요도 × 노출도 스코어링.`,
        ``,
        ...(items.length === 0 ? ['조치 대상 취약점이 없습니다.'] : []),
        ...top.map((v) => `· [${v.tier}] ${v.target} — ${v.source}: ${v.detail} (점수 ${v.score})`),
        items.length > top.length ? `\n… 외 ${items.length - top.length}건은 분석·예측 화면에서 확인하세요.` : ``,
      ].filter(Boolean).join('\n'),
      evidence: [{ label: '취약점 우선순위 (분석·예측)', href: '/ai/insights' }],
    }
  }
  // 이상 자산 행위 탐지 인라인 질의 (AI 기능 02) — 평시 프로파일(설치 SW·상태·데이터 반출) 대비 이탈을 요약.
  if (!isUser && (q.includes('이상 행위') || q.includes('이상 탐지') || q.includes('이상 자산') || q.includes('anomal') || q.includes('프로파일 이탈'))) {
    const { items, byKind } = buildAnomalies()
    const top = items.slice(0, 8)
    return {
      role: 'assistant',
      text: [
        `이상 자산 행위 탐지 — 총 ${items.length}건 (${byKind.filter((k) => k.count).map((k) => `${k.kind} ${k.count}`).join(' · ') || '이탈 없음'}). 평시 프로파일 대비 이탈.`,
        ``,
        ...(items.length === 0 ? ['평시 프로파일 대비 이탈이 없습니다.'] : []),
        ...top.map((a) => `· [${a.kind}] ${a.target} — ${a.detail} (${a.basis})`),
      ].filter(Boolean).join('\n'),
      evidence: [{ label: '이상 자산 행위 탐지 (분석·예측)', href: '/ai/insights' }],
    }
  }
  // 자산 보증 만료 (유형 스코프) — 안내서 §05 예시 질의 "보증 만료되는 네트워크 장비 목록".
  //  '보증' + 자산 맥락(유형/장비/자산)일 때 계약 만료가 아니라 대장 보증을 만료 임박순으로 답한다. 유형 언급 시 스코프.
  if (!isUser && q.includes('보증') && (ASSET_CATEGORIES.some((c) => q.includes(c.toLowerCase())) || q.includes('장비') || q.includes('자산') || q.includes('노트북') || q.includes('pc'))) {
    const cat = ASSET_CATEGORIES.find((c) => q.includes(c.toLowerCase()))
    // 기간 스코프 — "내년 1분기 보증 만료…"처럼 시점을 좁히면 그 기간 안에 만료되는 것만 답한다(안내서 §05 예시 질의)
    const period = parsePeriodWindow(q, today())
    const scoped = s.assets
      .filter((a) => !['폐기완료', '폐기예정'].includes(a.status) && a.warrantyEnd !== '-' && (!cat || a.category === cat))
      .filter((a) => !period || (a.warrantyEnd >= period.start && a.warrantyEnd <= period.end))
      .sort((a, b) => a.warrantyEnd.localeCompare(b.warrantyEnd))
    const soonN = scoped.filter((a) => (daysUntil(a.warrantyEnd) ?? 999) <= 90).length
    const list = scoped.slice(0, 12)
    const headline = period
      ? `${cat ? `${cat} ` : ''}${period.label} 보증 만료 예정 — ${scoped.length}건 (${period.start} ~ ${period.end}).`
      : `${cat ? `${cat} ` : ''}자산 보증 만료 현황 — 대상 ${scoped.length}건 (만료 임박순${soonN ? ` · 90일 내 ${soonN}건` : ''}).`
    return {
      role: 'assistant',
      text: [
        headline,
        ``,
        ...(scoped.length === 0 ? ['해당 기간에 보증이 만료되는 자산이 없습니다.'] : []),
        ...list.map((a) => `· ${a.assetNo} — ${a.model} (${a.category}, 보증 만료 ${a.warrantyEnd} · D-${daysUntil(a.warrantyEnd)})`),
        scoped.length > list.length ? `\n… 외 ${scoped.length - list.length}건은 대장 보증 임박 필터에서 확인하세요.` : ``,
      ].filter(Boolean).join('\n'),
      evidence: [{ label: '자산 대장 (보증 임박)', href: '/assets/register?warranty=soon' }],
    }
  }
  if (!isUser && (q.includes('만료') || q.includes('보증') || q.includes('계약'))) {
    // 기간 스코프 — "내년 상반기 만료 계약"처럼 시점을 좁히면 그 창 안에 만료되는 계약을, 아니면 운영 정책 만료창 임박분을 답한다
    const period = parsePeriodWindow(q, today())
    const win = s.opsPolicy.expiryWindowDays
    const hit = period
      ? s.contracts.filter((c) => c.status !== '해지' && c.end >= period.start && c.end <= period.end).sort((a, b) => a.end.localeCompare(b.end))
      : s.contracts.filter((c) => { const d = daysUntil(c.end); return c.status !== '해지' && d !== null && d <= win })
    const headline = period
      ? `${period.label} 만료 예정 계약은 ${hit.length}건입니다 (${period.start} ~ ${period.end}).`
      : `${win}일 내 만료 예정 계약은 ${hit.length}건입니다.`
    return {
      role: 'assistant',
      text: [
        headline,
        ``,
        ...(hit.length === 0 ? ['해당 기간에 만료되는 계약이 없습니다.'] : hit.map((c) => `· ${c.id} — ${c.name} (${c.vendor}, ${c.end} 만료, D-${daysUntil(c.end)})`)),
        !period ? `\n네트워크 장비 유지보수 계약(CT-2022-007)은 잔여 ${daysUntil('2026-08-31')}일로 갱신 협상이 시급합니다.` : ``,
      ].filter(Boolean).join('\n'),
      evidence: [{ label: '계약 · 라이선스', href: '/inventory/contracts' }],
    }
  }
  if (!isUser && (q.includes('라이선스') || q.includes('license'))) {
    // 산정은 분석 화면 패널·리포트와 동일한 licenseOptimization() 단일 소스 — 임계값(미사용 60%) 변경 시 세 화면이 함께 움직인다.
    const { over, under: low } = licenseOptimization()
    return {
      role: 'assistant',
      text: `라이선스 대사 결과 초과 사용 ${over.length}건, 장기 미사용 보유 ${low.length}건이 검출되었습니다.\n\n${over
        .map((l) => `· ${l.name} — 보유 ${l.purchased}석 / 사용 ${l.used}석 (${l.used - l.purchased}석 초과, 감사 리스크)`)
        .join('\n')}\n${low
        .map((l) => `· ${l.name} — 사용률 ${Math.round((l.used / l.purchased) * 100)}% (회수 후보 ${l.purchased - l.used}석, 연 ${Math.round(((l.purchased - l.used) * l.unitCost) / 10_000).toLocaleString()}만원 절감 가능)`)
        .join('\n')}`,
      evidence: [{ label: '라이선스 컴플라이언스', href: '/inventory/contracts' }],
    }
  }
  // 자산 가치·감가상각 질의 — 취득가·잔존가치(장부가)·TCO 를 조직 집계로 답한다(v1.180~186 원가 체인). 비사용자만(가치 집계는 권한 스코프).
  if (!isUser && (q.includes('자산 가치') || q.includes('자산가치') || q.includes('취득가') || q.includes('감가상각') || q.includes('잔존가치') || q.includes('장부가') || q.includes('총소유비용') || q.includes('tco') || q.includes('자산 가액'))) {
    const t = today()
    const valued = s.assets.filter((a) => a.status !== '폐기완료' && acquisitionCostOf(a) > 0)
    const totalAcq = valued.reduce((n, a) => n + acquisitionCostOf(a), 0)
    const totalBook = valued.reduce((n, a) => n + bookValueOf(a, t), 0)
    const totalRepair = valued.reduce((n, a) => n + (assetTco(a) - acquisitionCostOf(a)), 0)
    const dep = totalAcq ? Math.round((1 - totalBook / totalAcq) * 100) : 0
    const byCat = [...new Set(valued.map((a) => a.category))]
      .map((c) => {
        const list = valued.filter((a) => a.category === c)
        return { c, acq: list.reduce((n, a) => n + acquisitionCostOf(a), 0), book: list.reduce((n, a) => n + bookValueOf(a, t), 0), n: list.length }
      })
      .sort((a, b) => b.acq - a.acq)
    return {
      role: 'assistant',
      text: [
        `운영 자산 ${valued.length}대의 자산 가치입니다(정액법 감가상각 · 내용연수 5년, SW·가상자원 제외).`,
        ``,
        `· 총 취득가 ${totalAcq.toLocaleString()}원`,
        `· 총 잔존가치(장부가) ${totalBook.toLocaleString()}원 — 감가상각률 ${dep}%`,
        `· 누적 유지보수(수리) 비용 ${totalRepair.toLocaleString()}원`,
        ``,
        `유형별(취득가순):`,
        ...byCat.map((x) => `   - ${x.c} ${x.n}대 · 취득가 ${x.acq.toLocaleString()}원 / 장부가 ${x.book.toLocaleString()}원`),
      ].join('\n'),
      evidence: [
        { label: '자산 가치 현황(재고)', href: '/inventory/stock' },
        { label: '자산 대장', href: '/assets/register' },
      ],
    }
  }
  // 부서별 자산 보유 — 어느 부서가 얼마나 보유하는지(비용 배분·차지백 근거). '분포'가 상태별 인텐트에도 걸리므로
  //  '부서'가 포함된 질의는 여기서 먼저 잡는다. 미인가 SaaS·보증·라이선스 등 주제 인텐트는 위에서 이미 처리돼 안전.
  if (!isUser && q.includes('부서') && (q.includes('별') || q.includes('분포') || q.includes('보유') || q.includes('많') || q.includes('현황'))) {
    const live = s.assets.filter((a) => a.status !== '폐기완료')
    const byDept = new Map<string, { total: number; inUse: number }>()
    for (const a of live) {
      const cur = byDept.get(a.dept) ?? { total: 0, inUse: 0 }
      cur.total += 1
      if (a.status === '사용중') cur.inUse += 1
      byDept.set(a.dept, cur)
    }
    const rows = [...byDept.entries()].sort((x, y) => y[1].total - x[1].total)
    return {
      role: 'assistant',
      text: `부서별 자산 보유 현황입니다 (운영 자산 ${live.length}대 · 폐기완료 제외).\n\n${rows
        .map(([d, v]) => `· ${d}: ${v.total}대 (사용중 ${v.inUse})`)
        .join('\n')}`,
      evidence: [
        { label: '재고 현황', href: '/inventory/stock' },
        { label: '자산 대장', href: '/assets/register' },
      ],
    }
  }
  // 수령 미확인(인수 대기) — 불출 후 사용자가 인수 확인을 안 한 사용 중 자산. 대시보드 큐·독촉과 같은 판정(receiptPending·사용중).
  //  status 게이트로 회수·반납·폐기된 자산의 스테일 플래그는 제외한다(대시보드 큐와 동일 정의).
  if (!isUser && (q.includes('수령 미확인') || q.includes('인수 미확인') || q.includes('수령 확인') || q.includes('인수 확인'))) {
    const pend = s.assets.filter((a) => a.receiptPending && a.status === '사용중')
    return {
      role: 'assistant',
      text: pend.length === 0
        ? '불출 후 수령(인수) 확인이 안 된 자산이 없습니다 — 체인 오브 커스터디가 모두 확인됐습니다.'
        : `수령(인수) 미확인 자산 현황입니다 (불출 배정 후 사용자 인수 확인 대기 · ${pend.length}건).\n\n${pend
            .slice(0, 12)
            .map((a) => `· ${a.assetNo} — ${a.model} · ${a.owner} (${a.dept})`)
            .join('\n')}\n\n대장의 수령 확인 독촉 발송으로 미확인 사용자에게 인수 확인을 요청할 수 있습니다.`,
      evidence: [
        { label: '자산 대장 (수령 미확인)', href: '/assets/register' },
        { label: '대시보드', href: '/dashboard' },
      ],
    }
  }
  // 안전재고 부족(발주 검토) — 불출형 유형(단말·주변기기) 가용 재고가 안전재고 미만인 유형. 재고 화면·대시보드와 같은 lib/stock 판정을 쓴다.
  //  '재고 규모'(상태별 분포)와 구분되도록 '재고 부족'·'안전재고'·'발주'·'스톡아웃'만 잡는다.
  if (!isUser && (q.includes('재고 부족') || q.includes('안전재고') || q.includes('발주') || q.includes('재고 보충') || q.includes('스톡아웃'))) {
    const low = lowStockCategories(s.assets, s.disposals, s.opsPolicy.safetyStock)
    return {
      role: 'assistant',
      text: low.length === 0
        ? `불출형 재고(단말·주변기기)가 모두 안전재고(${s.opsPolicy.safetyStock}대) 이상입니다 — 발주 검토 대상이 없습니다.`
        : `안전재고 미달(발주 검토) 유형입니다 (안전재고 ${s.opsPolicy.safetyStock}대 기준 · 가용 = 유휴이며 폐기 절차 미진입).\n\n${low
            .map((r) => `· ${r.category}: 가용 ${r.available}대 / 안전재고 ${r.safetyStock}대 — ${r.available === 0 ? '재고 소진' : `${r.short}대 부족`}`)
            .join('\n')}\n\n재고 화면의 발주 요청 발송으로 구매·IT기획팀에 보충을 요청할 수 있습니다.`,
      evidence: [
        { label: '재고 현황 (안전재고 경보)', href: '/inventory/stock' },
        { label: '자산 대장', href: '/assets/register' },
      ],
    }
  }
  // 자산 현황·분포 — 총 보유·상태별 분포·대여 현황을 한 번에 답한다 (조직 집계, 비사용자).
  //  '대여 현황'·'대여 중'은 여기서(전체 대여), '대여 연체'는 아래 운영 리스크 인텐트에서 처리한다.
  if (!isUser && (q.includes('상태별') || q.includes('분포') || q.includes('보유 현황') || q.includes('보유 대수') || q.includes('몇 대') || q.includes('자산 현황') || q.includes('재고 규모') || q.includes('대여 현황') || q.includes('대여 중'))) {
    const STATS = ['사용중', '유휴', '대여중', '수리중', '반납대기', '검수중', '분실', '폐기예정', '폐기완료'] as const
    const byStatus = (st: string) => s.assets.filter((a) => a.status === st).length
    const dist = STATS.filter((st) => byStatus(st) > 0).map((st) => `${st} ${byStatus(st)}`)
    const loans = s.assets.filter((a) => a.status === '대여중')
    const overdueN = s.assets.filter(isLoanOverdue).length
    return {
      role: 'assistant',
      text: `자산 대장 현황입니다.\n\n· 총 보유 ${s.assets.length}대 (운영 ${s.assets.length - byStatus('폐기완료')} · 폐기완료 ${byStatus('폐기완료')})\n· 상태별 분포: ${dist.join(' · ')}\n· 대여 현황: ${loans.length}건 대여 중${overdueN ? ` (반환 연체 ${overdueN}건)` : ''}${loans.length ? `\n${loans.slice(0, 8).map((a) => `   - ${a.assetNo} ${a.model} · ${a.owner} (반환 ${a.loanDueDate ?? '-'}${isLoanOverdue(a) ? ' · 연체' : ''})`).join('\n')}` : ''}`,
      evidence: [
        { label: '자산 대장', href: '/assets/register' },
        { label: '재고 현황', href: '/inventory/stock' },
      ],
    }
  }

  // 정기 점검(예방 정비) 대상 — 예정일이 도래·경과한 자산을 경과(미시행)·임박으로 나눠 답한다 (자산팀 사전 정비 대상).
  //  대장 필터·대시보드 큐·독촉과 같은 lib/dates 판정(isMaintenanceDue/Overdue)을 쓴다 — 어시스턴트가 별도 임계값을 만들지 않는다.
  if (!isUser && (q.includes('정기 점검') || q.includes('예방 정비') || q.includes('점검 대상') || q.includes('점검 밀린') || q.includes('점검 경과') || q.includes('정비'))) {
    const due = s.assets.filter(isMaintenanceDue)
    const overdue = due.filter(isMaintenanceOverdue).sort((a, b) => (a.maintenanceDue ?? '').localeCompare(b.maintenanceDue ?? ''))
    const soon = due.filter((a) => !isMaintenanceOverdue(a)).sort((a, b) => (a.maintenanceDue ?? '').localeCompare(b.maintenanceDue ?? ''))
    const fmt = (a: (typeof due)[number]) => `${a.assetNo} — ${a.model} · ${a.owner} (${a.dept}) · 예정 ${a.maintenanceDue}${isMaintenanceOverdue(a) ? ` · 경과 ${-(daysUntil(a.maintenanceDue!) ?? 0)}일` : ` · D-${daysUntil(a.maintenanceDue!) ?? 0}`}`
    return {
      role: 'assistant',
      text: due.length === 0
        ? '정기 점검(예방 정비) 예정이 도래한 자산이 없습니다. 자산 대장 상세의 ‘정기 점검 일정 등록’으로 운영 자산을 정비 사이클에 편입할 수 있습니다.'
        : `정기 점검(예방 정비) 대상 현황입니다 (예정일 30일 내·경과 · 자산팀 사전 정비 대상).\n\n· 예정일 경과(미시행): ${overdue.length}건${overdue.length ? `\n${overdue.slice(0, 8).map((a) => `   - ${fmt(a)}`).join('\n')}` : ''}\n· 점검 임박(D-30 내): ${soon.length}건${soon.length ? `\n${soon.slice(0, 8).map((a) => `   - ${fmt(a)}`).join('\n')}` : ''}\n\n경과분은 정기 점검 독촉으로 소유 부서에 시행을 요청하고, 점검 완료 시 다음 회차가 12개월 후로 재예약됩니다.`,
      evidence: [
        { label: '자산 대장 (정기 점검 대상)', href: '/assets/register?maint=1' },
        { label: '대시보드', href: '/dashboard' },
      ],
    }
  }
  // 운영 리스크 자산 — 분실·도난, 장기 미실측(유령 후보), 대여 반환 연체, 수리(지연)를 한 번에 훑는다 (자산팀 조치 대상)
  if (!isUser && (q.includes('분실') || q.includes('도난') || q.includes('미실측') || q.includes('유령') || q.includes('연체') || q.includes('대여') || q.includes('반출') || q.includes('수리') || q.includes('운영 리스크') || q.includes('리스크 자산'))) {
    const lost = s.assets.filter((a) => a.status === '분실')
    const stale = s.assets.filter((a) => isStaleVerify(a, s.opsPolicy.staleVerifyDays))
    const overdue = s.assets.filter(isLoanOverdue)
    const repairing = s.assets.filter((a) => a.status === '수리중')
    const repairLate = s.assets.filter(isRepairOverdue)
    const sec = (label: string, arr: typeof lost, fmt: (a: (typeof lost)[number]) => string) =>
      `· ${label}: ${arr.length}건${arr.length ? `\n${arr.slice(0, 8).map((a) => `   - ${fmt(a)}`).join('\n')}` : ''}`
    return {
      role: 'assistant',
      text: `운영 리스크 자산 현황입니다 (자산팀 조치 대상).\n\n${[
        sec('분실·도난 신고', lost, (a) => `${a.assetNo} — ${a.model} (${a.dept})`),
        sec('장기 미실측(유령 후보)', stale, (a) => `${a.assetNo} — ${a.model} · 최근 실측 ${a.lastVerifiedAt ?? '없음'}`),
        sec('대여 반환 연체', overdue, (a) => `${a.assetNo} — ${a.model} · ${a.owner} (기한 ${a.loanDueDate})`),
        sec(`수리중 (예상 반환 경과 ${repairLate.length}건)`, repairing, (a) => `${a.assetNo} — ${a.model}${a.repair ? ` · ${a.repair.vendor}${a.repair.eta ? ` (예상반환 ${a.repair.eta}${isRepairOverdue(a) ? ' · 지연' : ''})` : ''}` : ' · 의뢰 전'}`),
      ].join('\n\n')}\n\n분실은 회수·폐기 확정, 장기 미실측은 수시 재물조사 편성, 대여 연체는 반환 독촉, 수리 지연은 업체 독촉으로 처리합니다.`,
      evidence: [
        { label: '자산 대장 (장기 미실측 필터)', href: '/assets/register' },
        { label: '재물조사 계획', href: '/inventory/survey-plan' },
      ],
    }
  }
  // 사용자 본인 수리 현황 질의 — 장애 신고·수리중인 본인 자산의 진행 상태(증상·업체·예상 반환)를 스코프해 답한다.
  //  장애 신고(대장 상세 접수) → 수리 → 반환 → 통보 루프의 사용자 추적 접점. 담당자용 운영 리스크(수리) 인텐트는 !isUser 라 여기서 처리.
  if (isUser && (q.includes('수리') || q.includes('장애') || q.includes('고장') || q.includes('repair'))) {
    const repairing = s.assets.filter((a) => a.owner === userName && a.status === '수리중')
    return {
      role: 'assistant',
      text: repairing.length === 0
        ? `${userName}님 명의로 수리 중인 자산이 없습니다. 사용 중 자산이 고장나면 자산 대장 상세의 ‘장애 신고 (수리 요청)’으로 접수할 수 있습니다.`
        : [
            `${userName}님 수리 현황 — ${repairing.length}건.`,
            ``,
            ...repairing.map((a) => `· ${a.assetNo} — ${a.model}${a.faultNote ? ` · 증상: ${a.faultNote}` : ''}${a.repair ? ` · ${a.repair.vendor}${a.repair.eta ? ` (예상 반환 ${a.repair.eta})` : ''}` : ' · 업체 배정 대기'}`),
          ].join('\n'),
      evidence: [{ label: '내 보유 자산', href: '/assets/register' }],
    }
  }
  // 사용자 본인 자산 자연어 질의 — 보증 만료 등을 본인 보유 자산에 스코프해 답한다(§01 사용자: 본인 보유 자산 조회, §05 권한 필터).
  // 담당자용 보증 인텐트(위)는 !isUser 라 사용자는 여기서 본인 자산만 대상으로 초점 답변을 받는다(전량 나열 catch-all 앞).
  if (isUser && (q.includes('보증') || q.includes('만료') || q.includes('워런티') || q.includes('warranty'))) {
    const owned = s.assets
      .filter((a) => a.owner === userName && !['폐기완료', '폐기예정'].includes(a.status) && a.warrantyEnd !== '-')
      .sort((a, b) => a.warrantyEnd.localeCompare(b.warrantyEnd))
    const soon = owned.filter((a) => (daysUntil(a.warrantyEnd) ?? 999) <= 90)
    const dText = (a: (typeof owned)[number]) => {
      const d = daysUntil(a.warrantyEnd) ?? 0
      return d < 0 ? `만료 경과 ${-d}일` : `D-${d}`
    }
    return {
      role: 'assistant',
      text: owned.length === 0
        ? `${userName}님 명의로 보증 관리 대상 자산이 없습니다. (폐기·SW·가상자원 등 보증 비대상 제외)`
        : [
            `${userName}님 보유 자산 보증 현황 — ${owned.length}건${soon.length ? ` · 90일 내 만료 ${soon.length}건 (교체·연장 검토)` : ''}.`,
            ``,
            ...owned.map((a) => `· ${a.assetNo} — ${a.model} (보증 만료 ${a.warrantyEnd} · ${dText(a)})`),
          ].join('\n'),
      evidence: [{ label: '내 보유 자산', href: '/assets/register' }],
    }
  }
  // 사용자 본인 대여 자산 반환 기한 질의 — 본인이 빌린 대여중 자산의 반환 마감을 스코프해 답한다(§01 사용자 본인 자산 조회 · 대여자 관점).
  // 담당자용 운영 리스크(대여 연체) 인텐트는 !isUser 라, 대여자는 여기서 본인 대여분만 초점 답변을 받는다.
  if (isUser && (q.includes('대여') || q.includes('반납') || q.includes('반환'))) {
    const loans = s.assets
      .filter((a) => a.status === '대여중' && a.owner === userName && a.loanDueDate)
      .sort((a, b) => (a.loanDueDate ?? '').localeCompare(b.loanDueDate ?? ''))
    const overdue = loans.filter(isLoanOverdue)
    return {
      role: 'assistant',
      text: loans.length === 0
        ? `${userName}님이 대여 중인 자산이 없습니다. 대여 신청은 워크플로 › 신청·결재에서 상신할 수 있습니다.`
        : [
            `${userName}님 대여 자산 반환 현황 — ${loans.length}건${overdue.length ? ` · 반환 연체 ${overdue.length}건(즉시 반납)` : ''}.`,
            ``,
            ...loans.map((a) => {
              const d = daysUntil(a.loanDueDate!) ?? 0
              const flag = isLoanOverdue(a) ? `반환 연체 ${-d}일 경과` : isLoanDueSoon(a) ? `반환 임박 D-${d}` : `D-${d}`
              return `· ${a.assetNo} — ${a.model} (반환 기한 ${a.loanDueDate} · ${flag})`
            }),
          ].join('\n'),
      evidence: [{ label: '내 보유 자산', href: '/assets/register' }],
    }
  }
  // 사용자 본인 QnA 문의·답변 현황 질의 — 본인이 등록한 문의와 답변 여부를 스코프해 답한다(§01 사용자 본인 조회 · 로7 문의→답변 작성자 측).
  if (isUser && (q.includes('문의') || q.includes('qna') || q.includes('질문') || q.includes('답변'))) {
    const myQna = s.posts
      .filter((p) => p.kind === 'QnA' && p.author === userName)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const answered = myQna.filter((p) => p.answer)
    return {
      role: 'assistant',
      text: myQna.length === 0
        ? `${userName}님이 등록한 문의가 없습니다. 궁금한 점은 게시판 › QnA에서 남겨 주세요.`
        : [
            `${userName}님 문의 ${myQna.length}건 — 답변 완료 ${answered.length}건 · 대기 ${myQna.length - answered.length}건.`,
            ``,
            ...myQna.map((p) => `· [${p.answer ? '답변' : '대기'}] ${p.title} (${p.category}, 등록 ${p.createdAt}${p.answer ? ` · 답변 ${p.answer.at}` : ''})`),
          ].join('\n'),
      evidence: [{ label: '내 문의 (QnA)', href: '/board/qna' }],
    }
  }
  const mine = s.assets.filter((a) => a.owner === userName)
  if (q.includes('내') || q.includes('보유') || isUser) {
    return {
      role: 'assistant',
      text: mine.length
        ? `${userName}님이 보유 중인 자산은 ${mine.length}건입니다.\n\n${mine
            .map((a) => `· ${a.assetNo} — ${a.model} (${a.status}, 보증 만료 ${a.warrantyEnd})`)
            .join('\n')}`
        : `${userName}님 명의로 등록된 자산이 없습니다. 자산 신청은 워크플로 › 신청·결재에서 상신할 수 있습니다.`,
      evidence: [{ label: '자산 대장', href: '/assets/register' }],
    }
  }
  return {
    role: 'assistant',
    text: `현재 데모 모드(ANTHROPIC_API_KEY 미설정)로 동작 중입니다. 다음과 같은 질의를 지원합니다.\n\n· "이번 달 새로 발견된 미등록 단말 중 서버 대역에 있는 것은?"\n· "특정 부서에서 쓰는 미인가 SaaS와 추정 사용자 수"\n· "재물조사 진행률"\n· "결재 대기 현황"\n· "만료 임박한 계약 목록"\n· "내년 1분기 보증 만료되는 네트워크 장비 목록" (기간 지정 — 분기·반기·월·연도)\n· "라이선스 초과 사용 현황"\n· "교체 대상 자산과 교체 예산 (내용연수·보증·EOL OS)"\n· "자산 상태 분포와 대여 현황"\n· "부서별 자산 보유 현황"\n· "자산 가치 현황 (취득가·잔존가치·감가상각)"\n· "취약점 조치 우선순위 (P1/P2/P3)"\n· "이상 자산 행위 탐지 (프로파일 이탈)"\n· "분실·대여 연체·장기 미실측 등 운영 리스크 자산 현황"\n· "정기 점검(예방 정비) 대상 자산"\n· "안전재고 부족(발주 검토) 유형"\n· "수령(인수) 미확인 자산"\n· "AST-2023-000112 자산의 상태와 변경 이력" (자산번호로 특정 자산 조회)\n· "내 보유 자산"\n· "내 수리 현황"\n· "내 신청 상태"`,
  }
}

/** AI 질의 감사 기록 — AI 거버넌스는 "제안·질의·응답 전체를 감사 로그로 보존"을 요구한다
 *  (제품안내서 §05). 질의 원문과 응답 경로를 남겨야 권한 밖 데이터 접근 여부를 사후 검증할 수 있다.
 *  응답 전문은 길어 로그를 삼키므로 경로·길이만 남긴다. */
function auditQuery(actor: string, question: string, route: string, chars: number) {
  const q = question.trim().replace(/\s+/g, ' ')
  appendAudit({
    actor,
    action: `AI 질의 (${route}) — "${q.length > 60 ? `${q.slice(0, 60)}…` : q}" → 응답 ${chars}자`,
    target: 'AI 어시스턴트',
  })
}

export async function askAssistant(question: string): Promise<ChatMessage> {
  const session = await getSession()
  if (!session) return { role: 'assistant', text: '세션이 만료되었습니다. 다시 로그인해 주세요.' }
  const isUser = session.role === 'USER'

  // 리포트 생성 인텐트 — LLM/규칙 응답 이전에 결정적으로 처리한다(실제 리포트를 만드는 액션이므로 키 유무와 무관).
  const reportIntent = detectReportIntent(question)
  if (reportIntent) {
    if (isUser) {
      auditQuery(session.name, question, '리포트 생성 거부(권한)', 0)
      return { role: 'assistant', text: '리포트 생성은 자산담당·보안담당·관리자 권한에서 가능합니다. 담당자에게 요청하거나, 자산 현황을 질의로 물어봐 주세요.' }
    }
    if (!reportIntent.kind) {
      auditQuery(session.name, question, '리포트 종류 되물음', 0)
      return { role: 'assistant', text: `어떤 리포트를 생성할까요? 가능한 종류:\n${REPORT_KINDS.map((k) => `· ${k.kind} — ${k.desc}`).join('\n')}` }
    }
    const id = await createReport(reportIntent.kind, session.name)
    auditQuery(session.name, question, `리포트 생성 (${reportIntent.kind})`, 0)
    revalidatePath('/', 'layout')
    return {
      role: 'assistant',
      text: `‘${reportIntent.kind}’ 리포트를 생성했습니다 — ${id}. 문서로 열람하거나 결재 첨부용 엑셀(xlsx)로 내려받고, 리포트 화면에서 결재 첨부·배포할 수 있습니다.`,
      evidence: [
        { label: `${id} 문서 열기`, href: `/api/reports/${encodeURIComponent(id)}?format=md` },
        { label: '엑셀 내려받기', href: `/api/reports/${encodeURIComponent(id)}?format=xlsx` },
        { label: '리포트 화면', href: '/ai/reports' },
      ],
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    const stub = stubAnswer(question, session.name, isUser, session.role)
    auditQuery(session.name, question, '규칙 응답', stub.text.length)
    return stub
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      // claude-opus-5는 thinking 기본 on — max_tokens가 thinking+응답 합산 상한이라 여유를 둔다
      model: process.env.ANTHROPIC_MODEL_ID || 'claude-opus-5',
      max_tokens: 8192,
      system:
        `당신은 SEEKERSLAB ITAM 플랫폼의 AI 자산 어시스턴트입니다. ` +
        `아래 자산 데이터(사용자 권한 범위 내)만 근거로 한국어로 간결히 답하세요. ` +
        `데이터에 없는 내용은 없다고 답하세요. 수치는 데이터와 정확히 일치해야 합니다.\n\n` +
        buildContext(session.name, isUser),
      messages: [{ role: 'user', content: question }],
    })
    if (response.stop_reason === 'refusal') {
      auditQuery(session.name, question, '정책 거부', 0)
      return { role: 'assistant', text: '해당 질의는 정책상 응답할 수 없습니다.' }
    }
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
    recordAiCall(true)
    auditQuery(session.name, question, 'LLM', text.length)
    return {
      role: 'assistant',
      text,
      evidence: [{ label: '자산 대장', href: '/assets/register' }, { label: '발견 자산', href: '/discovery/found' }],
    }
  } catch (err) {
    recordAiCall(false, err instanceof Error ? err.message.slice(0, 80) : '알 수 없는 오류')
    auditQuery(session.name, question, 'LLM 호출 실패 → 규칙 응답', 0)
    return {
      role: 'assistant',
      text: `AI 서비스 호출에 실패했습니다 — ${err instanceof Error ? err.message : '알 수 없는 오류'}. 데모 응답으로 대체합니다.\n\n${stubAnswer(question, session.name, isUser, session.role).text}`,
    }
  }
}
