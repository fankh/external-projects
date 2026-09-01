'use server'
import { revalidatePath } from 'next/cache'
import { appendAdminAudit } from '@/lib/audit'
import { codeUsage } from '@/lib/codes'
import { today } from '@/lib/dates'
import { dispatch, escalate } from '@/lib/notify'
import { normalizeScanWindow, scanWindowError } from '@/lib/scan-policy'
import { getSession } from '@/lib/session'
import { decideSaasStatus } from '@/lib/saas'
import { buildSaasReview, saasReviewAgeDays } from '@/lib/saas-review'
import { getStore, nextId } from '@/lib/store'
import { requiresApproval } from '@/lib/approval'
import { saasEscalateTargets } from '@/lib/reminders'
import { can, lockReason, PERM_ACTIONS } from '@/lib/perm'
import { LOCKED_AI_POLICY_TOGGLES, SCAN_INTERVALS, type Channel, type PermAction, type Role, type SaasCatalogEntry } from '@/lib/types'

/** 정책 변경은 전량 추적 (§07 감사) — 적재는 lib/audit 로 일원화 */
const audit = appendAdminAudit

async function requireAdmin() {
  const session = await getSession()
  return session?.role === 'ADMIN' ? session : null
}

/** SaaS 정책(카탈로그 판정·데이터 등급)은 보안담당 책무 — 제품안내서 §01 역할: 보안담당 'SaaS 정책 관리'
 *  (Admin 의 명시 관리 목록엔 SaaS 카탈로그가 없다). 보안담당·Admin 둘 다 허용한다. */
async function requireSaasPolicy() {
  const session = await getSession()
  return session && ['SEC_MGR', 'ADMIN'].includes(session.role) ? session : null
}

/** 탐지 채널 on/off — 비활성 채널은 수집을 중단하고 상태바 커넥터 수에 반영된다 */
/** 거절은 사유로 돌려준다 — void 로 조용히 무시하면 화면은 거절 사실을 알 수 없어, 눌러도 아무 일이 없는
 *  컨트롤이 된다(입고 검수·공통코드와 같은 규약). */
export async function toggleScanChannel(channel: Channel): Promise<{ ok: boolean; message: string }> {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: '탐지 채널 설정 권한이 없습니다 (Admin).' }
  const s = getStore()
  const p = s.scanPolicies.find((x) => x.channel === channel)
  if (!p) return { ok: false, message: `채널 정책을 찾을 수 없습니다 — ${channel}` }
  p.enabled = !p.enabled
  audit(session.name, `탐지 채널 ${p.enabled ? '활성화' : '비활성화'}`, channel)
  revalidatePath('/', 'layout')
  return { ok: true, message: `${channel} ${p.enabled ? '수집 재개' : '수집 중지'}` }
}

/** STEP2 기능 부여/회수 — 화면이 선언하는 기능(menuDefs.actions)을 편집한다. 부여하면 권한 매트릭스에서
 *  그 (화면×기능) 셀이 편집 가능해지고(na 해소), 회수하면 na 로 잠긴다. 서버 강제 기능(enforced)은
 *  코드 바인딩이라 회수 불가. can() 은 매트릭스 셀만 읽으므로(menuDefs.actions 비참조) 이 편집은 매트릭스
 *  가용성만 바꾸는 선언 편집이며 접근 상승 경로를 만들지 않는다 — 실제 접근은 매트릭스+코드가 결정(§02). Admin 전용. */
