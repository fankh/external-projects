import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { RelationshipView, type ChildRow } from './RelationshipView'

export const dynamic = 'force-dynamic'

// S-1-4 Code Relationship — Mother-Child slot_map. Running Test 통과(CODE-009) 시 승인 요청 가능.
const MOTHER = {
  code: 'KDCR 3-13',
  desc: 'Double Suction casing with reinforced frame',
  slots: [
    { slot: 'A', label: 'Fan Model', values: 'KAD · KFD' },
    { slot: 'B', label: 'Fan Size', values: '350~800' },
    { slot: 'C', label: 'Material', values: 'Gal. CU AL 316 FRP' },
    { slot: 'D', label: 'Bearing', values: 'Ball · Roller' },
    { slot: 'E', label: 'Air Vol.', values: '-' },
    { slot: 'F', label: 'FF', values: 'None · FF' },
  ],
}

export default async function RelationshipPage() {
  const bundle = bundleFor(await getLocale())
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let children: ChildRow[] = []
  let err: string | null = null
  try {
    children = await apiServer<ChildRow[]>(`/codes/relationships/${encodeURIComponent(MOTHER.code)}/children`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('rel.title', 'Code Relationship')} (S-1-4)`} count={err ? undefined : children.length} countLabel={t('rel.childUnit', 'child')} source="/codes/relationships/{mother}/children" />
      {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div>
        : <RelationshipView mother={MOTHER} children={children} />}
    </div>
  )
}
