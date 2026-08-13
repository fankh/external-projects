'use server'
import { revalidatePath } from 'next/cache'
import { appendAdminAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { escalate } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { SCAN_INTERVALS, type Channel, type SaasCatalogEntry } from '@/lib/types'

/** 정책 변경은 전량 추적 (§07 감사) — 적재는 lib/audit 로 일원화 */
const audit = appendAdminAudit

async function requireAdmin() {
  const session = await getSession()
  return session?.role === 'ADMIN' ? session : null
}

/** 탐지 채널 on/off — 비활성 채널은 수집을 중단하고 상태바 커넥터 수에 반영된다 */
export async function toggleScanChannel(channel: Channel) {
  const session = await requireAdmin()
  if (!session) return
  const s = getStore()
  const p = s.scanPolicies.find((x) => x.channel === channel)
  if (!p) return
  p.enabled = !p.enabled
  audit(session.name, `탐지 채널 ${p.enabled ? '활성화' : '비활성화'}`, channel)
  revalidatePath('/', 'layout')
}

/** 스캔 강도 조정 — 능동 스캔의 운영망 영향 통제 (스캔 안전장치) */
export async function setScanIntensity(channel: Channel, intensity: '낮음' | '보통' | '높음') {
  const session = await requireAdmin()
  if (!session) return
  const s = getStore()
  const p = s.scanPolicies.find((x) => x.channel === channel)
  if (!p) return
  p.intensity = intensity
  audit(session.name, `스캔 강도 변경 → ${intensity}`, channel)
  revalidatePath('/', 'layout')
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
  // 시간대 형식 — 'HH:MM ~ HH:MM' 또는 '상시'
  if (window !== '상시' && !/^\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2}$/.test(window)) {
    return { ok: false, message: "수집 시간대는 'HH:MM ~ HH:MM' 또는 '상시'로 입력하세요." }
  }
  const beforeT = p.targets, beforeW = p.window
  p.targets = targets
  p.window = window === '상시' ? '상시' : window.replace(/\s*~\s*/, ' ~ ')
  if (beforeT === p.targets && beforeW === p.window) return { ok: false, message: '변경 내용이 이전과 같습니다.' }
  audit(session.name, `스캔 정책 변경 — 대역 ${beforeT} → ${p.targets} · 시간대 ${beforeW} → ${p.window}`, channel)
  revalidatePath('/', 'layout')
  return { ok: true, message: `${channel} 스캔 정책 변경 — 대역·시간대 갱신` }
}

/** SaaS 카탈로그 판정 — 인가/차단 결과가 Shadow SaaS 현황으로 환류된다 */
export async function decideSaas(id: string, status: SaasCatalogEntry['status']) {
  const session = await requireAdmin()
  if (!session) return
  const s = getStore()
  const entry = s.saasCatalog.find((x) => x.id === id)
  if (!entry) return
  const prev = entry.status
  entry.status = status
  entry.decidedAt = today()
  entry.decidedBy = session.name

  // 폐쇄 루프 — 카탈로그 판정을 Shadow SaaS 사용 현황에 반영
  const usage = s.saas.find((u) => u.service === entry.service)
  if (usage) usage.sanctioned = status === '인가'

  // 차단 판정은 정책 표시로 끝나지 않고 보안운영팀에 프록시·DNS 차단 집행을 요청한다
  // (검출→조치 — 외부 노출 차단(로29)과 대칭. 그동안 차단은 카탈로그 상태만 바꿨다.)
  const newlyBlocked = status === '차단' && prev !== '차단'
  if (newlyBlocked) {
    escalate({ to: '보안운영팀', subject: `${entry.service} 차단 판정 — 프록시·DNS 차단 집행 요청 (데이터 등급 ${entry.dataGrade})`, kind: '격리 통보', ref: entry.id, sms: `${entry.service} 차단 집행 — 프록시·DNS (등급 ${entry.dataGrade})` })
  }

  audit(session.name, `SaaS 카탈로그 판정 → ${status}${newlyBlocked ? ' · 보안운영팀 차단 집행 요청' : ''}`, entry.service)
  revalidatePath('/', 'layout')
}

/** SaaS 데이터 등급 분류 — 데이터 민감도(일반/민감/기밀)를 지정한다. 등급은 차단 집행 우선순위·기밀 취급 집계의 근거로,
 *  그동안 시드 고정·표시 전용이던 공백을 메운다. 데이터 분류는 거버넌스 결정이므로 Admin. */
export async function setSaasDataGrade(id: string, grade: SaasCatalogEntry['dataGrade']) {
  const session = await requireAdmin()
  if (!session) return { ok: false, message: '데이터 등급 분류 권한이 없습니다 (Admin).' }
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

/** AI 거버넌스 토글 — 권한 필터·자동 승인·재학습 */
export async function toggleAiPolicy(field: 'scopeFilter' | 'autoApprove' | 'feedbackLearning') {
  const session = await requireAdmin()
  if (!session) return
  const s = getStore()
  s.aiPolicy[field] = !s.aiPolicy[field]
  const label = { scopeFilter: '권한 범위 필터', autoApprove: 'AI 제안 자동 승인', feedbackLearning: '판정 결과 재학습' }[field]
  audit(session.name, `AI 정책 변경 — ${label} ${s.aiPolicy[field] ? 'ON' : 'OFF'}`, 'AI 정책')
  revalidatePath('/', 'layout')
}

/** AI 실행 환경 변경 — 온프레미스/외부 API/하이브리드 */
export async function setAiDeployment(deployment: '온프레미스 LLM' | '외부 API 연계' | '하이브리드') {
  const session = await requireAdmin()
  if (!session) return
  const s = getStore()
  s.aiPolicy.deployment = deployment
  audit(session.name, `AI 실행 환경 변경 → ${deployment}`, 'AI 정책')
  revalidatePath('/', 'layout')
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
  if (!session) return
  const s = getStore()
  const g = s.codeGroups.find((x) => x.id === groupId)
  const v = g?.values.find((x) => x.code === code)
  if (!g || !v) return
  v.active = !v.active
  audit(session.name, `공통코드 ${v.active ? '사용' : '미사용'} — ${v.label}`, `${g.id}.${code}`)
  revalidatePath('/', 'layout')
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

  const before = v.label
  v.label = label
  audit(session.name, `공통코드 명칭 수정 — ${before} → ${label}`, `${g.id}.${code}`)
  revalidatePath('/', 'layout')
  return { ok: true, message: `수정됨 — ${code} ${label}` }
}
