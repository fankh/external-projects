import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 1.1 — 현재 서버 빌드 ID (.next/BUILD_ID). 배포 스큐 감지용 — 프로세스당 1회 읽어 캐시. */
let cached: string | null = null

export function buildId(): string {
  if (cached) return cached
  for (const p of [join(process.cwd(), '.next', 'BUILD_ID'), join(process.cwd(), '..', '.next', 'BUILD_ID')]) {
    try {
      cached = readFileSync(p, 'utf8').trim()
      if (cached) return cached
    } catch { /* 다음 후보 경로 */ }
  }
  cached = process.env.EDIM_BUILD_ID || 'dev'
  return cached
}
