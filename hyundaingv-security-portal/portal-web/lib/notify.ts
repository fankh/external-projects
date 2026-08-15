/** 일일 알림 배치 — 기한 경과·미이행 항목을 스캔해 대상자별 안내메일을 보낸다.
 *  요구사항의 "주기적 안내메일 / 경과 항목 알림 - 메일"을 담당한다. 데모에서는 수동
 *  실행 버튼으로 트리거하고, 실서비스에서는 스케줄러(일배치)에 연결한다. */
import { audit } from './audit'
import { currentYear, nowStamp, today } from './dates'
import { secdataAdapter, sendVia, withTimeout } from './integrations/registry'
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
  // 재직 명단 스냅샷 — 배치는 s.people 을 여러 구간(미서약·재서약·재택)에서 sendVia await 를 사이에 두고
  // 읽는다. syncHr(인사 즉시 동기화)는 s.people 을 '참조 교체'(s.people = new)로 갱신하므로, 배치 도중
  // 수동 동기화가 끼면 앞 구간은 옛 명단·뒤 구간은 새 명단으로 평가돼 한 배치가 내부 불일치(퇴사자가
  // 미서약엔 잡히고 재택엔 빠지는 등)해진다. 배치 시작 시 참조를 1회 포착해 전 구간 반복읽기 일관성을 준다
  // (재진입 가드 __ngvNotifyTicking 이 notify-vs-notify 를, 이 스냅샷이 notify-vs-syncHr 를 담당).
  // 얕은 복사로 포착 — 참조 교체(syncHr)·in-place 변경 양쪽에 불변인 완전한 명단 스냅샷.
  const people = [...s.people]

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
        const rows = await withTimeout(adapter.fetchPrintouts(), '출력물 자료 이관')
        let added = 0
        for (const row of rows) {
          // 실 고객사 secdata 어댑터가 계약(문자열 필드)을 어겨 name·document·printedAt 누락·비문자열을 반환해도
          // 스토어에 넣지 않는다 — undefined name 은 알림 수신자(출력물 미등록)를 유령으로 만들고 화면 집계를
          // 흐린다(syncHr v1.5.69 와 동일 수집 경로 계약 검증). 형태 어긋난 행은 건너뛴다.
          // name·document·printedAt(식별·수신자) 외 dept·pages 도 검증 — {p.dept}·{p.pages} 직접 렌더가
          // 객체값이면 React child 500(인메모리 주입은 loadFromFile 정규화 우회, prints importDaily 와 동일).
          if (typeof row.name !== 'string' || typeof row.document !== 'string' || typeof row.printedAt !== 'string'
            || typeof row.dept !== 'string' || typeof row.pages !== 'number') continue
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
  const signed = new Set(s.pledges.filter((p) => p.year === currentYear() && p.kind === '일반' && p.signedAt >= revisedAt).map((p) => p.name))
  await send('미서약', people.filter((p) => !signed.has(p.name)).map((p) => p.name), '[보안서약서] 미서약 안내')

  // 1-b) 비-일반 서약 재서약 방치 — 개정 후 미완료 재서약 할일(관리책임자·재택·특별·프로젝트). 일반은 위 1)에서 별도.
  // 손상 파일의 title 누락(undefined) todo 에 .includes 가 TypeError→배치 전체 중단되지 않도록 문자열 강제.
  const reSign = s.todos.filter((x) => x.kind === '보안서약서' && !x.done && !String(x.title ?? '').includes('일반 보안서약서'))
  // 재직자만 통지 — 재서약 할일은 서명으로만 닫히므로 프로젝트 멤버 등이 퇴사해 s.people 에서 빠져도 할일은
  // 남는다(재조정 경로 없음). reSignTargets(v1.5.67)는 재직 명단과 교집합하나 이 todo 기반 경로는 놓쳐 떠난
  // 인원에게 안내메일·집계가 갔다 → 미서약·재택 미제출 등 타 유형과 동일하게 현재 재직자로 교집합한다.
  const reSignOwners = [...new Set(reSign.map((x) => x.owner))].filter((name) => people.some((p) => p.name === name))
  await send('비일반 재서약', reSignOwners, '[보안서약서] 개정 재서약 안내')

  // 2) 보안점검 경과 — 예정월이 지났는데 완료·결재중이 아닌 항목의 점검자
  // 재직자 교집합 — 점검자가 퇴사해 s.people 에서 빠지면 점검을 수행·등록할 수 없으므로(유령 독촉) 타 person
  // 경로(미서약·재택·반려방치·확인서·출력물)와 동일하게 현재 재직 명단과 교집합한다. 점검 계획 자체는 점검
  // 화면에 남아 미등록·경과 가시성은 유지된다(점검자는 관리자급 ACCOUNTS 로, 정상 재직자는 모두 s.people 에 있음).
  await send('점검 경과',
    s.inspectionPlans.filter((p) => p.month < month && (p.status === '계획' || p.status === '결과미등록'))
      .map((p) => p.inspector).filter((name) => people.some((p) => p.name === name)),
    '[보안점검] 기한 경과 항목 안내')

  // 3) SR 지연 — 완료 예정일 경과 진행 건의 담당 CI
  await send('SR 지연',
    s.srRequests.filter((r) => r.dueDate && r.dueDate < t && !['완료', '반려', '작성중', '결재중'].includes(r.status))
      .map((r) => r.ci ?? r.requester),
    '[SR] 완료 예정일 경과 안내')

  // 4) 재택 체크리스트 미제출 — 당월 재택 대상자 중 미제출 인원 (명단 밖 인원에게는 안내하지 않는다)
  const submitted = new Set(s.remoteChecks.filter((r) => r.period === month).map((r) => r.name))
  const targets = new Set(s.remoteTargets.filter((t) => isRemoteTargetIn(t, month)).map((t) => t.name))
  await send('재택 미제출', people.filter((p) => targets.has(p.name) && !submitted.has(p.name)).map((p) => p.name),
    `[재택근무] ${month} 체크리스트 제출 안내`)

  // 7) 출력물 미등록 — 이관 후 폐기 정보를 등록하지 않은 출력자 안내 (요구사항 55행: 주기적 안내메일)
  // 재직자 교집합 — 출력자(secdata 이관)가 퇴사해 s.people 에서 빠지면 폐기 등록을 할 수 없으므로(유령 독촉)
  // 타 person 경로(미서약·재택·반려방치·확인서)와 동일하게 재직 명단과 교집합한다. 미등록 출력물 자체는
  // 관리자 화면에 남아 후속 추적 가시성은 유지된다.
  const printPending = [...new Set(s.printouts.filter((p) => p.status === '미등록').map((p) => p.name))]
    .filter((name) => people.some((p) => p.name === name))
  await send('출력물 미등록', printPending, '[출력물] 폐기 정보 등록 안내')

  // 5) 반려 방치 — 반려 후 재상신하지 않은 기안자 (열린 '재상신' 할일 소유자, 재상신하면 할일이 닫혀 제외)
  // 재직자 교집합 — '재상신' 할일은 기안자 본인의 재상신으로만 닫히므로 기안자가 퇴사해 s.people 에서 빠져도
  // 할일은 남는다(재조정 경로 없음). 비일반 재서약(위 1-b, v1.5.71)과 구조적으로 동일한 유령 독촉 경로라
  // 같은 재직 명단 교집합을 적용한다(떠난 인원에게 매일 재상신 안내가 가고 배치 집계가 부풀던 사각).
  await send('반려 방치',
    s.todos.filter((x) => x.kind === '재상신' && !x.done).map((x) => x.owner).filter((name) => people.some((p) => p.name === name)),
    '[결재] 반려 문서 재상신 안내')

  // 6) 확인서 미제출 — 보안위반 사실확인서 징구중 방치 인원 (제출하면 결재중으로 넘어가 자동 제외)
  // 재직자 교집합 — 위반자가 퇴사하면 확인서를 제출할 수 없으므로(징구 불가) 유령 독촉을 막는다. 위반 기록
  // 자체는 위반 화면에 남아 미해결 가시성은 유지된다(타 person 경로와 동일 재직 명단 정합).
  await send('확인서 미제출',
    s.violations.filter((v) => v.status === '징구중').map((v) => v.name).filter((name) => people.some((p) => p.name === name)),
    '[보안위반] 사실확인서 제출 안내')

  const total = results.reduce((sum, r) => sum + r.targets, 0)
  const allOk = results.every((r) => r.ok)
  recordBatch(`일일 알림 배치 (${results.length}종 · ${total}명)`, nowStamp(), results.length === 0 || allOk ? '성공' : '실패')
  return results
}

/** 재진입 가드 공유 래퍼 — 스케줄러 틱과 수동 실행(연동·인프라 화면 버튼)이 겹쳐 돌면 같은 안내메일이
 *  중복 발송되고 동시 뮤테이션이 생긴다. 전역 플래그(__ngvNotifyTicking)로 두 경로를 직렬화해, 이미
 *  실행 중이면 이번 호출은 건너뛰고 null 을 반환한다(스케줄러 전용이던 v1.5.48 가드를 수동 경로까지 확장). */
export async function runDailyNotifyOnce(): Promise<NotifyResult[] | null> {
  const g = globalThis as typeof globalThis & { __ngvNotifyTicking?: boolean }
  if (g.__ngvNotifyTicking) return null
  g.__ngvNotifyTicking = true
  try {
    return await runDailyNotify()
  } finally {
    g.__ngvNotifyTicking = false
  }
}
