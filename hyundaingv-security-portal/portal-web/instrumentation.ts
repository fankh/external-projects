/** 서버 기동 훅 — PORTAL_NOTIFY_INTERVAL_MS 가 설정되면 일일 알림 배치를 주기 실행한다.
 *  데모에서는 짧은 주기로 시연하고, 실서비스에서는 86400000(24h) 또는 외부 스케줄러를 쓴다.
 *  미설정 시 스케줄러는 뜨지 않고 연동·인프라 화면의 수동 실행만 남는다. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const intervalMs = Number(process.env.PORTAL_NOTIFY_INTERVAL_MS)
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) return

  const { runDailyNotify } = await import('./lib/notify')
  const { audit } = await import('./lib/audit')

  const tick = async () => {
    try {
      const results = await runDailyNotify()
      audit('스케줄러', '알림 배치 실행',
        results.map((r) => `${r.kind} ${r.targets}명${r.ok ? '' : '(실패)'}`).join(', ') || '대상 없음')
    } catch {
      // 스케줄 실패가 서버를 죽이면 안 된다 — 다음 주기에 재시도
    }
  }
  // dev/HMR 재등록으로 인터벌이 중첩되면 같은 안내메일이 중복 발송된다 — 기존 타이머를 교체한다
  const g = globalThis as typeof globalThis & { __ngvNotifyTimer?: NodeJS.Timeout }
  if (g.__ngvNotifyTimer) clearInterval(g.__ngvNotifyTimer)
  g.__ngvNotifyTimer = setInterval(tick, intervalMs)
  console.log(`[portal] 알림 배치 스케줄러 가동 — ${intervalMs}ms 주기`)
}