export async function toggleMenuAction(code: string, action: PermAction) {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: '메뉴·기능 관리는 Admin 만 가능합니다.' }
  const s = getStore()
  const def = s.menuDefs.find((d) => d.code === code)
  if (!def) return { ok: false, message: '화면 정의를 찾을 수 없습니다.' }
  if (def.enforced.includes(action)) return { ok: false, message: `'${action}'은 서버가 직접 강제하는 기능이라 회수할 수 없습니다 (코드 바인딩·API 403).` }
  const has = def.actions.includes(action)

  // 부여는 매트릭스를 "편집 가능하게"만 해야 한다 — 이 화면 안내문이 "여기 편집으로 권한이 상승하지 않습니다"
  //  라고 약속하는 바로 그 성질이다. 그런데 회수돼 있는 동안에도 매트릭스 칸에는 예전 값이 그대로 남아 있어,
  //  부여하는 순간 아무도 매트릭스에서 준 적 없는 허용이 켜졌다(시드의 자산 대장 × 격리요청 · SEC_MGR = y 가
  //  그런 값이었다 — 부여 한 번으로 보안담당에게 격리요청 권한이 생겼다). 그래서 부여할 때 그 열을 불가로
  //  되돌린다: 권한은 매트릭스에서 명시적으로 켤 때만 생긴다(fail closed). 잠긴 칸은 건드리지 않는다 —
  //  회수 자체가 금지된 칸이라 여기서 불가로 되돌리면 그 잠금을 우회하는 것이 된다.
  const reset: string[] = []
  if (!has) {
    const row = s.menuPermissions.find((m) => m.menu === def.menu)
    const idx = PERM_ACTIONS.indexOf(action)
    if (row && idx >= 0) {
      for (const role of ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN'] as Role[]) {
        if (lockReason(def.menu, action, role)) continue
        if (row.cells[role][idx] === 'n') continue
        reset.push(`${role}: ${row.cells[role][idx]} → n`)
        row.cells[role][idx] = 'n'
      }
    }
  }
  // PERM_ACTIONS 순서 유지 — 매트릭스 열 순서와 일치하도록 부여 시 정렬 삽입
  def.actions = has ? def.actions.filter((a) => a !== action) : PERM_ACTIONS.filter((a) => def.actions.includes(a) || a === action)
  //  초기화된 칸을 함께 남긴다 — 부여가 매트릭스 값을 바꾸므로, 무엇이 불가로 돌아갔는지 적지 않으면
  //   나중에 '왜 권한이 사라졌나'를 감사 로그에서 재구성할 수 없다.
  const resetNote = reset.length ? ` (매트릭스 초기화: ${reset.join(', ')})` : ''
  audit(session.name, `메뉴 기능 ${has ? '회수' : '부여'} — ${def.menu} × ${action}${resetNote}`, code)
  revalidatePath('/', 'layout')
  return { ok: true, message: `${def.menu} · '${action}' 기능 ${has ? '회수(매트릭스 na 잠금)' : '부여(매트릭스 편집 가능)'}` }
}

/** 스캔 강도 조정 — 능동 스캔의 운영망 영향 통제 (스캔 안전장치) */
export async function setScanIntensity(channel: Channel, intensity: '낮음' | '보통' | '높음'): Promise<{ ok: boolean; message: string }> {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: '스캔 강도 조정 권한이 없습니다 (Admin).' }
  const s = getStore()
  const p = s.scanPolicies.find((x) => x.channel === channel)
  if (!p) return { ok: false, message: `채널 정책을 찾을 수 없습니다 — ${channel}` }
  p.intensity = intensity
  audit(session.name, `스캔 강도 변경 → ${intensity}`, channel)
  revalidatePath('/', 'layout')
  return { ok: true, message: `${channel} 스캔 강도 → ${intensity}` }
}

/** 재탐지 주기 조정 — 도메인별 재탐지 스케줄(제품안내서 §04 "재탐지는 도메인별 주기(스케줄러)로 자동 반복").
 *  강도·대역·시간대는 조정되나 재탐지 주기만 표시 전용이던 공백을 메운다. 표준 프리셋에서만 선택(불규칙 값 방지). 전 채널. Admin. */
export async function setScanInterval(channel: Channel, rawInterval: string) {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: '스캔 정책 변경 권한이 없습니다 (Admin).' }
  const s = getStore()
  const p = s.scanPolicies.find((x) => x.channel === channel)
  if (!p) return { ok: false, message: '탐지 채널을 찾을 수 없습니다.' }
  const interval = rawInterval.trim()
  if (!(SCAN_INTERVALS as readonly string[]).includes(interval)) return { ok: false, message: '허용된 재탐지 주기에서 선택하세요.' }
  if (p.interval === interval) return { ok: false, message: '변경 내용이 이전과 같습니다.' }
  const before = p.interval
  p.interval = interval
  audit(session.name, `재탐지 주기 변경 — ${before} → ${interval}`, channel)
  revalidatePath('/', 'layout')
  return { ok: true, message: `${channel} 재탐지 주기 변경 — ${before} → ${interval}` }
}

