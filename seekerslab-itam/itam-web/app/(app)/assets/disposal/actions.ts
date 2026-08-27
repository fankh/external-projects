'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit, denied } from '@/lib/audit'
import { today } from '@/lib/dates'
import { clearDependencyRefs } from '@/lib/cmdb'
import { clearSwInstalls, reclaimLicenseSeats } from '@/lib/license'
import { getSession } from '@/lib/session'
import { getStore, nextApprovalId, nextId } from '@/lib/store'
import { can } from '@/lib/perm'
import { DISPOSAL_PHOTO_LABELS, DISPOSITIONS, HELD_STATUSES, type Disposition, type DisposalPhotoLabel, type WipeMethod } from '@/lib/types'

/** 폐기 대상 선정 — 노후·보증만료·장기 유휴 자산을 폐기 후보로 등록. 결과 메시지를 반환한다
 *  (폐기 화면은 반환값을 쓰지 않지만, 반납·유휴 화면에서 장기 유휴 → 폐기 검토 브리지가 피드백을 쓴다). */
export async function selectForDisposal(assetNo: string, reason: string): Promise<{ ok: boolean; message: string }> {
  const session = await getSession()
  if (!session) return { ok: false, message: '폐기 대상 선정 권한이 없습니다.' }
  if ((!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return denied(session.name, '폐기 대상 선정 권한이 없습니다.', '/assets/disposal')
  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (s.disposals.some((d) => d.assetNo === assetNo)) return { ok: false, message: `이미 폐기 절차에 있는 자산입니다 — ${assetNo}` }
  // 보유자가 쥔·파이프라인 중 자산은 실물을 폐기할 수 없다 — 먼저 회수·반환·검수를 마쳐야 한다(대여중 자산 폐기 선정 → 대여 추적 유실 방지, 대여 가드(#149)의 반대편).
  if ((HELD_STATUSES as readonly string[]).includes(asset.status)) {
    return { ok: false, message: `${asset.status} 자산은 폐기 대상으로 선정할 수 없습니다 — ${assetNo} (먼저 회수·반환·검수 완료 후 유휴 상태에서 선정하세요).` }
  }
  const dspId = nextId('DSP')
  s.disposals.push({ id: dspId, assetNo, model: asset.model, reason, status: '대상 선정', prevStatus: asset.status })
  // 폐기 절차 편입도 자산 이력에 남긴다 — 반려 복원(decide)은 이력을 남기는데 선정은 남기지 않아, 자산
  //  타임라인에 '폐기 반려 — 대상 해제'만 뜨고 그 앞에 선정된 적이 있다는 기록이 없었다(되돌림만 보이고
  //  원인이 안 보인다). 반납·대여 반환 점검으로 편입되는 경로는 이미 이력을 남기므로 이 직접 선정 경로만
  //  비어 있었다. 누가·왜 폐기 파이프라인에 넣었는지는 전역 감사로그가 아니라 그 자산에서 읽혀야 한다.
  asset.history.push({ date: today(), kind: '폐기', detail: `폐기 대상 선정 — ${reason} (${dspId} · ${asset.status} → 폐기예정)`, actor: session.name })
  asset.status = '폐기예정'
  appendAudit({ actor: session.name, action: `폐기 대상 선정 — ${reason}`, target: assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${assetNo} 폐기 대상 선정 — ${reason}` }
}

/** 폐기 대상 선정 취소 — 결재 전(대상 선정) 건을 해제하고 자산을 원 상태로 복원한다.
 *  잘못 선정하거나 일괄/AI 선정을 되돌릴 때. 결재 상신·소거 진행 건은 취소 불가. 자산담당·Admin. */
export async function cancelDisposalCandidate(disposalId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '폐기 대상 취소 권한이 없습니다.' }
  if ((!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return denied(session.name, '폐기 대상 취소 권한이 없습니다.', '/assets/disposal')
  const s = getStore()
  const d = s.disposals.find((x) => x.id === disposalId)
  if (!d) return { ok: false, message: '폐기 대상을 찾을 수 없습니다.' }
  if (d.status !== '대상 선정') return { ok: false, message: `결재·소거가 진행 중이라 취소할 수 없습니다 — ${d.id} (${d.status})` }

  const asset = s.assets.find((a) => a.assetNo === d.assetNo)
  if (asset) {
    // 취소도 이력에 남긴다 — 선정 이력만 남고 해제가 안 남으면 타임라인이 '폐기 대상'에서 멈춰,
    //  실제로는 운영에 복귀한 자산이 이력상 폐기 대기처럼 읽힌다(폐기 반려 복원과 같은 규약).
    const back = d.prevStatus ?? '유휴'
    asset.history.push({ date: today(), kind: '점검', detail: `폐기 대상 선정 취소 — ${back} 복원 (${d.id} · ${d.reason})`, actor: session.name })
    asset.status = back
  }
  s.disposals = s.disposals.filter((x) => x.id !== disposalId)

  appendAudit({ actor: session.name, action: `폐기 대상 선정 취소 — ${d.assetNo} (→ ${asset?.status ?? '유휴'})`, target: d.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${d.assetNo} 폐기 대상 선정을 취소했습니다 (${asset?.status ?? '유휴'} 복원).` }
}

/** 폐기 대상 일괄 선정 — 노후·EOL 배치를 한 번에 선정한다 (교체 계획 수십 대를 한 건씩 누르지 않도록).
 *  이미 선정됐거나 없는 자산은 건너뛰고, 실제 선정된 수만 감사에 남긴다. */
export async function selectForDisposalMany(items: { assetNo: string; reason: string }[]) {
  const session = await getSession()
  if (!session) return { ok: false, message: '폐기 대상 선정 권한이 없습니다.' }
  if ((!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return denied(session.name, '폐기 대상 선정 권한이 없습니다.', '/assets/disposal')
  const s = getStore()
  let n = 0
  let skippedD = 0 // 이미 폐기 건이 있거나 보유자가 쥔 자산이라 건너뛴 선택분
  for (const it of items) {
    const asset = s.assets.find((a) => a.assetNo === it.assetNo)
    if (!asset || s.disposals.some((x) => x.assetNo === it.assetNo)) { skippedD += 1; continue }
    // 보유자가 쥔·파이프라인 중 자산은 건너뛴다 — 회수·반환·검수 완료(유휴)해야 폐기 선정 대상(단건 가드와 동일).
    if ((HELD_STATUSES as readonly string[]).includes(asset.status)) { skippedD += 1; continue }
    const bulkId = nextId('DSP')
    s.disposals.push({ id: bulkId, assetNo: it.assetNo, model: asset.model, reason: it.reason, status: '대상 선정', prevStatus: asset.status })
    // 단건 선정과 같은 이력을 남긴다 — 일괄로 넣었다고 자산 타임라인이 비면 안 된다.
    asset.history.push({ date: today(), kind: '폐기', detail: `폐기 대상 선정 — ${it.reason} (${bulkId} · ${asset.status} → 폐기예정 · 일괄)`, actor: session.name })
    asset.status = '폐기예정'
    n += 1
  }
  if (n === 0) return { ok: false, message: '새로 선정된 자산이 없습니다 (이미 선정되었거나 대상 아님).' }
  appendAudit({ actor: session.name, action: `폐기 대상 일괄 선정 (${n}건)`, target: '폐기' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${n}건을 폐기 대상으로 선정했습니다.${skippedD > 0 ? ` (이미 선정·보유 중 ${skippedD}건 제외)` : ''}` }
}

/** 폐기 결재 상신 — 필수 결재 (자산담당 → IT기획팀장) */
export async function raiseDisposalApproval() {
  const session = await getSession()
  if (!session) return { ok: false, message: '폐기 결재 상신 권한이 없습니다 (자산담당·Admin).' }
  if ((!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return denied(session.name, '폐기 결재 상신 권한이 없습니다 (자산담당·Admin).', '/assets/disposal')
  const s = getStore()
  const targets = s.disposals.filter((d) => d.status === '대상 선정')
  // 사유 없이 끝내지 않는다 — 다른 화면에서 이미 상신했으면 대상이 비어 버튼이 무반응이 된다.
  if (targets.length === 0) return { ok: false, message: '상신할 폐기 대상이 없습니다 (대상 선정 단계 건만 상신).' }
  // 필수 결재선(AL-04 폐기: 자산담당 → IT기획팀장)의 첫 결재 단계에서 시작한다 — 격리 요청(보안담당→IT기획팀장)과 동형.
  //  그전엔 마지막 단계(IT기획팀장)로 하드코딩돼 필수 자산담당 결재가 생략되고, 관리자가 결재선을 편집해도 반영되지 않았다.
  const line = s.approvalLines.find((l) => l.kind === '폐기')
  const firstStep = line?.steps.find((st) => st !== '신청자' && st !== 'Discovery 엔진') ?? '자산담당'
  const aprId = nextApprovalId()
  s.approvals.unshift({
    id: aprId,
    kind: '폐기',
    title: `${targets[0].assetNo}${targets.length > 1 ? ` 외 ${targets.length - 1}건` : ''} 폐기 상신`,
    requester: session.name,
    dept: session.dept,
    requestedAt: today(),
    status: '대기',
    currentStep: `${firstStep} 검토`,
    refId: targets[0].assetNo,
  })
  for (const d of targets) { d.status = '결재 대기'; d.approvalId = aprId }
  appendAudit({ actor: session.name, action: `폐기 상신 (${targets.length}건)`, target: aprId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `폐기 결재 상신 ${targets.length}건 — 결재함에서 진행 상태를 확인하세요.` }
}

/** 데이터 소거 처리 + 물리 처분 + 증적 보존 — 승인된 건만 가능 */
export async function recordWipe(id: string, method: WipeMethod, disposition: Disposition = '폐기(파쇄)', rawProceeds = 0) {
  const session = await getSession()
  if (!session) return { ok: false, message: '권한이 없습니다.' }
  if ((!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return denied(session.name, '권한이 없습니다.', '/assets/disposal')
  if (!DISPOSITIONS.includes(disposition)) return { ok: false, message: '처분 방식이 올바르지 않습니다.' }
  const s = getStore()
  const d = s.disposals.find((x) => x.id === id)
  if (!d) return { ok: false, message: '폐기 건을 찾을 수 없습니다.' }
  if (d.status !== '소거 대기') return { ok: false, message: '폐기 결재 승인 후 소거할 수 있습니다.' }
  // 매각인데 대금이 없으면 거절한다 — 일괄 소거(recordWipeMany)는 바로 이 이유로 매각을 통째로 막아 두었는데,
  //  정작 '건별 소거에서 입력하라'고 넘긴 이 단건 경로에는 가드가 없었다(막아 둔 쪽만 있고 받아 줄 쪽이 빈 꼴).
  //  대금 입력칸은 비어 시작하고 Number('') 는 0 이라, 매각을 고르고 금액 없이 누르면 그대로 확정된다.
  //  소거가 끝나면 상태가 '완료'라 recordWipe 로 다시 들어올 수 없어, 폐기 증적 대장의 매각 대금은
  //  영구히 '미기재'로 남는다 — 자산 처분 대금은 회계 정산 근거라 나중에 채울 수 없으면 안 된다.
  if (disposition === '매각' && !(Number.isFinite(rawProceeds) && rawProceeds > 0)) {
    return { ok: false, message: '매각 대금을 입력하세요 — 소거 완료 후에는 대금을 기록할 경로가 없어 폐기 증적 대장에 영구히 미기재로 남습니다.' }
  }

  const proceeds = disposition === '매각' && Number.isFinite(rawProceeds) ? Math.max(0, Math.round(rawProceeds)) : 0 // 비유한(Infinity/NaN) 방어 — 매각 대금이 ∞/NaN 로 리포트·집계를 오염하지 않게

  // 폐기 시 참조 정리 — 자산번호를 참조하는 컬렉션과 이 절차의 처리 방침(추가 시 여기에 함께 등록할 것):
  //   · LicenseSeat  → 좌석 회수(reclaimLicenseSeats) — 없는 자산에 좌석이 남으면 비용·대사가 샌다
  //   · SwInstall    → 설치 기록 정리(clearSwInstalls) — 좌석 없는 설치는 '배정 밖 설치(무단 사용)'로 영구 오분류된다
  //   · Asset.dependsOn → 의존 참조 정리(clearDependencyRefs) — 사라진 장비가 단일 장애점으로 남는다
  //   · SurveyScan/SurveyDiff → 보존 — 과거 실사 증적이고, 차이 조정은 승인 시 '미적용'으로 닫힌다
  //   · DisposalRecord → 이 절차의 원장 자체
  //   · UnauthorizedSw/UsbFinding/LocalVmFinding → 보존(정책 판단) — 위반 사실은 지우지 않는다. 다만 '미조치'로
  //     남으면 사라진 장비가 열린 위협으로 계속 잡히므로, 조치 우선순위 산정은 폐기 경로 자산을 제외한다(lib/vuln-priority).
  s.seq += 1
  d.wipeMethod = method
  d.disposition = disposition
  if (proceeds > 0) d.proceeds = proceeds
  d.wipedAt = today()
  d.wipedBy = session.name
  d.certNo = `WIPE-${today().replace(/-/g, '')}-${String(s.seq).padStart(3, '0')}`
  // 증적 사진은 실제 등록된 기록으로 관리한다 — 여기서 지어내지 않는다(감사 무결성).
  d.evidence = `소거 확인서 ${d.certNo}`
  d.status = '완료'

  const dispLabel = `${disposition}${proceeds > 0 ? ` · 대금 ${proceeds.toLocaleString()}원` : ''}`
  const asset = s.assets.find((a) => a.assetNo === d.assetNo)
  if (asset) {
    asset.status = '폐기완료'
    asset.history.push({
      date: today(), kind: '폐기',
      detail: `데이터 소거 완료 (${method}) · 처분 ${dispLabel} · 증적 ${d.certNo} 보존`,
      actor: session.name,
    })
    // 폐기 좌석 회수 — 폐기된 자산에 물린 라이선스 좌석을 회수한다(로56). 존재하지 않는 자산에 좌석이 남으면 비용·대사가 샌다.
    const freed = reclaimLicenseSeats(asset.assetNo, session.name, '폐기')
    if (freed.length) asset.history.push({ date: today(), kind: '폐기', detail: `라이선스 좌석 회수 — ${freed.join(', ')} (폐기)`, actor: session.name })
    // CMDB 의존 참조 정리 — 좌석 회수와 같은 이유다. 사라진 자산을 상위로 두던 하위 자산의 dependsOn 을 그대로 두면
    //  없는 장비가 단일 장애점(SPOF)으로 계속 잡히고, 폐기완료는 저하 상태라 큐 맨 위로 올라간다.
    // 폐기 완료 자산의 SW 설치 기록 정리 — 좌석은 회수됐는데 설치만 남으면 '배정 밖 설치(무단 사용)'로 영구히 잡힌다.
    const swCleared = clearSwInstalls(asset.assetNo)
    if (swCleared.length) {
      asset.history.push({ date: today(), kind: '폐기', detail: `SW 설치 기록 정리 — ${swCleared.join(', ')} (폐기 · 좌석 대사에서 제외)`, actor: session.name })
      appendAudit({ actor: session.name, action: `SW 설치 기록 정리 — ${asset.assetNo} 폐기로 ${swCleared.length}건 대사 제외`, target: asset.assetNo })
    }
    const detached = clearDependencyRefs(asset.assetNo)
    if (detached.length) {
      asset.history.push({ date: today(), kind: '폐기', detail: `CMDB 의존 참조 정리 — ${detached.join(', ')} 의 상위 의존에서 제외 (폐기)`, actor: session.name })
      appendAudit({ actor: session.name, action: `CMDB 의존 참조 정리 — ${asset.assetNo} 폐기로 ${detached.length}건 상위 의존 해제`, target: asset.assetNo })
    }
    asset.receiptPending = undefined // 미확인 수령 대기 해제 — 폐기 자산은 인수 대기 대상이 아니다
  }
  appendAudit({ actor: session.name, action: `폐기 데이터 소거 (${method}) · 처분 ${dispLabel}`, target: d.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `소거·처분 완료 (${dispLabel}) — 증적 ${d.certNo}` }
}

/** 데이터 일괄 소거 — EOL 교체 등 배치 폐기에서 소거 대기 다수 건을 같은 소거 방식·처분으로 한 번에 처리한다.
 *  건별 로직은 recordWipe 와 동일하고 각 건에 고유 확인서(certNo)를 발급하며 감사만 일괄로 남긴다. 소거 대기 건만 대상(멱등).
 *  매각 대금은 건별로 다르므로 일괄에서는 처리하지 않는다(대금 0 — 매각가는 단건 소거로 개별 입력). 자산담당·Admin. */
export async function recordWipeMany(ids: string[], method: WipeMethod, disposition: Disposition = '폐기(파쇄)') {
  const session = await getSession()
  if (!session) return { ok: false, message: '권한이 없습니다.' }
  if ((!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return denied(session.name, '권한이 없습니다.', '/assets/disposal')
  if (!DISPOSITIONS.includes(disposition)) return { ok: false, message: '처분 방식이 올바르지 않습니다.' }
  // 매각 제외는 지금까지 화면 규칙일 뿐이었다(일괄 선택지에서 빼 두기만 함). 위조 POST·향후 UI 변경으로 매각이 들어오면
  //  대금 0 인 매각이 폐기 대장에 확정되고, 소거 완료 뒤에는 대금을 기록할 경로가 없어(recordWipe 는 '소거 대기' 건만 받는다)
  //  회수 대금이 월간 자산 현황·컴플라이언스 서술·폐기 증적 대장에서 영구히 빠진다. 서버가 같은 규칙을 강제한다.
  if (disposition === '매각') {
    return { ok: false, message: '매각은 대금이 건별로 달라 일괄 처리할 수 없습니다 — 건별 소거·처분에서 매각 대금과 함께 기록하세요.' }
  }
  const s = getStore()
  const targets = s.disposals.filter((d) => ids.includes(d.id) && d.status === '소거 대기')
  if (targets.length === 0) return { ok: false, message: '소거할 폐기 건이 없습니다 (결재 승인·소거 대기 건만 대상).' }
  for (const d of targets) {
    s.seq += 1
    d.wipeMethod = method
    d.disposition = disposition
    d.wipedAt = today()
    d.wipedBy = session.name
    d.certNo = `WIPE-${today().replace(/-/g, '')}-${String(s.seq).padStart(3, '0')}`
    d.evidence = `소거 확인서 ${d.certNo}`
    d.status = '완료'
    const asset = s.assets.find((a) => a.assetNo === d.assetNo)
    if (asset) {
      asset.status = '폐기완료'
      asset.history.push({ date: today(), kind: '폐기', detail: `데이터 소거 완료 (${method}) · 처분 ${disposition} · 증적 ${d.certNo} 보존 (일괄)`, actor: session.name })
      const freed = reclaimLicenseSeats(asset.assetNo, session.name, '폐기')
      if (freed.length) asset.history.push({ date: today(), kind: '폐기', detail: `라이선스 좌석 회수 — ${freed.join(', ')} (폐기)`, actor: session.name })
      const swClearedM = clearSwInstalls(asset.assetNo) // 단건 소거와 동일 — 유령 SW 설치 기록 정리
      if (swClearedM.length) asset.history.push({ date: today(), kind: '폐기', detail: `SW 설치 기록 정리 — ${swClearedM.join(', ')} (폐기 · 일괄)`, actor: session.name })
      const detached = clearDependencyRefs(asset.assetNo) // 단건 소거와 동일 — 유령 의존 참조 정리
      if (detached.length) asset.history.push({ date: today(), kind: '폐기', detail: `CMDB 의존 참조 정리 — ${detached.join(', ')} 의 상위 의존에서 제외 (폐기 · 일괄)`, actor: session.name })
      asset.receiptPending = undefined
    }
  }
  appendAudit({ actor: session.name, action: `폐기 데이터 일괄 소거 (${method}) · 처분 ${disposition} (${targets.length}건)`, target: '폐기' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${targets.length}건 소거·처분 완료 (${method} · ${disposition}) — 건별 확인서 발급` }
}

/** 폐기 증적 사진 등록 — 처리 전·후·폐기물 인계 등 실제 촬영 증적을 소거 완료 건에 남긴다.
 *  파일 저장은 범위 밖이므로 사진 메타데이터(구분·설명·등록자·등록일)만 관리한다 —
 *  "증적 사진이 존재한다"는 감사 주장을 실제 기록으로 뒷받침한다(제품안내서 §03 폐기: 증적(사진·확인서)). 자산담당·Admin. */
export async function addDisposalPhoto(id: string, label: DisposalPhotoLabel, rawNote: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '증적 사진 등록 권한이 없습니다 (자산담당·Admin).' }
  if ((!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return denied(session.name, '증적 사진 등록 권한이 없습니다 (자산담당·Admin).', '/assets/disposal')
  if (!DISPOSAL_PHOTO_LABELS.includes(label)) return { ok: false, message: '사진 구분이 올바르지 않습니다.' }

  const s = getStore()
  const d = s.disposals.find((x) => x.id === id)
  if (!d) return { ok: false, message: '폐기 건을 찾을 수 없습니다.' }
  if (d.status !== '완료') return { ok: false, message: '소거 완료 건에만 증적 사진을 등록할 수 있습니다.' }
  if (!d.photos) d.photos = []
  d.photos.push({ id: nextId('PHO'), label, note: rawNote.trim() || undefined, addedAt: today(), addedBy: session.name })
  appendAudit({ actor: session.name, action: `폐기 증적 사진 등록 — ${label}${rawNote.trim() ? ` (${rawNote.trim()})` : ''}`, target: d.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${d.id} 증적 사진 등록 — ${label}` }
}

/** 폐기 증적 사진 삭제 — 잘못 등록한 증적 항목을 제거한다. 감사 로그에 남긴다. 자산담당·Admin. */
export async function removeDisposalPhoto(id: string, photoId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '증적 사진 삭제 권한이 없습니다 (자산담당·Admin).' }
  if ((!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('수명주기', '저장', session.role))) return denied(session.name, '증적 사진 삭제 권한이 없습니다 (자산담당·Admin).', '/assets/disposal')

  const s = getStore()
  const d = s.disposals.find((x) => x.id === id)
  if (!d || !d.photos) return { ok: false, message: '폐기 건 또는 증적 사진을 찾을 수 없습니다.' }
  const photo = d.photos.find((p) => p.id === photoId)
  if (!photo) return { ok: false, message: '증적 사진을 찾을 수 없습니다.' }
  d.photos = d.photos.filter((p) => p.id !== photoId)
  appendAudit({ actor: session.name, action: `폐기 증적 사진 삭제 — ${photo.label}`, target: d.assetNo })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${d.id} 증적 사진 삭제 — ${photo.label}` }
}
