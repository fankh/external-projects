/** 세션 서명 키 격리 검증 — 보안 게이트.
 *  실배포는 고객사별로 다른 SESSION_SECRET 을 쓴다. 이 스크립트는 커스텀 키로 서버를 띄우고:
 *   1) 그 키로 서명한 세션 → 인증 통과(200)          (커스텀 키 서명 경로가 실제로 동작)
 *   2) 다른 키(개발 기본값)로 서명한 세션 → 거부(로그인 리다이렉트)  (키 격리 — 타 고객사 세션 무효)
 *  게이트가 항상 개발 기본 키로만 도는 사각(v1.5.4 SECRET 파생 변경)을 닫는다.
 *  사용: npm run build 후  node scripts/session_keycheck.mjs */
import { execSync, spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const PORT = 3419
const BASE = `http://localhost:${PORT}`
const CUSTOM = 'customer-A-random-key-9f3a2b7c1e'
const DEV_DEFAULT = 'ngv-portal-dev-secret'

const admin = { login: 'admin', name: '시스템관리자', dept: '정보기획팀', role: 'ADMIN' }
const sign = (secret) => {
  const payload = Buffer.from(JSON.stringify({ ...admin, exp: Date.now() + 3600000 }), 'utf8').toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}
const get = (secret) => fetch(`${BASE}/dashboard`, { redirect: 'manual', headers: { cookie: `ngv_portal_session=${sign(secret)}` } })

let pass = 0
const fails = []
const check = (ok, label) => { if (ok) pass++; else fails.push(label) }

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/login`, { redirect: 'manual' })).status === 200) return } catch { /* 기동 전 */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('서버 기동 대기 시간 초과')
}

async function main() {
  if (!existsSync(path.join(ROOT, '.next'))) { console.error('✗ .next 빌드 없음 — npm run build 먼저'); process.exit(1) }
  // 커스텀 SESSION_SECRET 으로 서버 기동
  const server = spawn(`npx next start -p ${PORT}`, {
    cwd: ROOT, shell: true, stdio: 'ignore',
    env: { ...process.env, SESSION_SECRET: CUSTOM },
  })
  try {
    await waitReady()
    const okCustom = await get(CUSTOM)
    check(okCustom.status === 200, `커스텀 키 서명 세션 → 인증 통과 (got ${okCustom.status})`)

    const rejDefault = await get(DEV_DEFAULT)
    check(rejDefault.status === 307 && (rejDefault.headers.get('location') ?? '').includes('/login'),
      `타 키(개발 기본값) 서명 세션 → 거부 (got ${rejDefault.status})`)

    const rejOther = await get('customer-B-different-key-0000')
    check(rejOther.status === 307, `또 다른 키 서명 세션 → 거부 (키 격리, got ${rejOther.status})`)

    console.log(`\n${fails.length === 0 ? '✓' : '✗'} session-keycheck: ${pass} 통과, ${fails.length} 실패`)
    for (const f of fails) console.error(`  ✗ ${f}`)
    process.exitCode = fails.length === 0 ? 0 : 1
  } finally {
    if (process.platform === 'win32') { try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }) } catch { /* 종료됨 */ } }
    else server.kill()
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