/** 스캔 대상 대역·시간대 조정 — 능동 스캔의 스캔 안전장치(제품안내서 §07 "대역·시간대·강도 정책 통제").
 *  능동 채널만 대상. 시간대 밖 능동 스캔은 사유가 필요하므로(로15) 시간대는 운영 정책의 핵심 통제다. Admin. */
export async function setScanScope(channel: Channel, rawTargets: string, rawWindow: string) {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: '스캔 정책 변경 권한이 없습니다 (Admin).' }
  const s = getStore()
  const p = s.scanPolicies.find((x) => x.channel === channel)
  if (!p) return { ok: false, message: '탐지 채널을 찾을 수 없습니다.' }
  if (p.kind !== '능동') return { ok: false, message: '대역·시간대 통제는 능동 스캔 채널만 가능합니다.' }

  const targets = rawTargets.trim()
  const window = rawWindow.trim()
  if (!targets) return { ok: false, message: '대상 대역을 입력하세요.' }
  // 시간대 검증·정규화는 lib/scan-policy 단일 소스 — 판정(inScanWindow)과 같은 규칙으로 형식·범위를 본다.
  //  형식만 맞고 범위를 벗어난 값('99:99 ~ 88:77')이 저장되면 분 환산 경계가 현재 시각보다 커져 자정 넘김 창으로
  //  해석되고 판정이 항상 참이 된다 — §07 시간대 안전장치가 조용히 꺼진다.
  const windowError = scanWindowError(window)
  if (windowError) return { ok: false, message: windowError }
  const beforeT = p.targets, beforeW = p.window
  p.targets = targets
  p.window = normalizeScanWindow(window)
  if (beforeT === p.targets && beforeW === p.window) return { ok: false, message: '변경 내용이 이전과 같습니다.' }
  audit(session.name, `스캔 정책 변경 — 대역 ${beforeT} → ${p.targets} · 시간대 ${beforeW} → ${p.window}`, channel)
  revalidatePath('/', 'layout')
  return { ok: true, message: `${channel} 스캔 정책 변경 — 대역·시간대 갱신` }
}

/** SaaS 카탈로그 판정 — 인가/차단 결과가 Shadow SaaS 현황으로 환류된다 */
export async function decideSaas(id: string, status: SaasCatalogEntry['status']): Promise<{ ok: boolean; message: string }> {
  const session = await requireSaasPolicy()
  // 거부를 조용히 끝내면 버튼이 아무 반응 없이 죽는다 — 발견 자산 판정과 같이 사유를 돌려준다.
  if (!session) return { ok: false, message: 'SaaS 판정 권한이 없습니다 (보안담당·Admin).' }
  const s = getStore()
  const entry = s.saasCatalog.find((x) => x.id === id)
  if (!entry) return { ok: false, message: '카탈로그 항목을 찾을 수 없습니다.' }
  if (entry.status === status) return { ok: false, message: `이미 ${status} 상태입니다.` }
  // SaaS 인가가 필수 결재로 지정돼 있으면 직접 인가 판정을 막는다(차단·재검토는 보안 조치라 그대로 둔다).
  if (status === '인가' && requiresApproval('SaaS 인가')) {
    return { ok: false, message: 'SaaS 인가는 필수 결재로 지정돼 있습니다 — 인가 요청을 상신해 승인 후 판정하세요.' }
  }

  // 판정 로직 단일화 — Shadow SaaS 화면(classifyShadowSaas)과 동일한 상태 반영·사용현황 동기화·차단 집행 요청
  const { newlyBlocked, newlyUnblocked } = decideSaasStatus(entry, status, session.name)

  audit(session.name, `SaaS 카탈로그 판정 → ${status}${newlyBlocked ? ' · 보안운영팀 차단 집행 요청' : ''}${newlyUnblocked ? ' · 보안운영팀 차단 해제 집행 요청' : ''}`, entry.service)
  revalidatePath('/', 'layout')
  return {
    ok: true,
    message: status === '검토중'
      ? `${entry.service} 재검토 — 판정을 되돌리고 검토 기한을 다시 시작합니다${newlyUnblocked ? ' (차단 해제 집행 요청 발송)' : ''}.`
      : `${entry.service} ${status} 판정${newlyBlocked ? ' — 프록시·DNS 차단 집행 요청 발송' : ''}${newlyUnblocked ? ' — 차단 해제 집행 요청 발송' : ''}`,
  }
}

