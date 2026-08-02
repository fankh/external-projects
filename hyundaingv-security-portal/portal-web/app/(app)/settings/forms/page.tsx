import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore } from '@/lib/store'
import type { ApprovalDocType } from '@/lib/types'

const DOC_TYPES: (ApprovalDocType | '공통')[] = [
  '장애보고 상신', '변경계획 상신', '변경결과 상신', '투자 정산품의', '비용 정산품의',
  'SR 신청', '점검결과 상신', '출력물폐기 상신', '보안위반 확인서', '서약 현황 상신', '공통',
]

async function addTemplate(formData: FormData) {
  'use server'
  await requireRole('ADMIN')
  const name = String(formData.get('name') ?? '').trim().slice(0, 120)
  const docType = String(formData.get('docType') ?? '') as ApprovalDocType | '공통'
  if (!name || !DOC_TYPES.includes(docType)) return
  const s = getStore()
  const max = s.excelTemplates.reduce((m, t) => Math.max(m, Number(t.id.replace('XT-', '')) || 0), 0)
  s.excelTemplates.unshift({ id: `XT-${String(max + 1).padStart(2, '0')}`, name, docType, version: 1, uploadedAt: today() })
  revalidatePath('/settings/forms')
}

async function reupload(formData: FormData) {
  'use server'
  await requireRole('ADMIN')
  const s = getStore()
  const t = s.excelTemplates.find((x) => x.id === String(formData.get('id') ?? ''))
  if (!t) return
  t.version += 1
  t.uploadedAt = today()
  revalidatePath('/settings/forms')
}

export default async function FormsPage() {
  await requireRole('ADMIN')
  const s = getStore()

  return (
    <>
      <ScreenHeader kicker="환경설정" title="엑셀양식 관리"
        desc="결재 자동첨부·출력에 쓰는 엑셀 양식을 문서 유형에 매핑하고 버전을 관리한다." />

      <div className="stat-row">
        <Stat value={s.excelTemplates.length} label="등록 양식" />
        <Stat value={new Set(s.excelTemplates.map((t) => t.docType)).size} label="매핑 문서 유형" />
      </div>

      <Card title="양식 등록" kicker="Upload">
        <form action={addTemplate} className="hstack">
          <input className="input" name="name" required maxLength={120} placeholder="양식명 (예: 장애보고 취합 양식)" style={{ flex: 1 }} />
          <select className="select" name="docType">
            {DOC_TYPES.map((d) => <option key={d}>{d}</option>)}
          </select>
          <button type="submit" className="btn pri">등록 (v1)</button>
        </form>
      </Card>

      <Card title="양식 목록" kicker="Templates" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>번호</th><th>양식명</th><th>매핑 문서 유형</th><th className="num">버전</th><th>업로드일</th><th className="c">재업로드</th></tr>
            </thead>
            <tbody>
              {s.excelTemplates.map((t) => (
                <tr key={t.id}>
                  <td className="code">{t.id}</td>
                  <td className="strong">{t.name} <span className="mut">.xlsx</span></td>
                  <td><Chip tone={t.docType === '공통' ? 'neutral' : 'info'} bare>{t.docType}</Chip></td>
                  <td className="num">v{t.version}</td>
                  <td className="tnum">{t.uploadedAt}</td>
                  <td className="c">
                    <form action={reupload} style={{ display: 'inline' }}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="btn sm">새 버전 업로드</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="callout">
        <b>자동첨부</b> — 장애보고·변경관리 상신은 매핑된 양식이 결재 문서에 자동첨부된다
        (결재 시트 8·9·10번). 실서비스에서는 파일 저장소 연동으로 대체된다.
      </div>
    </>
  )
}
