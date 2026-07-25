'use client'

/** 9.44 — (app) 세그먼트 에러 바운더리(회복탄력성): 페이지가 잡지 못한 오류(백엔드 5xx·타임아웃 등)를
 *  기본 Next 오류 화면 대신 브랜디드·재시도 가능한 화면으로 열화한다. 레이아웃(I18nProvider·크롬)은
 *  유지되고 페이지 영역만 이 컴포넌트로 대체된다. */
import { useEffect } from 'react'
import { useI18n } from '@/components/I18nProvider'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n()
  useEffect(() => {
    // 관측용 콘솔 로그 (서버 로그는 Next 가 별도 기록)
    console.error('AppError boundary:', error?.message, error?.digest)
  }, [error])
  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--title-navy)' }}>
        {t('error.title', '화면을 불러오지 못했습니다')}
      </div>
      <div style={{ fontSize: 12, color: 'var(--txt-dim)', maxWidth: 560 }}>
        {t('error.body', '일시적인 오류가 발생했습니다. 백엔드 응답이 지연되었을 수 있습니다 — 다시 시도하거나 잠시 후 접속하십시오.')}
      </div>
      {error?.message ? (
        <div style={{ fontSize: 11, color: 'var(--txt-mute)', fontFamily: 'monospace' }}>{error.message}</div>
      ) : null}
      <button className="b run" onClick={() => reset()} style={{ marginTop: 4 }}>
        {t('error.retry', '다시 시도')}
      </button>
    </div>
  )
}
