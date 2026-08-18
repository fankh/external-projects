'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { nowMinute, today } from '@/lib/dates'
import { dispatch, escalate } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
import type { EasmRun } from '@/lib/types'

/** 유출 대응 조치 — 다크웹 유출 검출에서 끝내지 않고 보안 대응까지 이어간다.
 *  대응은 보안 업무이므로 보안담당·Admin 만. 조치 사실은 보안팀 앞 통지 + 감사 로그에 남는다. */
export async function respondToLeak(leakId: string, note: string) {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '유출 대응 권한이 없습니다 (보안담당·Admin).' }
  }
  const action = note.trim()
  if (!action) return { ok: false, message: '대응 조치 내용을 입력하세요.' }

  const s = getStore()
  const leak = s.leaks.find((l) => l.id === leakId)
  if (!leak) return { ok: false, message: '유출 건을 찾을 수 없습니다.' }
  if (leak.status === '조치 완료') return { ok: false, message: '이미 조치 완료된 건입니다.' }

  leak.status = '조치 완료'
  leak.response = action
  leak.respondedBy = session.name
  leak.respondedAt = today()

  dispatch({ channel: '이메일', to: '보안운영팀', subject: `유출 대응 조치 — ${leak.kind}: ${action}`, kind: '위협 대응', ref: leak.id })
  appendAudit({ actor: session.name, action: `유출 대응 (${leak.kind}) — ${action}`, target: leak.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${leak.kind} 대응 완료 — 보안운영팀 통지·감사 기록 적재` }
}

/** 유출 대응 취소(재개) — 오조치·오분류였던 조치 완료를 되돌려 다시 미조치(대응 대상)로 되돌린다. 잘못 종결한 건이 미조치 큐·감사에서 사라지지 않게 한다. 보안담당·Admin. */
export async function reopenLeak(leakId: string) {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '유출 대응 취소 권한이 없습니다 (보안담당·Admin).' }
  }
  const s = getStore()
  const leak = s.leaks.find((l) => l.id === leakId)
  if (!leak) return { ok: false, message: '유출 건을 찾을 수 없습니다.' }
  if (leak.status !== '조치 완료') return { ok: false, message: '조치 완료된 건만 대응을 취소할 수 있습니다.' }
  const prior = leak.response
  leak.status = '미조치'
  leak.response = undefined
  leak.respondedBy = undefined
  leak.respondedAt = undefined
  appendAudit({ actor: session.name, action: `유출 대응 취소(재개) — ${leak.kind}${prior ? ` (이전 조치: ${prior})` : ''}`, target: leak.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${leak.kind} 대응 취소 — 미조치로 복귀(대응 대상)` }
}

/** 유출 일괄 대응 — 대량 유출 사고(다크웹 덤프 등)에서 다수 미조치 건에 같은 표준 조치를 한 번에 적용한다.
 *  건별 로직은 respondToLeak 과 동일하고 감사만 일괄로 남긴다. 이미 조치 완료된 건은 건너뛴다(멱등). 보안담당·Admin. */
export async function respondToLeakMany(ids: string[], note: string) {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '유출 대응 권한이 없습니다 (보안담당·Admin).' }
  }
  const action = note.trim()
  if (!action) return { ok: false, message: '대응 조치 내용을 입력하세요.' }
  const s = getStore()
  const targets = s.leaks.filter((l) => ids.includes(l.id) && l.status !== '조치 완료')
  if (targets.length === 0) return { ok: false, message: '대응할 유출 건이 없습니다 (이미 조치 완료된 건 제외).' }
  for (const leak of targets) {
    leak.status = '조치 완료'
    leak.response = action
    leak.respondedBy = session.name
    leak.respondedAt = today()
    dispatch({ channel: '이메일', to: '보안운영팀', subject: `유출 대응 조치 — ${leak.kind}: ${action}`, kind: '위협 대응', ref: leak.id })
  }
  appendAudit({ actor: session.name, action: `유출 일괄 대응 (${targets.length}건) — ${action}`, target: '다크웹 유출' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `유출 ${targets.length}건 대응 완료 — 보안운영팀 통지·감사 기록 적재` }
}

