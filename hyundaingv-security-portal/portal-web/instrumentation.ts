/** 서버 기동 훅 — PORTAL_NOTIFY_INTERVAL_MS 가 설정되면 일일 알림 배치를 주기 실행한다.
 *  데모에서는 짧은 주기로 시연하고, 실서비스에서는 86400000(24h) 또는 외부 스케줄러를 쓴다.
 *  미설정 시 스케줄러는 뜨지 않고 연동·인프라 화면의 수동 실행만 남는다. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // 보안 기동 점검 — 프로덕션에서 세션 서명 키가 공개된 개발용 기본값이면 크게 경고한다.
  // (이 값이면 소스에 키가 있으므로 누구나 관리자 세션을 위조할 수 있다 — 반드시 SESSION_SECRET 설정)
  if (process.env.NODE_ENV === 'production') {
    const { SESSION_SECRET_IS_DEFAULT } = await import('./lib/session')
    if (SESSION_SECRET_IS_DEFAULT) {
      console.error('\n' + '='.repeat(72))
      console.error('[portal] ⚠ 보안 경고: SESSION_SECRET 미설정 — 공개된 개발용 서명 키 사용 중.')
      console.error('[portal]   프로덕션에서는 세션 위조가 가능합니다. 랜덤 키를 반드시 설정하세요:')
      console.error('[portal]   docker run -e SESSION_SECRET="$(openssl rand -base64 32)" ...')
      console.error('='.repeat(72) + '\n')
    }
  }

  const intervalMs = Number(process.env.PORTAL_NOTIFY_INTERVAL_MS)
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) return

  const { runDailyNotify } = await import('./lib/notify')
  const { audit } = await import('./lib/audit')
  const { backupDataFile, recordBatch } = await import('./lib/store')
  const { nowStamp } = await import('./lib/dates')

  const tick = async () => {
    try {
      const results = await runDailyNotify()
      audit('스케줄러', '알림 배치 실행',
        results.map((r) => `${r.kind} ${r.targets}명${r.ok ? '' : '(실패)'}`).join(', ') || '대상 없음')
      // 영속화 파일 일일 스냅샷 — PORTAL_DATA_FILE 미설정(인메모리)이면 조용히 건너뛴다
      const bak = backupDataFile()
      if (bak) recordBatch('데이터 파일 일일 백업 (보존 7개)', nowStamp(), '성공')
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
