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

  const { runDailyNotifyOnce } = await import('./lib/notify')
  const { audit } = await import('./lib/audit')
  const { backupDataFile, getStore, recordBatch } = await import('./lib/store')
  const { nowStamp, today } = await import('./lib/dates')

  // dev/HMR 재등록으로 인터벌이 중첩되면 같은 안내메일이 중복 발송된다 — 기존 타이머를 교체한다.
  // 재진입 가드(__ngvNotifyTicking)는 runDailyNotifyOnce 안으로 옮겨 스케줄러 틱과 수동 실행이 같은
  // 가드를 공유한다 — 틱이 인터벌보다 길거나 수동 실행과 겹쳐도 중복 발송·동시 뮤테이션을 막는다.
  const g = globalThis as typeof globalThis & { __ngvNotifyTimer?: NodeJS.Timeout }
  const tick = async () => {
    try {
      const results = await runDailyNotifyOnce()
      if (results === null) return  // 이미 실행 중(수동 등)과 겹침 — 이번 틱은 건너뛴다
      audit('스케줄러', '알림 배치 실행',
        results.map((r) => `${r.kind} ${r.targets}명${r.ok ? '' : '(실패)'}`).join(', ') || '대상 없음')
      // 영속화 파일 일일 스냅샷 — PORTAL_DATA_FILE 미설정(인메모리)이면 조용히 건너뛴다
      const bak = backupDataFile()
      if (bak) recordBatch('데이터 파일 일일 백업 (보존 7개)', nowStamp(), '성공')
    } catch {
      // 스케줄 실패가 서버를 죽이면 안 된다 — 다음 주기에 재시도
    }
  }
  if (g.__ngvNotifyTimer) clearInterval(g.__ngvNotifyTimer)
  g.__ngvNotifyTimer = setInterval(tick, intervalMs)

  // 기동 시 밀린 일일 배치 따라잡기 — setInterval 은 부팅 시점에 앵커돼 인터벌보다 잦은 재시작(야간 배포·
  // 오토스케일·PaaS 유휴 축출·크래시)이 매번 카운트다운을 리셋해, 24h 주기라면 틱이 영영 안 와 미서약·SR
  // 지연·재택·확인서 컴플라이언스 메일이 조용히 영구 중단된다. 오늘자 일일 배치 기록이 없으면 기동 즉시 1회
  // 발화한다 — 재진입 가드(__ngvNotifyTicking)가 틱·수동 실행과 중복을 막고, recordBatch 가 '오늘 실행'을
  // 표시해 잦은 재시작에도 하루 1회로 수렴한다(인메모리·미영속 배포는 기록이 없어 기동마다 1회, 무해).
  try {
    const g2 = globalThis as typeof globalThis & { __ngvPortalQuarantined?: boolean }
    // 손상 파일 격리 후 시드 폴백 부팅이면 따라잡기 발화를 건너뛴다 — 메모리 상태가 시드(실데이터 아님)라
    // 시드 기준 컴플라이언스 메일(미서약·재택 등)을 실 명단에 잘못 보내지 않게 한다(backupDataFile 보류와 동일).
    getStore() // 스토어 초기화(격리 플래그 세팅) 유도
    const ranToday = getStore().batchRuns.some((b) => b.job.startsWith('일일 알림 배치') && b.ranAt.startsWith(today()))
    if (!ranToday && !g2.__ngvPortalQuarantined) void tick()
  } catch { /* 스토어 미초기화 등 — 다음 인터벌 틱이 처리 */ }
  console.log(`[portal] 알림 배치 스케줄러 가동 — ${intervalMs}ms 주기`)
}
