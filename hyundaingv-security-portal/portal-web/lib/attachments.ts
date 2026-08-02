/** 공통 첨부 처리 — 폼의 File 을 검증하고 메타데이터를 스토어에 등록한다.
 *  크기 상한·파일명 정제는 서버에서 재검증한다(시큐어 코딩). */
import { today } from './dates'
import { getStore, nextNo } from './store'

const MAX_SIZE_KB = 10 * 1024

export function registerUpload(refId: string, entry: FormDataEntryValue | null, by: string): void {
  if (!(entry instanceof File) || entry.size === 0) return
  if (entry.size > MAX_SIZE_KB * 1024) return
  const s = getStore()
  const name = entry.name.replace(/[\\/]/g, '_').slice(0, 120)
  s.attachments.push({
    id: nextNo('AT', today().slice(0, 4), s.attachments.map((a) => a.id)),
    refId, name, sizeKb: Math.max(1, Math.ceil(entry.size / 1024)),
    uploadedBy: by, at: today(),
  })
}

export function attachCount(refId?: string): number {
  if (!refId) return 0
  return getStore().attachments.filter((a) => a.refId === refId).length
}
