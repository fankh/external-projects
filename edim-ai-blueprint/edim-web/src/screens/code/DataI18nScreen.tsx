/** 데이터 번역 (M-13-2) — 마스터 데이터(거래처·제품코드·문서) 콘텐츠 i18n.
 *  UI 크롬 번역(sys_translation entity_type='UI')과 별개로, 데이터 값 번역 트랙.
 *  대상×로케일 선택 → 원문 옆 번역 인라인 편집(빈 값=삭제). SETUP 이상. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { dataI18nService, type DataEntityType, type DataTransRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { usePermission } from '../../shell/PermissionContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const ENTITY_OPTS: { value: DataEntityType; label: string }[] = [
  { value: 'COMPANY', label: '거래처명 (com_company)' },
  { value: 'PRODUCT', label: '제품 코드명 (product_code)' },
  { value: 'DOCUMENT', label: '문서 제목 (doc_control)' },
]
const LOCALE_OPTS = [
  { value: 'en', label: 'English (en)' },
  { value: 'ja', label: '日本語 (ja)' },
  { value: 'zh', label: '中文 (zh)' },
]

export function DataI18nScreen({ active }: ScreenProps) {
  const shell = useShell()
  const perm = usePermission()
  const { setStatusMsg } = shell
  const [entity, setEntity] = useState<DataEntityType>('COMPANY')
  const [locale, setLocale] = useState('en')
  const [rows, setRows] = useState<DataTransRow[]>([])
  const [offline, setOffline] = useState(false)
  const canWrite = perm.canWrite('i18n-data')

  const load = useCallback(() => {
    void dataI18nService.list(entity, locale).then((r) => {
      if (r === null) { setOffline(true); return }
      setOffline(false); setRows(r)
    })
  }, [entity, locale])
  useEffect(() => { load() }, [load])
  useFKeys(active, useMemo(() => ({ F8: load }), [load]))

  const saveCell = (r: DataTransRow, value: string) => {
    if (value === r.value) return
    void dataI18nService.upsert(entity, r.entityId, locale, value)
      .then((ok) => {
        if (!ok) { setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
        setRows((prev) => prev.map((x) => (x.entityId === r.entityId ? { ...x, value: value.trim() } : x)))
        setStatusMsg(value.trim()
          ? `번역 저장 ✓ — ${r.source} → [${locale}] ${value.trim()} (sys_translation)`
          : `번역 삭제 ✓ — ${r.source} [${locale}]`)
      })
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const done = rows.filter((r) => r.value).length
  const cols: GridColumn<DataTransRow>[] = [
    { key: 'id', header: 'ID', width: 60, align: 'right', code: true, render: (r) => r.entityId },
    { key: 'src', header: '원문 (KO)', render: (r) => r.source || <span style={{ color: 'var(--txt-mute)' }}>—</span> },
    {
      key: 'val', header: `번역 (${locale}) — 더블클릭 편집`, editable: canWrite,
      editValue: (r) => r.value,
      render: (r) => r.value
        ? <span style={{ color: 'var(--title-navy)' }}>{r.value}</span>
        : <span style={{ color: 'var(--txt-mute)', fontStyle: 'italic' }}>미번역</span>,
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>대상</label>
        <Combo width={200} value={entity} options={ENTITY_OPTS} onChange={(v) => setEntity(v as DataEntityType)} />
        <label>로케일</label>
        <Combo width={130} value={locale} options={LOCALE_OPTS} onChange={setLocale} />
        <Chip tone={done === rows.length && rows.length ? 'ok' : 'info'}>{done}/{rows.length} 번역</Chip>
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          데이터 값 번역 — 로케일 전환 시 목록에 오버레이. 빈 값 저장 = 번역 삭제(원문 표시)
        </span>
        <span style={{ flex: 1 }} />
        <Btn onClick={load}>조회 F8</Btn>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox title={`데이터 번역 — ${ENTITY_OPTS.find((e) => e.value === entity)?.label ?? entity}`} noPad style={{ height: '100%' }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>
              백엔드 연결 필요 — 데이터 번역은 실DB(sys_translation)에서만 관리됩니다
            </div>
          ) : (
            <DenseGrid prefKey="data-i18n" columns={cols} rows={rows} rowKey={(r) => r.entityId}
              emptyText="대상 데이터가 없습니다" onCellEdit={(r, _i, _k, v) => saveCell(r, v)} />
          )}
        </GroupBox>
      </div>
    </div>
  )
}
