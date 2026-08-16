/** 고객사 프로필 레지스트리 — 전 프로필의 단일 원천.
 *  런타임 선택(portal.config.ts)과 계약 자가진단(lib/integrations/conformance.ts)이
 *  모두 이 맵을 소비한다. 새 고객사 프로필은 여기 한 곳에만 등록하면 선택·진단에 함께
 *  반영된다 — 두 곳에 따로 올리다 한쪽을 빠뜨리면 새 프로필이 자가진단에서 누락된다. */
import * as defaultProfile from './default.config'
import * as manufacturerProfile from './sample-manufacturer.config'
import * as publicProfile from './sample-public.config'
import * as financeProfile from './sample-finance.config'

export const ALL_PROFILES: Record<string, typeof defaultProfile> = {
  default: defaultProfile,
  manufacturer: manufacturerProfile,
  public: publicProfile,
  finance: financeProfile,
}