/** 크리덴셜 노출 대응 조치 — 인증 취약점 점검(기본·취약 크리덴셜)에서 끝내지 않고 보안 대응까지 이어간다.
 *  (제품안내서 §04 인증 취약점 점검 — 산출: 취약·기본 크리덴셜 노출) 대응은 보안 업무이므로 보안담당·Admin 만.
 *  조치 사실은 보안운영팀 앞 통지 + 감사 로그에 남는다. 유출 대응(respondToLeak)과 동형. */
export async function respondToCredential(credId: string, note: string) {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '크리덴셜 노출 대응 권한이 없습니다 (보안담당·Admin).' }
  }
  const action = note.trim()
  if (!action) return { ok: false, message: '대응 조치 내용을 입력하세요.' }

  const s = getStore()
  const cred = s.credentials.find((c) => c.id === credId)
  if (!cred) return { ok: false, message: '크리덴셜 노출 건을 찾을 수 없습니다.' }
  if (cred.status === '조치 완료') return { ok: false, message: '이미 조치 완료된 건입니다.' }

  cred.status = '조치 완료'
  cred.response = action
  cred.respondedBy = session.name
  cred.respondedAt = today()

  dispatch({ channel: '이메일', to: '보안운영팀', subject: `크리덴셜 노출 대응 — ${cred.service} ${cred.host}: ${action}`, kind: '위협 대응', ref: cred.id })
  appendAudit({ actor: session.name, action: `크리덴셜 노출 대응 (${cred.service} · ${cred.issue}) — ${action}`, target: cred.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${cred.service} ${cred.host} 크리덴셜 대응 완료 — 보안운영팀 통지·감사 기록 적재` }
}

/** 크리덴셜 노출 대응 취소(재개) — 오조치였던 조치 완료를 되돌려 다시 미조치로 되돌린다. 유출 대응 취소와 동형. 보안담당·Admin. */
export async function reopenCredential(credId: string) {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '크리덴셜 노출 대응 취소 권한이 없습니다 (보안담당·Admin).' }
  }
  const s = getStore()
  const cred = s.credentials.find((c) => c.id === credId)
  if (!cred) return { ok: false, message: '크리덴셜 노출 건을 찾을 수 없습니다.' }
  if (cred.status !== '조치 완료') return { ok: false, message: '조치 완료된 건만 대응을 취소할 수 있습니다.' }
  const prior = cred.response
  cred.status = '미조치'
  cred.response = undefined
  cred.respondedBy = undefined
  cred.respondedAt = undefined
  appendAudit({ actor: session.name, action: `크리덴셜 노출 대응 취소(재개) — ${cred.service} ${cred.host}${prior ? ` (이전 조치: ${prior})` : ''}`, target: cred.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${cred.service} ${cred.host} 크리덴셜 대응 취소 — 미조치로 복귀(대응 대상)` }
}

/** 크리덴셜 노출 일괄 대응 — 크리덴셜 스터핑·대량 유출 점검에서 다수 미조치 건에 같은 표준 조치(계정 재설정·세션 무효화 등)를 한 번에 적용한다.
 *  건별 로직은 respondToCredential 과 동일하고 감사만 일괄로 남긴다. 이미 조치 완료된 건은 건너뛴다(멱등). 보안담당·Admin. */
export async function respondToCredentialMany(ids: string[], note: string) {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '크리덴셜 노출 대응 권한이 없습니다 (보안담당·Admin).' }
  }
  const action = note.trim()
  if (!action) return { ok: false, message: '대응 조치 내용을 입력하세요.' }
  const s = getStore()
  const targets = s.credentials.filter((c) => ids.includes(c.id) && c.status !== '조치 완료')
  if (targets.length === 0) return { ok: false, message: '대응할 크리덴셜 노출 건이 없습니다 (이미 조치 완료된 건 제외).' }
  for (const cred of targets) {
    cred.status = '조치 완료'
    cred.response = action
    cred.respondedBy = session.name
    cred.respondedAt = today()
    dispatch({ channel: '이메일', to: '보안운영팀', subject: `크리덴셜 노출 대응 — ${cred.service} ${cred.host}: ${action}`, kind: '위협 대응', ref: cred.id })
  }
  appendAudit({ actor: session.name, action: `크리덴셜 노출 일괄 대응 (${targets.length}건) — ${action}`, target: '크리덴셜 노출' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `크리덴셜 ${targets.length}건 대응 완료 — 보안운영팀 통지·감사 기록 적재` }
}

