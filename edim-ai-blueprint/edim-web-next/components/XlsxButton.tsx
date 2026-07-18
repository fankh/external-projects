'use client'

/** 대장 XLSX 내보내기 버튼 — /api/next/xlsx 프록시 (P2 XLSX export 전반). */
import { useI18n } from '@/components/I18nProvider'

export function XlsxButton({ kind }: { kind: string }) {
  const { t } = useI18n()
  return (
    <button className="b" data-xlsx-export={kind} style={{ height: 20, fontSize: 10 }}
      title={t('common.xlsxExport', '대장 전체를 XLSX 로 내보내기')}
      onClick={() => window.open(`/api/next/xlsx?kind=${encodeURIComponent(kind)}`, '_blank')}>
      ⬇ XLSX
    </button>
  )
}
