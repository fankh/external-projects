/** Mock 서비스 계층 — 각 함수의 주석이 대응 REST 엔드포인트(OpenAPI)다.
 *  실 API 전환: 함수 본문을 fetch 로 교체 (시그니처·타입 불변). */
import type { ExpandResult, RunResult, RunStep, SlotDef, TechDataRow, User } from './types'
import {
  expandBom, finishedGoods, KOF_SLOTS, RUN_LOGS, RUN_OUTPUTS, RUN_STEPS, TECH_DATA,
} from './mock/data'

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ── SVC-01 Auth ──
export const authService = {
  /** POST /api/v1/auth/login — mock 고정 계정 edim/edim */
  async login(userId: string, password: string): Promise<User> {
    await delay(350)
    if (!userId.trim() || !password.trim()) {
      throw new Error('사번과 비밀번호를 입력하십시오')
    }
    if (userId.trim() !== 'edim' || password !== 'edim') {
      throw new Error('사번 또는 비밀번호가 올바르지 않습니다')
    }
    return {
      userId, name: 'YS.Gang', department: '기술연구소',
      userLevel: 'SETUP', tenantId: 'nova',
    }
  },
}

// ── SVC-03 Code ──
export const codeService = {
  /** GET /api/v1/codes/groups/{group}/slots — 승인된 값만 (CODE-003) */
  async getSlotDefs(_group: string): Promise<SlotDef[]> {
    await delay(120)
    return KOF_SLOTS
  },
  /** POST /api/v1/codes/products/{id}/expand */
  async expand(slotValues: Record<string, string>): Promise<ExpandResult> {
    await delay(250)
    return { finishedGoodsCode: finishedGoods(slotValues), items: expandBom(slotValues) }
  },
}

// ── SVC-05 Table ──
export const tableService = {
  /** GET /api/v1/tables/{id}/query?range= — row_key_num 범위 조회 */
  async queryTechData(airflow: number, pressure: number): Promise<TechDataRow[]> {
    await delay(200)
    // 선정점 근접 순 정렬 (mock — 실제는 Macro 계산)
    return [...TECH_DATA].sort(
      (a, b) => Math.abs(a.pd - airflow) + Math.abs(a.pt - pressure)
        - (Math.abs(b.pd - airflow) + Math.abs(b.pt - pressure)),
    )
  },
}

// ── SVC-07 CPQ / ENG-02 Run ──
let runSeq = 7

export const cpqService = {
  /** POST /api/v1/cpq/selections/{id}/runs → 202 + GET /api/v1/cpq/runs/{id} 폴링.
   *  mock: onProgress 콜백으로 단계 완료를 순차 통지 (총 ~5s). */
  startRun(onProgress: (r: RunResult) => void): { runId: number; cancel: () => void } {
    const runId = runSeq++
    const steps: RunStep[] = RUN_STEPS.map((s) => ({ ...s, status: 'PENDING' }))
    let i = 0
    let cancelled = false

    const emit = (status: RunResult['status'], progress: number) => {
      onProgress({
        runId, status, progress,
        steps: steps.map((s) => ({ ...s })),
        outputs: status === 'SUCCESS' ? RUN_OUTPUTS : [],
        logs: RUN_LOGS.slice(0, Math.ceil(RUN_LOGS.length * progress)),
      })
    }

    const tick = () => {
      if (cancelled) return
      if (i > 0) steps[i - 1].status = steps[i - 1].no === 4 ? 'WARN' : 'DONE'
      if (i < steps.length) {
        steps[i].status = 'RUNNING'
        i += 1
        emit('RUNNING', (i - 0.5) / steps.length)
        setTimeout(tick, 700 + Math.floor(i * 60))
      } else {
        emit('SUCCESS', 1)
      }
    }
    setTimeout(tick, 300)
    return { runId, cancel: () => { cancelled = true } }
  },
}
