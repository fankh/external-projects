'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit, appendDenial } from '@/lib/audit'
import { decideSaasStatus } from '@/lib/saas'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
import { can } from '@/lib/perm'
import type { SaasCatalogEntry } from '@/lib/types'

async function guard() {
  const session = await getSession()
  // 판정·격리 요청은 보안담당 권한 (화면 콜아웃과 일치). Admin 도 허용.
  if (!session) return null
  // 매트릭스 '저장' 칸도 필요조건 — 관리자가 회수하면 이 화면의 변경 액션이 모두 막힌다(조회 게이트와 같은 규약).
  //  그전에는 저장·삭제 칸이 어디서도 읽히지 않아 매트릭스에서 빼도 저장이 그대로 됐다(표시만 되는 정책).
  if (!['SEC_MGR', 'ADMIN'].includes(session.role) || !can('Shadow SaaS', '저장', session.role)) {
    // 거부는 감사에 남긴다 — 서버 액션은 화면에서 버튼을 숨겨도 액션 id 로 직접 호출할 수 있다.
    //  화면 진입·문서 반출 거부는 이미 '결과=실패'로 남는데, 정작 변경을 시도한 기록만 빠져 있었다.
    //  같은 사람·같은 화면의 반복은 하루 한 건으로 접힌다(lib/audit appendDenial).
    appendDenial({ actor: session.name, action: '권한 밖 변경 시도 — Shadow SaaS (저장)', target: '/discovery/saas' })
    return null
  }
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

/** 중복 기능 SaaS 통합 정리 — §05 라이선스 최적화(기능05)의 '중복 기능 SaaS 통합 후보'를 판정에서 조치로 잇는다.
 *  같은 기능 분류에 인가 표준이 있으면, 그 분류의 미인가 중복 서비스를 표준으로 통합하고 나머지를 일괄 차단한다
 *  (개별 차단 classifyShadowSaas 와 같은 propagation — 사용현황 동기화·보안운영팀 프록시·DNS 차단 집행 요청).
 *  차단된 서비스는 통합 후보 집계에서 빠져(로69), 그동안 화면·리포트에만 있던 통합 후보가 실제로 정리된다. */
export async function consolidateSaas(category: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '통합 정리는 보안담당·Admin 만 가능합니다.' }

  const s = getStore()
  const blocked = new Set(s.saasCatalog.filter((c) => c.status === '차단').map((c) => c.service))
  const group = s.saas.filter((x) => x.category === category && !blocked.has(x.service))
  const std = group.find((x) => x.sanctioned)
  if (!std) return { ok: false, message: `인가 표준이 없는 분류입니다 — 먼저 표준 서비스를 인가 카탈로그에 등재하세요 (${category}).` }
  const shadows = group.filter((x) => !x.sanctioned)
  if (!shadows.length) return { ok: false, message: `정리할 미인가 중복 서비스가 없습니다 — ${category}.` }

  const names: string[] = []
  for (const sh of shadows) {
    let entry = s.saasCatalog.find((x) => x.service === sh.service)
    if (!entry) {
      // 카탈로그 미등재 미인가 서비스는 통합 정리 시 검토중으로 등재한 뒤 차단 판정한다(판정 이력 유지).
      entry = { id: nextId('CAT'), service: sh.service, category: sh.category, vendor: '-', status: '검토중', dataGrade: '일반', owner: sh.dept }
      s.saasCatalog.push(entry)
    }
    if (entry.status !== '차단') {
      decideSaasStatus(entry, '차단', session.name)
      names.push(sh.service)
    }
  }
  if (!names.length) return { ok: false, message: `이미 정리된 분류입니다 — ${category}.` }

  appendAudit({ actor: session.name, action: `중복 SaaS 통합 정리 — ${category}: ${std.service} 표준 유지 · 미인가 ${names.length}종 차단(${names.join('·')})`, target: category })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${category} 통합 정리 — ${std.service} 표준으로 통합 · 미인가 ${names.length}종(${names.join('·')}) 차단 집행 요청` }
}
