/** 일일 알림 배치 — 기한 경과·미이행 항목을 스캔해 대상자별 안내메일을 보낸다.
 *  요구사항의 "주기적 안내메일 / 경과 항목 알림 - 메일"을 담당한다. 데모에서는 수동
 *  실행 버튼으로 트리거하고, 실서비스에서는 스케줄러(일배치)에 연결한다. */
import { audit } from './audit'
import { nowStamp, today } from './dates'
import { secdataAdapter, sendVia } from './integrations/registry'
import { getStore, isRemoteTargetIn, nextNo, recordBatch } from './store'

export interface NotifyResult {
  kind: string
  targets: number
  ok: boolean
}

export async function runDailyNotify(): Promise<NotifyResult[]> {
  const s = getStore()
  const t = today()
  const month = t.slice(0, 7)
  const results: NotifyResult[] = []

  const send = async (kind: string, names: string[], subject: string) => {
    if (names.length === 0) return
    const r = await sendVia('groupware-mail', [...new Set(names)], subject)
    results.push({ kind, targets: new Set(names).size, ok: r.ok })
  }

  // 0) 출력물 자료 일배치 이관 (요구사항 55행 '일배치') — 수동 버튼과 동일 로직·중복 이관 방지.
  //    채널이 중지면 실패로 기록되어 연동 장애가 드러난다.
  {
    const adapter = secdataAdapter()
    if (adapter) {
      // 실 어댑터 예외가 스케줄러 틱 전체를 죽이지 않도록 이관을 감싼다 — 실패로 기록되고 다음 배치 유형은 계속 진행.
      try {
        const rows = await adapter.fetchPrintouts()
        let added = 0
        for (const row of rows) {
          if (s.printouts.some((p) => p.printedAt === row.printedAt && p.name === row.name && p.document === row.document)) continue
          s.printouts.push({ id: nextNo('PR', t.slice(0, 4), s.printouts.map((p) => p.id)), ...row, status: '미등록' })
          added += 1
        }
        if (added > 0) audit('스케줄러', '일배치 이관', `출력물 자료 ${added}건 (자동)`)
        recordBatch(`출력물 자료 일배치 이관 (자동, ${added}건)`, nowStamp(), '성공')
      } catch {
        recordBatch('출력물 자료 일배치 이관 (자동) — 연동 예외', nowStamp(), '실패')
      }
    } else {
      recordBatch('출력물 자료 일배치 이관 (자동)', nowStamp(), '실패')
    }
  }

  // 1) 미서약자 — 양식 개정일자 기준 유효 서약 없는 인원
  const revisedAt = s.pledgeForms.find((f) => f.kind === '일반')?.revisedAt ?? '0000-00-00'
  const signed = new Set(s.pledges.filter((p) => p.kind === '일반' && p.signedAt >= revisedAt).map((p) => p.name))
  await send('미서약', s.people.filter((p) => !signed.has(p.name)).map((p) => p.name), '[보안서약서] 미서약 안내')

  // 2) 보안점검 경과 — 예정월이 지났는데 완료·결재중이 아닌 항목의 점검자
  await send('점검 경과',
    s.inspectionPlans.filter((p) => p.month < month && (p.status === '계획' || p.status === '결과미등록')).map((p) => p.inspector),
    '[보안점검] 기한 경과 항목 안내')

  // 3) SR 지연 — 완료 예정일 경과 진행 건의 담당 CI
  await send('SR 지연',
    s.srRequests.filter((r) => r.dueDate && r.dueDate < t && !['완료', '반려', '작성중', '결재중'].includes(r.status))
      .map((r) => r.ci ?? r.requester),
    '[SR] 완료 예정일 경과 안내')

  // 4) 재택 체크리스트 미제출 — 당월 재택 대상자 중 미제출 인원 (명단 밖 인원에게는 안내하지 않는다)
  const submitted = new Set(s.remoteChecks.filter((r) => r.period === month).map((r) => r.name))
  const targets = new Set(s.remoteTargets.filter((t) => isRemoteTargetIn(t, month)).map((t) => t.name))
  await send('재택 미제출', s.people.filter((p) => targets.has(p.name) && !submitted.has(p.name)).map((p) => p.name),
    `[재택근무] ${month} 체크리스트 제출 안내`)

  // 7) 출력물 미등록 — 이관 후 폐기 정보를 등록하지 않은 출력자 안내 (요구사항 55행: 주기적 안내메일)
  const printPending = [...new Set(s.printouts.filter((p) => p.status === '미등록').map((p) => p.name))]
  await send('출력물 미등록', printPending, '[출력물] 폐기 정보 등록 안내')

  // 5) 반려 방치 — 반려 후 재상신하지 않은 기안자 (열린 '재상신' 할일 소유자, 재상신하면 할일이 닫혀 제외)
  await send('반려 방치',
    s.todos.filter((x) => x.kind === '재상신' && !x.done).map((x) => x.owner),
    '[결재] 반려 문서 재상신 안내')

  // 6) 확인서 미제출 — 보안위반 사실확인서 징구중 방치 인원 (제출하면 결재중으로 넘어가 자동 제외)
  await send('확인서 미제출',
    s.violations.filter((v) => v.status === '징구중').map((v) => v.name),
    '[보안위반] 사실확인서 제출 안내')

  const total = results.reduce((sum, r) => sum + r.targets, 0)
  const allOk = results.every((r) => r.ok)
  recordBatch(`일일 알림 배치 (${results.length}종 · ${total}명)`, nowStamp(), results.length === 0 || allOk ? '성공' : '실패')
  return results
}
