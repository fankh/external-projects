/** 부하 기준선 프로브 — 프로덕션 서버에 동시 요청을 보내 지연 분포를 잰다.
 *  게이트가 아니다(정보성): MS-SQL 전환(로드맵 3번)의 '동시 사용자 부하 기본 검증' 때
 *  인메모리 기준선과 비교하기 위한 참고 수치를 남긴다.
 *  사용: npm run build 후  node scripts/load_probe.mjs  (스모크와 같은 방식으로 서버를 띄우고 정리한다) */
import { execSync, spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const PORT = 3419
const BASE = `http://localhost:${PORT}`
const CONCURRENCY = 25
const ROUNDS = 4

const ACCOUNTS = {
  USER: { login: 'hw.kim', name: '김현우', dept: '개발1팀', role: 'USER' },
  DEPT_MGR: { login: 'sj.lee', name: '이수진', dept: '경영지원팀', role: 'DEPT_MGR' },
  BIZ_MGR: { login: 'jh.park', name: '박정호', dept: 'IT운영팀', role: 'BIZ_MGR' },
  ADMIN: { login: 'admin', name: '시스템관리자', dept: '정보기획팀', role: 'ADMIN' },
}
const SECRET = process.env.SESSION_SECRET ?? 'ngv-portal-dev-secret'
const sign = (acct) => {
  const payload = Buffer.from(JSON.stringify({ ...acct, exp: Date.now() + 3600000 }), 'utf8').toString('base64url')
  return `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`
}

// 대표 경로 — 읽기 무거운 화면(집계·목록) 위주, 역할 섞음
const TARGETS = [
  ['/dashboard', 'USER'], ['/dashboard', 'BIZ_MGR'],
  ['/work/approvals', 'BIZ_MGR'], ['/sr/requests', 'BIZ_MGR'],
  ['/finance/expense', 'DEPT_MGR'], ['/infra/incidents', 'BIZ_MGR'],
  ['/infra/racks', 'BIZ_MGR'], ['/compliance/inspection', 'BIZ_MGR'],
  ['/pledge/my', 'USER'], ['/settings/permissions', 'ADMIN'],
]

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/login`, { redirect: 'manual' })
      if (r.status === 200) return
    } catch { /* 기동 전 */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('서버 기동 대기 시간 초과')
}

async function main() {
  const server = spawn(`npx next start -p ${PORT}`, { cwd: ROOT, shell: true, stdio: 'ignore' })
  try {
    await waitReady()
    // 워밍업 1회 (첫 컴파일·캐시 제외)
    await Promise.all(TARGETS.map(([p, r]) => fetch(`${BASE}${p}`, { headers: { cookie: `ngv_portal_session=${sign(ACCOUNTS[r])}` } })))

    const latencies = []
    let errors = 0
    for (let round = 0; round < ROUNDS; round++) {
      const batch = []
      for (let i = 0; i < CONCURRENCY; i++) {
        const [p, r] = TARGETS[(round * CONCURRENCY + i) % TARGETS.length]
        batch.push((async () => {
          const t0 = performance.now()
          try {
            const res = await fetch(`${BASE}${p}`, { headers: { cookie: `ngv_portal_session=${sign(ACCOUNTS[r])}` }, redirect: 'manual' })
            if (res.status !== 200) errors++
            await res.text()
          } catch { errors++ }
          latencies.push(performance.now() - t0)
        })())
      }
      await Promise.all(batch)
    }

    latencies.sort((a, b) => a - b)
    const pct = (q) => Math.round(latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))])
    const total = ROUNDS * CONCURRENCY
    console.log(`✓ load-probe: ${total}요청 (동시 ${CONCURRENCY} × ${ROUNDS}라운드), 오류 ${errors}건`)
    console.log(`  p50 ${pct(0.5)}ms · p95 ${pct(0.95)}ms · max ${Math.round(latencies[latencies.length - 1])}ms`)
    process.exitCode = errors > 0 ? 1 : 0
  } finally {
    if (process.platform === 'win32') {
      try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }) } catch { /* 종료됨 */ }
    } else {
      server.kill()
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
