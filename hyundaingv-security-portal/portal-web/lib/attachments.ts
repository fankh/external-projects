/** 공통 첨부 처리 — 폼의 File 을 검증하고 메타데이터를 스토어에 등록한다.
 *  크기 상한·파일명 정제는 서버에서 재검증한다(시큐어 코딩). */
import { today } from './dates'
import { getStore, nextNo } from './store'

const MAX_SIZE_KB = 10 * 1024

export function registerUpload(refId: string, entry: FormDataEntryValue | null, by: string): boolean {
  if (!(entry instanceof File) || entry.size === 0) return false
  if (entry.size > MAX_SIZE_KB * 1024) return false
  const s = getStore()
  const name = entry.name.replace(/[\\/]/g, '_').slice(0, 120)
  s.attachments.push({
    id: nextNo('AT', today().slice(0, 4), s.attachments.map((a) => a.id)),
    refId, name, sizeKb: Math.max(1, Math.ceil(entry.size / 1024)),
    uploadedBy: by, at: today(),
  })
  return true
}

/** 결재 자동첨부 — 문서 유형에 매핑된 엑셀양식(환경설정 > 엑셀양식 관리)으로 첨부를 생성한다
 *  (요구사항 결재 시트 8~10번 '첨부파일자동생성 o'). 유형 매핑이 없으면 '공통' 양식으로
 *  폴백하고, 같은 참조에 같은 양식 파일이 이미 있으면 중복 생성하지 않는다. */
export function registerGenerated(refId: string, docType: string, by: string): void {
  const s = getStore()
  const t = s.excelTemplates.find((x) => x.docType === docType) ?? s.excelTemplates.find((x) => x.docType === '공통')
  if (!t) return
  const prefix = `${t.name}_v${t.version}_`
  const name = `${prefix}${today()}.xlsx`
  // 같은 참조에 같은 양식(이름·버전)이 이미 있으면 재생성하지 않는다 — 날짜를 뺀 접두로 비교해, 반려·회수
  // 후 다른 날 재상신해도 자동첨부가 중복 누적되지 않게 한다(기존엔 파일명에 today() 가 들어가 당일만 방어).
  // 양식 버전이 올라가면 접두가 달라져 새 양식은 정상적으로 재생성된다.
  // gen 플래그로 '이전에 생성한 양식'만 중복 판정 대상으로 삼는다 — 사용자 업로드(registerUpload, gen 미설정)가
  // 우연/고의로 양식 접두와 같은 파일명을 가져도(같은 refId 에 먼저 등록되면) 필수 자동양식 생성을 가로막지
  // 못하게 한다(예: 변경결과 submitResult 는 registerUpload 후 registerGenerated 순서라 우회 가능했음).
  if (s.attachments.some((a) => a.refId === refId && a.gen && a.name.startsWith(prefix))) return
  s.attachments.push({
    id: nextNo('AT', today().slice(0, 4), s.attachments.map((a) => a.id)),
    refId, name, sizeKb: 12, uploadedBy: by, at: today(), gen: true,
  })
}

export function attachCount(refId?: string): number {
  if (!refId) return 0
  return getStore().attachments.filter((a) => a.refId === refId).length
}
