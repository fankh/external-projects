'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { decideSaasStatus } from '@/lib/saas'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import type { SaasCatalogEntry } from '@/lib/types'

async function guard() {
  const session = await getSession()
  // 판정·격리 요청은 보안담당 권한 (화면 콜아웃과 일치). Admin 도 허용.
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) return null
  return session
}

/** Shadow SaaS 판정 — 발견된 서비스를 인가/차단/검토중으로 분류한다.
 *  카탈로그 항목을 서비스명으로 찾아 상태를 바꾸고, 사용 현황의 인가 여부에 환류한다(폐쇄 루프 §04).
 *  판정은 SaaS 카탈로그(환경설정)에도 그대로 반영된다 — 두 화면이 같은 카탈로그를 본다. */
export async function classifyShadowSaas(service: string, status: SaasCatalogEntry['status']) {
  const session = await guard()
  if (!session) return { ok: false, message: 'SaaS 판정은 보안담당·Admin 만 가능합니다.' }

  const s = getStore()
  const entry = s.saasCatalog.find((x) => x.service === service)
  if (!entry) return { ok: false, message: `카탈로그에 없는 서비스입니다 — ${service}` }
  if (entry.status === status) return { ok: true, message: '' }

  // 판정 로직 단일화 — 설정 카탈로그(decideSaas)와 동일한 상태 반영·사용현황 동기화·차단 집행 요청.
  // 그동안 Shadow SaaS 화면 차단은 카탈로그 상태만 바꾸고 보안운영팀 프록시·DNS 차단 집행 요청이 누락됐다.
  const { newlyBlocked } = decideSaasStatus(entry, status, session.name)

  appendAudit({ actor: session.name, action: `Shadow SaaS 판정 → ${status}${newlyBlocked ? ' · 보안운영팀 차단 집행 요청' : ''}`, target: service })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${service} → ${status}${status === '인가' ? ' (인가 카탈로그 등재)' : newlyBlocked ? ' (차단 대상 · 프록시·DNS 차단 집행 요청)' : status === '차단' ? ' (차단 대상)' : ''}` }
}