/** SaaS 판정 기한 경과 에스컬레이션 — 검토중인데 판정 기한(SLA)을 넘긴 SaaS 를 보안담당에게 판정 요청으로 통보한다.
 *  (그동안 기한 경과는 대시보드·화면에 '에스컬레이션'으로 표시만 되고 실제 통보 채널이 없었다 — 유지보수 예산 통보·대여 독촉과 같은 신호→조치.)
 *  기밀·민감 등급은 데이터 반출 위험이 커 문자(SMS) 즉시 알림을 병행한다. 당일 중복 발송 방지(ref=카탈로그 id). 보안담당·Admin. */
export async function escalateSaasReview() {
  const session = await requireSaasPolicy()
  if (!session) return { ok: false, message: 'SaaS 판정 에스컬레이션 권한이 없습니다 (보안담당·Admin).' }
  // 대상 판정은 화면 버튼 건수와 한 소스(lib/reminders) — 기한 경과 + 당일 발송분 제외.

  let n = 0
  for (const e of saasEscalateTargets()) {
    // 접수일이 없는 건도 에스컬레이션 대상이다(isSaasReviewOverdue fail safe) — 경과일을 0 으로 적으면
    //  '오늘 접수'처럼 읽히므로 기록 없음을 그대로 말한다.
    const age = saasReviewAgeDays(e)
    const ageText = age === null ? '검토 접수일 미기록' : `검토 ${age}일 경과`
    const subject = `SaaS 판정 기한 경과 — ${e.service} (데이터 등급 ${e.dataGrade} · ${ageText}) 인가/차단 판정 요망`
    if (e.dataGrade !== '일반') {
      // 기밀·민감 등급만 데이터 반출 위험이 커 문자(SMS)를 이메일과 병행한다. escalate 가 '[긴급]' 을 붙이므로 sms 문구엔 넣지 않는다.
      escalate({ to: '보안담당', subject, kind: 'SaaS 판정 독촉', ref: e.id, sms: `${e.service} 미판정 ${age === null ? '경과일 미상' : `${age}일`} (등급 ${e.dataGrade}) — 데이터 반출 위험, 즉시 판정` })
    } else {
      // 일반 등급은 이메일만 — escalate 는 sms 미지정 시에도 제목으로 문자를 보내므로, 일반 등급에 문자가 새지 않도록 dispatch 로 이메일만 발송한다.
      dispatch({ channel: '이메일', to: '보안담당', subject, kind: 'SaaS 판정 독촉', ref: e.id })
    }
    n += 1
  }

  if (n === 0) return { ok: false, message: '판정 기한 경과 SaaS 가 없습니다 (오늘 발송분 제외).' }
  audit(session.name, `SaaS 판정 기한 경과 에스컬레이션 (${n}건)`, 'SaaS 카탈로그')
  revalidatePath('/', 'layout')
  return { ok: true, message: `SaaS 판정 독촉 ${n}건 발송 — 보안담당에 미판정 검토중 SaaS 판정 요청 (발송 이력 적재)` }
}

/** SaaS 데이터 등급 분류 — 데이터 민감도(일반/민감/기밀)를 지정한다. 등급은 차단 집행 우선순위·기밀 취급 집계의 근거로,
 *  그동안 시드 고정·표시 전용이던 공백을 메운다. 데이터 분류는 보안 정책이므로 보안담당·Admin(§01 보안담당 SaaS 정책 관리). */
