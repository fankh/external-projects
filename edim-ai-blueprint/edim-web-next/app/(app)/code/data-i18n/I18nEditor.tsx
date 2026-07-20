'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { importTranslationsExcel, saveTranslation } from './actions'

export interface DataTransRow { entityId: number; source: string; value: string }

const ENTITIES = ['COMPANY', 'PRODUCT', 'DOCUMENT']
const LOCALES = ['en', 'ja', 'zh']

export function I18nEditor({ rows, entity, locale }: { rows: DataTransRow[]; entity: string; locale: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const go = (e: string, l: string) => router.push(`/code/data-i18n?entity=${e}&locale=${l}`)
  const commit = (row: DataTransRow, value: string) => {
    if (value === row.value) return
    start(async () => {
      const r = await saveTranslation(entity, row.entityId, locale, value)
      setMsg(r.error ? `오류 — ${r.error}` : `저장 ✓ — #${row.entityId} ${value ? `“${value}”` : '(삭제)'}`)
    })
  }

  const cols: GridColumn<DataTransRow>[] = [
    { key: 'entityId', header: 'ID', width: 56, align: 'right', code: true, render: (r) => r.entityId },
    { key: 'source', header: t('di18n.source', '원문'), render: (r) => r.source },
    { key: 'value', header: `${t('di18n.translation', '번역')} (${locale})`, editable: true, render: (r) => r.value ? r.value : <span style={{ color: 'var(--txt-mute)' }}>—</span> },
    { key: 'status', header: t('di18n.statusCol', '상태'), width: 72, align: 'center', render: (r) => r.value ? <Chip tone="ok">{t('di18n.translated', '번역됨')}</Chip> : <Chip tone="warn">{t('di18n.untranslated', '미번역')}</Chip> },
  ]

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px' }}>
        <label style={{ fontSize: 11 }}>{t('di18n.target', '대상')}</label>
        <select className="in" value={entity} onChange={(e) => go(e.target.value, locale)} style={{ height: 22, fontSize: 11 }}>
          {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <label style={{ fontSize: 11 }}>{t('di18n.language', '언어')}</label>
        <select className="in" value={locale} onChange={(e) => go(entity, e.target.value)} style={{ height: 22, fontSize: 11 }}>
          {LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{t('di18n.editHint', '번역 셀 더블클릭 → 입력 → Enter (빈 값=삭제)')}</span>
        {/* 일괄 Export/Import (메뉴정의서 다국어 P2) — 3로케일 한 시트, 빈 칸=변경 없음 */}
        <button className="b" data-i18n-export style={{ height: 22, fontSize: 11 }}
          title={t('di18n.exportHint', '원문+en/ja/zh 번역표 XLSX (미번역=빈 칸)')}
          onClick={() => window.open(`/api/next/xlsx?kind=i18n&id=${entity}`, '_blank')}>⬇ XLSX</button>
        <label className="b" data-i18n-import style={{ cursor: 'pointer', height: 22, fontSize: 11, display: 'inline-flex', alignItems: 'center' }}
          title={t('di18n.importHint', '번역 XLSX 일괄 Import — 헤더 ID·en/ja/zh, 빈 칸=변경 없음')}>
          ⬆ Import
          <input type="file" accept=".xlsx" style={{ display: 'none' }} disabled={pending}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              const fd = new FormData(); fd.append('uploadedFile', f)
              start(async () => {
                const r = await importTranslationsExcel(entity, fd)
                setMsg(r.error ? `오류 — ${r.error}`
                  : `${t('di18n.importDone', '일괄 Import ✓')} — ${r.upserted}${t('di18n.cellUnit', '셀')}${r.rejected?.length ? ` · ${t('di18n.rejected', '거부')} ${r.rejected.length}` : ''}`)
                router.refresh()
              })
            }} />
        </label>
        {msg ? <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--run)' }}>{pending ? t('di18n.saving', '저장 중…') : msg}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey={`next-i18n-${entity}`} colFilter columns={cols} rows={rows}
          rowKey={(r) => r.entityId} onCellEdit={(row, _i, _k, value) => commit(row, value)} emptyText={t('di18n.empty', '항목이 없습니다')} />
      </div>
    </div>
  )
}