/** 위협 인텔 IOC 조치 — IOC 상관(악성 통신·감염 징후)에서 끝내지 않고 차단(프록시·방화벽·EDR) 또는 조사 착수(침해 대응)까지 이어간다.
 *  (제품안내서 §04 위협 인텔리전스) 침해 대응은 보안 업무이므로 보안담당·Admin 만. 조치 사실은 보안운영팀 통지 + 감사 로그에 남는다. */
export async function respondToIoc(iocId: string, kind: '차단' | '조사') {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: 'IOC 대응 권한이 없습니다 (보안담당·Admin).' }
  }
  const s = getStore()
  const ioc = s.iocMatches.find((x) => x.id === iocId)
  if (!ioc) return { ok: false, message: 'IOC 상관 건을 찾을 수 없습니다.' }
  if (ioc.action) return { ok: false, message: `이미 ${ioc.action} 처리된 건입니다.` }

  ioc.actedBy = session.name
  ioc.actedAt = today()
  if (kind === '차단') {
    ioc.action = '차단 요청'
    // 능동 위협(행위자 귀속) 차단은 시간 임계 — 이메일 상세 + 문자 즉시 알림으로 이중 발송
    escalate({ to: '보안운영팀', subject: `IOC 차단 집행 요청 — ${ioc.iocType} ${ioc.iocValue} (${ioc.threatActor}) @ ${ioc.matchedAsset}`, kind: '위협 대응', ref: ioc.id, sms: `IOC 차단 요청 ${ioc.threatActor} @ ${ioc.matchedAsset} — 즉시 차단` })
    appendAudit({ actor: session.name, action: `IOC 차단 요청 (${ioc.matchType}) — ${ioc.iocValue} @ ${ioc.matchedAsset}`, target: ioc.id })
  } else {
    ioc.action = '조사 착수'
    escalate({ to: '보안운영팀', subject: `IOC 침해 조사 착수 — ${ioc.threatActor} @ ${ioc.matchedAsset} (${ioc.dept})`, kind: '위협 대응', ref: ioc.id, sms: `IOC 침해 조사 착수 ${ioc.threatActor} @ ${ioc.matchedAsset}` })
    appendAudit({ actor: session.name, action: `IOC 침해 조사 착수 (${ioc.matchType}) — ${ioc.iocValue} @ ${ioc.matchedAsset}`, target: ioc.id })
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: `${ioc.iocValue} ${ioc.action} — 보안운영팀 통지·감사 기록 적재` }
}

/** IOC 일괄 대응 — 위협 인텔 피드 갱신으로 다수 IOC가 한꺼번에 상관될 때 선택해 한 번에 차단(또는 조사 착수).
 *  건별 로직은 respondToIoc 와 동일하고 감사만 일괄로 남긴다. 이미 조치된 건은 건너뛴다(멱등). 보안담당·Admin. */
export async function respondToIocMany(ids: string[], kind: '차단' | '조사') {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: 'IOC 대응 권한이 없습니다 (보안담당·Admin).' }
  }
  const s = getStore()
  const targets = s.iocMatches.filter((ioc) => ids.includes(ioc.id) && !ioc.action)
  if (targets.length === 0) return { ok: false, message: '조치할 IOC 상관 건이 없습니다 (이미 처리된 건 제외).' }
  for (const ioc of targets) {
    ioc.actedBy = session.name
    ioc.actedAt = today()
    if (kind === '차단') {
      ioc.action = '차단 요청'
      escalate({ to: '보안운영팀', subject: `IOC 차단 집행 요청 — ${ioc.iocType} ${ioc.iocValue} (${ioc.threatActor}) @ ${ioc.matchedAsset}`, kind: '위협 대응', ref: ioc.id, sms: `IOC 차단 요청 ${ioc.threatActor} @ ${ioc.matchedAsset} — 즉시 차단` })
    } else {
      ioc.action = '조사 착수'
      escalate({ to: '보안운영팀', subject: `IOC 침해 조사 착수 — ${ioc.threatActor} @ ${ioc.matchedAsset} (${ioc.dept})`, kind: '위협 대응', ref: ioc.id, sms: `IOC 침해 조사 착수 ${ioc.threatActor} @ ${ioc.matchedAsset}` })
    }
  }
  const verb = kind === '차단' ? '차단 요청' : '조사 착수'
  const names = targets.map((ioc) => ioc.iocValue).slice(0, 5).join(', ')
  appendAudit({ actor: session.name, action: `IOC 일괄 ${verb} (${targets.length}건) — ${names}${targets.length > 5 ? ' 외' : ''}`, target: 'IOC 상관' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `IOC ${targets.length}건 ${verb} — 보안운영팀 통지·감사 기록 적재` }
}