export async function setSaasDataGrade(id: string, grade: SaasCatalogEntry['dataGrade']) {
  const session = await requireSaasPolicy()
  if (!session) return { ok: false, message: '데이터 등급 분류 권한이 없습니다 (보안담당·Admin).' }
  const s = getStore()
  const entry = s.saasCatalog.find((x) => x.id === id)
  if (!entry) return { ok: false, message: 'SaaS 카탈로그 항목을 찾을 수 없습니다.' }
  if (entry.dataGrade === grade) return { ok: false, message: '변경 내용이 이전과 같습니다.' }
  const before = entry.dataGrade
  entry.dataGrade = grade
  audit(session.name, `SaaS 데이터 등급 분류 — ${before} → ${grade}`, entry.service)
  revalidatePath('/', 'layout')
  return { ok: true, message: `${entry.service} 데이터 등급 → ${grade}` }
}

/** SaaS 카탈로그 신규 등록 — 발견(Discovery) 이전이라도 조달·벤더 온보딩·수기 제보로 알게 된 SaaS 를 보안담당이 직접 카탈로그에 등재한다.
 *  그동안 카탈로그는 발견 판정(classifyShadowSaas)·인가 요청 결재로만 늘어, 담당자가 검토 대상을 스스로 올릴 수 없었다(공통코드엔 addCodeValue 가 있는데 SaaS 엔 없던 create 공백).
 *  기본 '검토중'·reviewSince=오늘 으로 등재해 판정 SLA·에스컬레이션(buildSaasReview·escalateSaasReview)이 곧바로 잡게 한다. 보안담당·Admin. */
export async function addSaasCatalogEntry(input: { service: string; category: string; vendor: string; owner: string; dataGrade: SaasCatalogEntry['dataGrade'] }): Promise<{ ok: boolean; message: string }> {
  const session = await requireSaasPolicy()
  if (!session) return { ok: false, message: 'SaaS 카탈로그 등록 권한이 없습니다 (보안담당·Admin).' }
  const service = input.service.trim()
  if (!service) return { ok: false, message: '서비스명을 입력하세요.' }
  const s = getStore()
  if (s.saasCatalog.some((x) => x.service.toLowerCase() === service.toLowerCase())) {
    return { ok: false, message: `이미 카탈로그에 있는 서비스입니다 — ${service}` }
  }
  const category = input.category.trim() || '기타'
  const vendor = input.vendor.trim() || '-'
  const owner = input.owner.trim() || session.dept
  const grade: SaasCatalogEntry['dataGrade'] = (['일반', '민감', '기밀'] as const).includes(input.dataGrade) ? input.dataGrade : '일반'
  s.saasCatalog.push({ id: nextId('CAT'), service, category, vendor, status: '검토중', dataGrade: grade, owner, reviewSince: today() })
  audit(session.name, `SaaS 카탈로그 등록 — ${service} (${category} · ${vendor} · 등급 ${grade}) → 검토중`, service)
  revalidatePath('/', 'layout')
  return { ok: true, message: `${service} 카탈로그 등재 — 검토중 (판정 대기)` }
}

/** AI 거버넌스 토글 — 권한 필터·자동 승인·재학습.
 *  권한 범위 필터는 잠금 대상이다(LOCKED_AI_POLICY_TOGGLES) — 스코핑은 코드가 항상 적용하므로 끌 수 없고,
 *  끈 것처럼 값만 내리면 거버넌스 리포트가 실제와 다른 통제 상태를 감사에 진술하게 된다. */
export async function toggleAiPolicy(field: 'scopeFilter' | 'autoApprove' | 'feedbackLearning') {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: 'AI 정책 변경 권한이 없습니다 (Admin).' }
  const label = { scopeFilter: '권한 범위 필터', autoApprove: 'AI 제안 자동 승인', feedbackLearning: '판정 결과 재학습' }[field]
  const lock = LOCKED_AI_POLICY_TOGGLES[field]
  if (lock) {
    return { ok: false, message: `${label}는 변경할 수 없습니다(${lock.pinned ? 'ON' : 'OFF'} 고정) — ${lock.why}` }
  }
  const s = getStore()
  s.aiPolicy[field] = !s.aiPolicy[field]
  audit(session.name, `AI 정책 변경 — ${label} ${s.aiPolicy[field] ? 'ON' : 'OFF'}`, 'AI 정책')
  revalidatePath('/', 'layout')
  return { ok: true, message: `${label} ${s.aiPolicy[field] ? 'ON' : 'OFF'}` }
}

