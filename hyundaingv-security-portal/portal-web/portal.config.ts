/** 고객사 프로필 선택 — 포털을 재사용 프레임워크로 쓰기 위한 커스터마이징 단일 지점.
 *  한 번 빌드한 이미지를 PORTAL_PROFILE 환경변수로 고객사 전환한다:
 *    (미설정)              → profiles/default.config       (데모 고객사)
 *    PORTAL_PROFILE=manufacturer → profiles/sample-manufacturer.config (제조업 예시)
 *    PORTAL_PROFILE=public       → profiles/sample-public.config       (공공기관 예시)
 *  새 고객사는 profiles/ 에 구성 파일을 추가하고 profiles/registry.ts 에 올린다(단일 원천).
 *  어댑터 구현은 lib/integrations/ 에 있고, adapterId 가 실제 구현을 가리킨다. */
import { ALL_PROFILES } from './profiles/registry'

const profile = ALL_PROFILES[process.env.PORTAL_PROFILE ?? ''] ?? ALL_PROFILES.default

export const PORTAL = profile.PORTAL
export const CHANNELS = profile.CHANNELS
