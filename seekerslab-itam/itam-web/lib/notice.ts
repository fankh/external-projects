import type { BoardPost } from './types'

/** 공지 대상 사용자 필터 — audienceDept 가 있으면 그 부서 사용자만, 없으면 전사. 필독 확인율·독촉 분모를
 *  대상 집단으로 좁혀, 무관한 팀까지 분모에 넣어 컴플라이언스 수치가 희석되던 문제를 없앤다.
 *  화면(NoticeBoard)·독촉 액션·대시보드 넛지가 같은 판정을 공유한다(단일 소스). */
export function noticeTargets<T extends { dept: string }>(post: Pick<BoardPost, 'audienceDept'>, users: T[]): T[] {
  return post.audienceDept ? users.filter((u) => u.dept === post.audienceDept) : users
}

/** 사용자(부서)가 이 공지의 대상인지 — 목록 가시성(비관리자)·대시보드 미확인 넛지 판정. 전사(미설정)면 항상 대상. */
export function inNoticeAudience(post: Pick<BoardPost, 'audienceDept'>, userDept?: string): boolean {
  return !post.audienceDept || post.audienceDept === userDept
}

/** 공지 대상 라벨 — 전사 또는 부서명. 목록·상세에서 대상 범위를 드러낸다. */
export function noticeAudienceLabel(post: Pick<BoardPost, 'audienceDept'>): string {
  return post.audienceDept ?? '전사'
}