/** AI 실행 환경 변경 — 온프레미스/외부 API/하이브리드 */
export async function setAiDeployment(deployment: '온프레미스 LLM' | '외부 API 연계' | '하이브리드'): Promise<{ ok: boolean; message: string }> {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: 'AI 실행 환경 변경 권한이 없습니다 (Admin).' }
  const s = getStore()
  s.aiPolicy.deployment = deployment
  audit(session.name, `AI 실행 환경 변경 → ${deployment}`, 'AI 정책')
  revalidatePath('/', 'layout')
  return { ok: true, message: `AI 실행 환경 → ${deployment}` }
}

/** AI 감사 로그 보존 기간 관리 — 규제·컴플라이언스에 따른 로그 보존 정책(제품안내서 §05 AI 거버넌스: "제안·질의·응답 전체 감사 로그 보존", §07 감사 추적성).
 *  분류 정확도(측정값)와 달리 보존 기간은 운영자가 정하는 정책값인데 그동안 표시 전용이었다. 30~3650일 범위. Admin. */
export async function setAuditRetention(rawDays: number) {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: '감사 로그 보존 정책 변경 권한이 없습니다 (Admin).' }
  const days = Math.round(Number(rawDays))
  if (!Number.isFinite(days) || days < 30 || days > 3650) {
    return { ok: false, message: '보존 기간은 30~3650일(최대 10년) 사이여야 합니다.' }
  }
  const s = getStore()
  const before = s.aiPolicy.auditRetentionDays
  if (before === days) return { ok: false, message: '변경 내용이 이전과 같습니다.' }
  s.aiPolicy.auditRetentionDays = days
  audit(session.name, `AI 감사 로그 보존 기간 변경 — ${before}일 → ${days}일`, 'AI 정책')
  revalidatePath('/', 'layout')
  return { ok: true, message: `AI 감사 로그 보존 기간 → ${days}일` }
}

/** 운영 정책(임계값) 변경 — 소유자 확인 기한·결재 SLA·장기 미실측 기준·만료 알림 창을 운영자가 설정한다.
 *  그동안 코드 상수로 고정돼 표시만 되던 값을 스토어 단일 출처로 승격해 화면·리포트·스케줄러가 함께 참조한다(제품안내서 §02 정책 통제·§07 감사). Admin. */
export async function setOpsPolicy(input: { confirmDeadlineDays: number; approvalSlaDays: number; staleVerifyDays: number; expiryWindowDays: number; maintenanceWindowDays: number; safetyStock: number }) {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: '운영 정책 변경 권한이 없습니다 (Admin).' }
  const r = (v: number) => Math.round(Number(v))
  const cd = r(input.confirmDeadlineDays), sla = r(input.approvalSlaDays), sv = r(input.staleVerifyDays), ew = r(input.expiryWindowDays), mw = r(input.maintenanceWindowDays), ss = r(input.safetyStock)
  const bad = (v: number, lo: number, hi: number) => !Number.isFinite(v) || v < lo || v > hi
  if (bad(cd, 3, 30)) return { ok: false, message: '소유자 확인 기한은 3~30일 사이여야 합니다.' }
  if (bad(sla, 1, 14)) return { ok: false, message: '결재 SLA는 1~14일 사이여야 합니다.' }
  if (bad(sv, 30, 730)) return { ok: false, message: '장기 미실측 기준은 30~730일 사이여야 합니다.' }
  if (bad(ew, 30, 365)) return { ok: false, message: '만료 알림 창은 30~365일 사이여야 합니다.' }
  if (bad(mw, 7, 180)) return { ok: false, message: '정기 점검 창은 7~180일 사이여야 합니다.' }
  if (bad(ss, 0, 50)) return { ok: false, message: '안전재고 기준은 0~50대 사이여야 합니다.' }
  const s = getStore()
  const p = s.opsPolicy
  if (p.confirmDeadlineDays === cd && p.approvalSlaDays === sla && p.staleVerifyDays === sv && p.expiryWindowDays === ew && p.maintenanceWindowDays === mw && p.safetyStock === ss) {
    return { ok: false, message: '변경 내용이 이전과 같습니다.' }
  }
  const before = `확인기한 ${p.confirmDeadlineDays}·SLA ${p.approvalSlaDays}·미실측 ${p.staleVerifyDays}·만료창 ${p.expiryWindowDays}·점검창 ${p.maintenanceWindowDays}·안전재고 ${p.safetyStock}`
  p.confirmDeadlineDays = cd; p.approvalSlaDays = sla; p.staleVerifyDays = sv; p.expiryWindowDays = ew; p.maintenanceWindowDays = mw; p.safetyStock = ss
  audit(session.name, `운영 정책 변경 — [${before}] → [확인기한 ${cd}·SLA ${sla}·미실측 ${sv}·만료창 ${ew}·점검창 ${mw}·안전재고 ${ss}]`, '운영 정책')
  revalidatePath('/', 'layout')
  return { ok: true, message: `운영 정책 갱신 — 확인기한 ${cd}일·SLA ${sla}일·미실측 ${sv}일·만료창 ${ew}일·점검창 ${mw}일·안전재고 ${ss}대` }
}

