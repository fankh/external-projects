/** 참조 구현 — REST 기반 고객사 어댑터 예시 (복사해서 시작하는 템플릿).
 *
 *  이 파일은 registry 에 등록되지 않는다(어떤 프로필도 참조하지 않음). 컴파일 검증만 받아
 *  인터페이스가 바뀌면 여기서도 타입 오류가 나므로, 문서의 코드 블록과 달리 낡지 않는다.
 *  실제 연동 시: 이 파일을 `lib/integrations/<고객사>.ts` 로 복사→엔드포인트·인증·스키마 매핑을
 *  고객 시스템에 맞추고→`registry.ts` 종류별 맵에 adapterId 로 등록→프로필 채널에 바인딩한다.
 *  절차는 docs/어댑터_연동_가이드.md 참조.
 *
 *  오류·타임아웃 계약(중요):
 *   · 실패(네트워크·인증·비정상 응답)는 그냥 throw 한다 — 포털 호출부가 실패 이력으로 흡수한다.
 *   · 자체 타임아웃을 넣지 않는다 — 포털이 모든 어댑터 호출을 withTimeout 으로 감싼다.
 *   · 메시징은 예외 대신 { ok:false, detail } 로 '보냈으나 일부 실패' 같은 소프트 실패도 표현 가능.
 */
import type { AssetAdapter, ExternalAsset, HrAdapter, MessagingAdapter, SendResult } from '../types'
import type { Person } from '@/lib/types'

// 배포 환경변수로 주입 — 여기서는 예시 키. 실제 이름은 고객사 어댑터에서 정한다.
const BASE = process.env.ACME_API_BASE_URL ?? ''
const auth = () => ({ Authorization: `Bearer ${process.env.ACME_API_TOKEN ?? ''}` })

/** 인사 디렉터리(REST) — 고객 스키마를 포털 Person({name,dept})으로 매핑한다. */
export const acmeHr: HrAdapter = {
  async fetchPeople(): Promise<Person[]> {
    const res = await fetch(`${BASE}/api/v1/employees`, { headers: auth() })
    if (!res.ok) throw new Error(`ACME 인사 API ${res.status}`) // 포털이 실패로 흡수
    const rows = (await res.json()) as Array<{ empName: string; orgName: string }>
    return rows.map((r) => ({ name: r.empName, dept: r.orgName }))
  },
}

/** 메일·문자(REST) — 소프트 실패는 예외 대신 ok:false 로 표현. */
export const acmeMail: MessagingAdapter = {
  async send(to: string[], subject: string): Promise<SendResult> {
    const res = await fetch(`${BASE}/api/v1/mail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ to, subject }),
    })
    if (!res.ok) return { ok: false, detail: `메일 API ${res.status}` }
    return { ok: true, detail: `메일 ${to.length}건 발송` }
  },
}

/** 자산관리(REST) — 조회 + 신규 자산등록번호 취득(폐쇄 루프). */
export const acmeAsset: AssetAdapter = {
  async searchAssets(query: string): Promise<ExternalAsset[]> {
    const res = await fetch(`${BASE}/api/v1/assets?q=${encodeURIComponent(query)}`, { headers: auth() })
    if (!res.ok) throw new Error(`ACME 자산 API ${res.status}`)
    const rows = (await res.json()) as Array<{ serial: string; model: string; category: string; holder: string; assetNo?: string }>
    return rows.map((r) => ({ serial: r.serial, model: r.model, category: r.category, holder: r.holder, assetNo: r.assetNo }))
  },
  async acquireAssetNo(serial: string): Promise<{ assetNo: string }> {
    const res = await fetch(`${BASE}/api/v1/assets/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({ serial }),
    })
    if (!res.ok) throw new Error(`ACME 자산등록 API ${res.status}`)
    const { assetNo } = (await res.json()) as { assetNo: string }
    return { assetNo }
  },
}
