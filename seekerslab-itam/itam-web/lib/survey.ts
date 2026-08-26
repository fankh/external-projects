/** 재물조사 자동 편성 대상 — 아직 어떤 회차에도 묶이지 않아 '지금 편성하면 실제로 줄어드는' 집합.
 *
 *  이 판정을 화면·액션·대시보드가 각자 적어 두면 서로 다른 수를 말한다. 실제로 그랬다:
 *  대시보드 '장기 미실측 (재물조사 편성)' 큐는 미실측 자산 전량을 세는데, 계획 화면과 자동 편성 액션은
 *  이미 개시 전·진행 중 회차에 편성된 자산을 뺀 수를 쓴다. 그래서 편성을 눌러 대상을 모두 회차로 묶어도
 *  큐 건수는 그대로 남아, 처리해도 줄지 않는 큐가 됐다(독촉 발송 대상에서 당일 발송분을 빼는 것과 같은 규약).
 *
 *  서버 전용 — 스토어를 직접 읽는다. */
import { isStaleVerify } from './dates'
import { getStore } from './store'
import type { Asset, DiscoveredAsset } from './types'

/** 장기 미실측 자산 전량 — 최근 실측이 없거나 운영 정책 기한(staleVerifyDays)을 넘긴 것 */
export function staleVerifyAssets(): Asset[] {
  const s = getStore()
  return s.assets.filter((a) => isStaleVerify(a, s.opsPolicy.staleVerifyDays))
}

/** 그중 편성 대기 — 개시 전(계획)·진행 중 회차가 아직 대상으로 잡지 않은 자산.
 *  완료 회차는 실측을 갱신했을 것이므로 대상 판정에 넣지 않는다. */
export function staleComposeTargets(): Asset[] {
  const s = getStore()
  const pending = new Set(
    s.inventoryRounds.filter((r) => r.status !== '완료').flatMap((r) => r.targets ?? []),
  )
  return staleVerifyAssets().filter((a) => !pending.has(a.assetNo))
}

/** 대사 '미확인'(유령) 발견 자산 전량 */
export function unconfirmedGhosts(): DiscoveredAsset[] {
  return getStore().discovered.filter((d) => d.state === '미확인')
}

/** 그중 편성 대기 — 어떤 회차에도(완료 포함) 묶이지 않은 건.
 *  미확인은 실물 확인 전까지 계속 미확인으로 남으므로 완료 회차까지 제외 대상에 넣는다. */
export function unconfirmedComposeTargets(): DiscoveredAsset[] {
  const s = getStore()
  const composed = new Set(s.inventoryRounds.flatMap((r) => r.targets ?? []))
  return unconfirmedGhosts().filter((g) => !composed.has(g.id))
}