/** AI 모델·프롬프트 버전 관리 — 배포된 AI 구성(모델·프롬프트 버전)의 변경 관리 기록 (제품안내서 §05 AI 거버넌스: "모델·프롬프트 버전 관리").
 *  AI 거버넌스·성능 리포트가 이 값을 근거로 산출하는 거버넌스 원장이다. 프롬프트 개정·모델 교체 시 기록한다. Admin. */
export async function setAiModel(rawModel: string, rawPrompt: string) {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: 'AI 버전 관리 권한이 없습니다 (Admin).' }
  const model = rawModel.trim()
  const prompt = rawPrompt.trim()
  if (!model || !prompt) return { ok: false, message: '모델 ID·프롬프트 버전을 입력하세요.' }
  const s = getStore()
  const bM = s.aiPolicy.modelId, bP = s.aiPolicy.promptVersion
  if (bM === model && bP === prompt) return { ok: false, message: '변경 내용이 이전과 같습니다.' }
  s.aiPolicy.modelId = model
  s.aiPolicy.promptVersion = prompt
  audit(session.name, `AI 모델·프롬프트 버전 관리 — 모델 ${bM} → ${model} · 프롬프트 ${bP} → ${prompt}`, 'AI 정책')
  revalidatePath('/', 'layout')
  return { ok: true, message: `AI 버전 갱신 — 모델 ${model} · 프롬프트 ${prompt}` }
}

/** 공통코드 값 사용/미사용 */
export async function toggleCodeValue(groupId: string, code: string) {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: '권한이 없습니다.' }
  // 매트릭스 '삭제'(레코드 삭제·비활성화) 칸도 필요조건 — 코드 미사용 전환이 곧 비활성화다.
  if (!can('권한 · 정책', '삭제', session.role)) return { ok: false, message: '코드 미사용 전환 권한이 회수되었습니다 (권한 · 정책의 삭제).' }
  const s = getStore()
  const g = s.codeGroups.find((x) => x.id === groupId)
  const v = g?.values.find((x) => x.code === code)
  if (!g || !v) return { ok: false, message: '코드를 찾을 수 없습니다.' }
  // 미사용 전환 가드 — 살아있는 레코드가 참조하는 코드는 미사용화하면 드롭다운에서 사라져 사각지대가 생긴다.
  // 먼저 참조 자산·레코드를 다른 코드로 이관한 뒤에야 미사용 전환할 수 있다(참조 무결성). 재사용(사용 전환)은 제한 없음.
  if (v.active) {
    const used = codeUsage(g.id, v.label)
    if (used > 0) {
      return { ok: false, message: `사용 중인 코드는 미사용 전환할 수 없습니다 — '${v.label}'을(를) 참조하는 레코드 ${used}건. 먼저 이관 후 전환하세요.` }
    }
  }
  v.active = !v.active
  audit(session.name, `공통코드 ${v.active ? '사용' : '미사용'} — ${v.label}`, `${g.id}.${code}`)
  revalidatePath('/', 'layout')
  return { ok: true, message: `${v.label} → ${v.active ? '사용' : '미사용'}` }
}

type CodeRes = { ok: boolean; message: string }

