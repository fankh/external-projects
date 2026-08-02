'use server'
import { revalidatePath } from 'next/cache'
import { appendAdminAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import type { Channel, SaasCatalogEntry } from '@/lib/types'

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
    dispatch({ channel: '이메일', to: '보안운영팀', subject: `${entry.service} 차단 판정 — 프록시·DNS 차단 집행 요청 (데이터 등급 ${entry.dataGrade})`, kind: '격리 통보', ref: entry.id })
  }

  audit(session.name, `SaaS 카탈로그 판정 → ${status}${newlyBlocked ? ' · 보안운영팀 차단 집행 요청' : ''}`, entry.service)
  revalidatePath('/', 'layout')
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