/** IOC 조치 취소(재개) — 오조치였던 차단 요청·조사 착수를 되돌려 다시 미조치(차단/조사 대상)로 되돌린다. 잘못 종결한 상관 건이 미조치 큐·감사에서 사라지지 않게 한다. 보안담당·Admin. */
export async function reopenIoc(iocId: string) {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: 'IOC 조치 취소 권한이 없습니다 (보안담당·Admin).' }
  }
  const s = getStore()
  const ioc = s.iocMatches.find((x) => x.id === iocId)
  if (!ioc) return { ok: false, message: 'IOC 상관 건을 찾을 수 없습니다.' }
  if (!ioc.action) return { ok: false, message: '조치된 건만 취소할 수 있습니다.' }
  const prior = ioc.action
  ioc.action = undefined
  ioc.actedBy = undefined
  ioc.actedAt = undefined
  appendAudit({ actor: session.name, action: `IOC 조치 취소(재개) — ${ioc.iocValue} @ ${ioc.matchedAsset} (이전 조치: ${prior})`, target: ioc.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${ioc.iocValue} 조치 취소 — 미조치로 복귀(차단/조사 대상)` }
}

/** 외부 노출 자산 조치 — 검출에서 끝내지 않고 편입(우리 자산이면 대장으로) 또는 차단(노출 차단·NAC 격리)까지 이어간다.
 *  외부 노출은 보안 의사결정이므로 보안담당·Admin 만. 요청 사실은 담당팀 통지 + 감사 로그에 남는다. */
export async function requestExternalAction(externalId: string, kind: '편입' | '차단') {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '외부 노출 조치 권한이 없습니다 (보안담당·Admin).' }
  }
  const s = getStore()
  const e = s.external.find((x) => x.id === externalId)
  if (!e) return { ok: false, message: '노출 자산을 찾을 수 없습니다.' }
  if (e.action) return { ok: false, message: `이미 ${e.action} 처리된 건입니다.` }

  if (kind === '편입') {
    e.action = '편입요청'
    dispatch({ channel: '이메일', to: '자산관리팀', subject: `외부 노출 자산 편입 검토 — ${e.host} (${e.services ?? '-'})`, kind: '소유자 확인', ref: e.id })
    appendAudit({ actor: session.name, action: `외부 노출 자산 편입 요청 — ${e.host}`, target: e.id })
  } else {
    e.action = '차단요청'
    // 외부 노출(특히 CVE) 차단·격리는 공격 표면 노출 시간을 줄이는 게 관건 — 문자 즉시 알림 병행
    escalate({ to: '보안운영팀', subject: `외부 노출 차단·격리 요청 — ${e.host} ${e.cve ? `(${e.cve})` : ''}`, kind: '격리 통보', ref: e.id, sms: `외부 노출 차단·격리 ${e.host}${e.cve ? ` (${e.cve})` : ''} — 즉시 차단` })
    appendAudit({ actor: session.name, action: `외부 노출 차단 요청 — ${e.host}`, target: e.id })
  }
  revalidatePath('/', 'layout')
  return { ok: true, message: `${e.host} ${kind} 요청 — ${kind === '편입' ? '자산관리팀' : '보안운영팀'} 통지·감사 적재` }
}

/** 외부 노출 자산 일괄 조치 — 재탐지·CVE 스윕으로 다수 노출 호스트가 한꺼번에 잡힐 때 선택해 한 번에 편입(또는 차단).
 *  건별 로직은 requestExternalAction 과 동일하고 감사만 일괄로 남긴다. 이미 조치된 건은 건너뛴다(멱등). 보안담당·Admin. */
export async function requestExternalActionMany(ids: string[], kind: '편입' | '차단') {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '외부 노출 조치 권한이 없습니다 (보안담당·Admin).' }
  }
  const s = getStore()
  const targets = s.external.filter((e) => ids.includes(e.id) && !e.action)
  if (targets.length === 0) return { ok: false, message: '조치할 외부 노출 건이 없습니다 (이미 처리된 건 제외).' }
  for (const e of targets) {
    if (kind === '편입') {
      e.action = '편입요청'
      dispatch({ channel: '이메일', to: '자산관리팀', subject: `외부 노출 자산 편입 검토 — ${e.host} (${e.services ?? '-'})`, kind: '소유자 확인', ref: e.id })
    } else {
      e.action = '차단요청'
      escalate({ to: '보안운영팀', subject: `외부 노출 차단·격리 요청 — ${e.host} ${e.cve ? `(${e.cve})` : ''}`, kind: '격리 통보', ref: e.id, sms: `외부 노출 차단·격리 ${e.host}${e.cve ? ` (${e.cve})` : ''} — 즉시 차단` })
    }
  }
  const names = targets.map((e) => e.host).slice(0, 5).join(', ')
  appendAudit({ actor: session.name, action: `외부 노출 자산 일괄 ${kind} 요청 (${targets.length}건) — ${names}${targets.length > 5 ? ' 외' : ''}`, target: '외부 노출' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `외부 노출 ${targets.length}건 ${kind} 요청 — ${kind === '편입' ? '자산관리팀' : '보안운영팀'} 통지·감사 적재` }
}

/** 외부 노출 위험 수용 — 편입도 차단도 아닌 '인지된 노출'로 공식 수용한다(예: 보상통제가 있는 레거시·의도된 공개 서비스).
 *  (그동안 조치는 편입/차단뿐이라 수용 가능한 노출도 미조치로 남아 취약점 우선순위에 영구 계상됐다 — 위험 관리의 표준 처분(risk acceptance) 부재.)
 *  수용은 사유(정당화 근거)와 감사가 필수이며, 조치 상태를 '위험 수용'으로 두어 활성 취약점 우선순위(미조치 기준)에서 제외한다. 오판이면 해제. 보안담당·Admin. */
export async function acceptExternalRisk(externalId: string, rawReason: string) {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '외부 노출 위험 수용 권한이 없습니다 (보안담당·Admin).' }
  }
  const s = getStore()
  const e = s.external.find((x) => x.id === externalId)
  if (!e) return { ok: false, message: '노출 자산을 찾을 수 없습니다.' }
  if (e.action) return { ok: false, message: `이미 ${e.action} 처리된 건입니다.` }
  const reason = rawReason.trim()
  if (!reason) return { ok: false, message: '위험 수용 사유(정당화 근거)를 입력하세요.' }
  e.action = '위험 수용'
  e.note = `위험 수용 (${reason}) — ${session.name} · ${today()}`
  appendAudit({ actor: session.name, action: `외부 노출 위험 수용 — ${e.host}${e.cve ? ` (${e.cve})` : ''} · ${reason}`, target: e.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${e.host} 위험 수용 — 인지된 노출로 등록, 활성 취약점 우선순위에서 제외 (사유: ${reason})` }
}