/** 공통코드 값 신규 등록 — 코드 체계에 값을 추가한다.
 *  추가 즉시 전 화면 드롭다운(위치·자산유형 등)에 선택지로 나타난다(폐쇄 루프).
 *  삭제는 없다 — 무결성 원칙상 미사용 전환만 허용한다. */
export async function addCodeValue(groupId: string, rawCode: string, rawLabel: string): Promise<CodeRes> {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: '코드 등록은 Admin 만 가능합니다.' }
  const s = getStore()
  const g = s.codeGroups.find((x) => x.id === groupId)
  if (!g) return { ok: false, message: '코드 그룹을 찾을 수 없습니다.' }

  const code = rawCode.trim().toUpperCase()
  const label = rawLabel.trim()
  if (!code || !label) return { ok: false, message: '코드와 명칭을 모두 입력하세요.' }
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) {
    return { ok: false, message: '코드는 영문 대문자·숫자·(-,_)만 쓸 수 있고 문자/숫자로 시작해야 합니다.' }
  }
  if (g.values.some((v) => v.code === code)) {
    return { ok: false, message: `이미 존재하는 코드입니다 — ${code}` }
  }
  // 명칭(label) 유일성 — 참조가 label 로 저장되므로 같은 그룹에 같은 명칭이 둘이면 코드→참조 매핑이 모호해지고
  //  드롭다운에 동일 명칭이 중복 노출된다(rename 가드와 동일 근거 — label 이 사실상 참조 키).
  if (g.values.some((v) => v.label === label)) {
    return { ok: false, message: `이미 같은 명칭의 코드가 있습니다 — ${label}` }
  }

  const sort = g.values.reduce((m, v) => Math.max(m, v.sort), 0) + 1
  g.values.push({ code, label, sort, active: true })
  audit(session.name, `공통코드 등록 — ${label}`, `${g.id}.${code}`)
  revalidatePath('/', 'layout')
  return { ok: true, message: `등록됨 — ${g.name} · ${code} ${label}` }
}

/** 공통코드 명칭 수정 — 코드 자체는 참조 무결성 때문에 바꾸지 않고 표시 명칭만 고친다. */
export async function renameCodeValue(groupId: string, code: string, rawLabel: string): Promise<CodeRes> {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: '코드 수정은 Admin 만 가능합니다.' }
  const s = getStore()
  const g = s.codeGroups.find((x) => x.id === groupId)
  const v = g?.values.find((x) => x.code === code)
  if (!g || !v) return { ok: false, message: '코드를 찾을 수 없습니다.' }

  const label = rawLabel.trim()
  if (!label) return { ok: false, message: '명칭을 입력하세요.' }
  if (label === v.label) return { ok: true, message: '' }

  // 참조 무결성 — 참조는 코드값(label)으로 저장되므로(codeUsage 도 label 매칭), 사용 중인 코드의 명칭을 바꾸면
  //  기존 레코드는 옛 label 을 그대로 들고 있어 고아가 되고(드롭다운·codeUsage 사각지대), 바뀐 새 label 은 참조 0 으로
  //  집계돼 미사용 전환 가드까지 우회된다(toggleCodeValue 가 막는 바로 그 구멍을 rename 이 열던 공백).
  //  상태·대사결과처럼 label 이 코드 로직에 하드코딩된 그룹은 cascade 도 위험하므로, 미사용 전환과 동일하게 '이관 후 변경'으로 잠근다.
  const used = codeUsage(g.id, v.label)
  if (used > 0) {
    return { ok: false, message: `사용 중인 코드는 명칭을 바꿀 수 없습니다 — '${v.label}'을(를) 참조하는 레코드 ${used}건. 먼저 이관 후 변경하세요.` }
  }
  // 명칭 유일성 — 다른 코드가 이미 쓰는 명칭으로는 바꿀 수 없다(addCodeValue 와 동일 근거 · label 이 참조 키).
  if (g.values.some((x) => x.code !== code && x.label === label)) {
    return { ok: false, message: `이미 같은 명칭의 코드가 있습니다 — ${label}` }
  }

  const before = v.label
  v.label = label
  audit(session.name, `공통코드 명칭 수정 — ${before} → ${label}`, `${g.id}.${code}`)
  revalidatePath('/', 'layout')
  return { ok: true, message: `수정됨 — ${code} ${label}` }
}
