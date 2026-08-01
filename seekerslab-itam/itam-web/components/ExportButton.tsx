import type { ExportKind } from '@/lib/exports'
import { EXPORT_META, canExport } from '@/lib/exports'
import type { Role } from '@/lib/types'

/** 엑셀 내보내기 버튼 — 권한 매트릭스에 '엑셀' 기능이 없는 역할에게는 렌더링하지 않는다.
 *  서버 라우트도 같은 규칙으로 막으므로 버튼 숨김은 UI 정리일 뿐 통제 수단이 아니다. */
export function ExportButton({ kind, role, label }: { kind: ExportKind; role: Role; label?: string }) {
  if (!canExport(kind, role)) return null
  return (
    <a className="btn sm" href={`/api/export/${kind}`} download>
      ⤓ {label ?? '엑셀'}
    </a>
  )
}

export { EXPORT_META }