/** 외부 노출 위험 수용 해제 — 수용 판단을 되돌려 다시 미조치(편입/차단 대상)로 되돌린다. 보안담당·Admin. */
export async function revokeExternalRisk(externalId: string) {
  const session = await getSession()
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '위험 수용 해제 권한이 없습니다 (보안담당·Admin).' }
  }
  const s = getStore()
  const e = s.external.find((x) => x.id === externalId)
  if (!e) return { ok: false, message: '노출 자산을 찾을 수 없습니다.' }
  if (e.action !== '위험 수용') return { ok: false, message: '위험 수용 상태의 노출만 해제할 수 있습니다.' }
  e.action = undefined
  e.note = undefined
  appendAudit({ actor: session.name, action: `외부 노출 위험 수용 해제 — ${e.host}`, target: e.id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${e.host} 위험 수용 해제 — 미조치(편입/차단 대상)로 복귀` }
}

/** 외부 공격표면 재탐지 — 수동(무접촉) 수집으로 후보를 넓히고, 능동으로 생존·서비스·취약점을 확인한다.
 *  능동 탐지는 대상에 직접 접속하므로 사전 협의된 도메인에서만 허용한다 (제품안내서 §04 '수동 우선, 능동 확인'). */
export async function runEasmScan(input: { domains: string[]; mode: 'Passive' | 'Passive+Active'; note?: string }) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '재탐지 실행 권한이 없습니다.' }
  if (input.domains.length === 0) return { ok: false, message: '재탐지 도메인을 선택해 주세요.' }

  const s = getStore()
  const active = input.mode === 'Passive+Active'

  if (active) {
    const notApproved = input.domains.filter((d) => !s.easmTargets.find((t) => t.domain === d)?.activeApproved)
    if (notApproved.length > 0) {
      return {
        ok: false,
        message: `능동 탐지 미협의 도메인입니다 — ${notApproved.join(', ')}. 수동 수집만 실행하거나 대상 협의 후 진행하세요.`,
      }
    }
  }

  const at = nowMinute()
  const run: EasmRun = {
    id: nextId(`EASM-${today().slice(2, 4)}${today().slice(5, 7)}`),
    startedAt: at,
    domains: input.domains,
    mode: active ? 'Passive+Active' : 'Passive',
    status: '실행 중',
    candidates: 0,
    confirmed: 0,
    newFound: 0,
    by: session.name,
    note: input.note?.trim() || undefined,
  }

  // ── 수동 수집 — 대상에 흔적을 남기지 않고 후보를 넓힌다
  const pool = s.unseenExternal.filter((u) => input.domains.includes(u.domain))
  const surfaced = active ? pool : pool.filter((u) => u.mode === 'Passive')
  for (const u of surfaced) {
    s.external.unshift({
      id: nextId(`EXT-${today().slice(2, 4)}${today().slice(5, 7)}`),
      host: u.host,
      ip: u.ip,
      method: u.method,
      mode: u.mode,
      // 수동 수집 단계에서는 생존 미확인 — 능동 탐지를 함께 돌린 경우에만 확인된다
      alive: active && u.mode === 'Active',
      services: active ? u.services : undefined,
      cve: active ? u.cve : undefined,
      cvss: active ? u.cvss : undefined,
      risk: u.risk,
      firstSeen: today(),
      note: u.note,
      state: '미등록',
    })
    run.newFound += 1
  }
  s.unseenExternal = s.unseenExternal.filter((u) => !surfaced.includes(u))

  // 후보 수 — 수동 수집이 훑은 호스트명 규모(기존 관측 + 신규). surfaced 는 이미 s.external 에 unshift 되어 filter 에 포함되므로
  // + surfaced.length 를 더하면 신규분이 이중 계상된다(신규 1건 · 기존 3건이면 4가 아니라 5로 부풀던 오류).
  run.candidates = s.external.filter((e) => input.domains.some((d) => e.host.endsWith(d))).length

  // ── 능동 확인 — 기존 미확인 자산의 생존을 판정한다
  if (active) {
    for (const e of s.external) {
      if (!input.domains.some((d) => e.host.endsWith(d))) continue
      if (e.alive) continue
      // 과거 관측 호스트는 능동 확인으로 생존 여부가 갈린다. 여기서는 서비스 정보가 있으면 생존으로 본다.
      if (e.services) { e.alive = true; run.confirmed += 1 }
    }
    run.confirmed += surfaced.filter((u) => u.mode === 'Active').length
  }

  for (const d of input.domains) {
    const t = s.easmTargets.find((x) => x.domain === d)
    if (t) t.lastRunAt = today()
  }

  run.status = '완료'
  run.finishedAt = nowMinute()
  s.easmRuns.unshift(run)

  appendAudit({
    actor: session.name,
    action: `외부 공격표면 재탐지 (${run.mode}) — ${input.domains.join(', ')} · 신규 노출 ${run.newFound}건`,
    target: run.id,
  })
  revalidatePath('/', 'layout')

  return {
    ok: true,
    message: run.newFound > 0
      ? `${run.id} 완료 — 신규 노출 자산 ${run.newFound}건${active ? ` · 생존 확인 ${run.confirmed}건` : ' (수동 수집 — 생존 미확인)'}`
      : `${run.id} 완료 — 신규 노출 없음${active ? ` · 생존 확인 ${run.confirmed}건` : ''}`,
  }
}
