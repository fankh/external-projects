import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount, registerUpload } from '@/lib/attachments'
import { audit } from '@/lib/audit'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore } from '@/lib/store'
import type { ApprovalDocType } from '@/lib/types'

const DOC_TYPES: (ApprovalDocType | '공통')[] = [
  '장애보고 상신', '변경계획 상신', '변경결과 상신', '투자 정산품의', '비용 정산품의',
  'SR 신청', '점검결과 상신', '출력물폐기 상신', '보안위반 확인서', '서약 현황 상신', '공통',
]

async function addTemplate(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/forms', 'ADMIN')
  const name = String(formData.get('name') ?? '').trim().slice(0, 120)
  const docType = String(formData.get('docType') ?? '') as ApprovalDocType | '공통'
  if (!name || !DOC_TYPES.includes(docType)) return
  const s = getStore()
  const max = s.excelTemplates.reduce((m, t) => Math.max(m, Number(t.id.replace('XT-', '')) || 0), 0)
  const id = `XT-${String(max + 1).padStart(2, '0')}`
  s.excelTemplates.unshift({ id, name, docType, version: 1, uploadedAt: today() })
  // 실제 양식 파일을 받아 양식 번호(pk)로 첨부한다 — 버전 이력이 파일과 함께 남는다
  registerUpload(id, formData.get('file'), me.name)
  audit(me.name, '엑셀양식 변경', `${id} 신규 등록 — ${name} (${docType})`)
  revalidatePath('/settings/forms')
}

async function reupload(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/settings/forms', 'ADMIN')
  const file = formData.get('file')
  // 파일 없는 버전 올림 금지 — '새 버전 업로드'는 실제 양식 파일 교체다
  if (!(file instanceof File) || file.size === 0) return
  const s = getStore()
  const t = s.excelTemplates.find((x) => x.id === String(formData.get('id') ?? ''))
  if (!t) return
  // 파일이 실제로 등록됐을 때만 버전을 올린다 (F6) — 크기 초과 등으로 드롭되면 무동작
  if (!registerUpload(t.id, file, me.name)) return
  t.version += 1
  t.uploadedAt = today()
  audit(me.name, '엑셀양식 변경', `${t.id} v${t.version} 업로드 — ${t.name}`)
  revalidatePath('/settings/forms')
}

export default async function FormsPage() {
  await requireMenu('/settings/forms')
  const s = getStore()

  return (
    <>
      <ScreenHeader kicker="환경설정" title="엑셀양식 관리"
        desc="문서 유형별 엑셀 양식과 버전" />

      <div className="stat-row">
        <Stat value={s.excelTemplates.length} label="등록 양식" />
        <Stat value={new Set(s.excelTemplates.map((t) => t.docType)).size} label="매핑 문서 유형" />
      </div>

      <Card title="양식 등록">
        <form action={addTemplate} className="hstack">
          <input aria-label="양식명" className="input" name="name" required maxLength={120} placeholder="양식명 (예: 장애보고 취합 양식)" style={{ flex: 1 }} />
          <select aria-label="문서 유형" className="select" name="docType">
            {DOC_TYPES.map((d) => <option key={d}>{d}</option>)}
          </select>
          <input className="input" type="file" name="file" style={{ width: 170, paddingTop: 4 }} title="양식 파일 (xlsx)" />
          <button type="submit" className="btn pri">등록 (v1)</button>
        </form>
      </Card>

      <Card title="양식 목록" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>번호</th><th>양식명</th><th>매핑 문서 유형</th><th className="num">버전</th><th>업로드일</th><th className="c">재업로드</th></tr>
            </thead>
            <tbody>
              {s.excelTemplates.map((t) => (
                <tr key={t.id}>
                  <td className="code">{t.id}</td>
                  <td className="strong">{t.name} <span className="mut">.xlsx</span><Clip count={attachCount(t.id)} title="양식 파일 버전 이력" /></td>
                  <td><Chip tone={t.docType === '공통' ? 'neutral' : 'info'} bare>{t.docType}</Chip></td>
                  <td className="num">v{t.version}</td>
                  <td className="tnum">{t.uploadedAt}</td>
                  <td className="c">
                    <form action={reupload} className="hstack" style={{ justifyContent: 'center', padding: '3px 0' }}>
                      <input type="hidden" name="id" value={t.id} />
                      <input className="input" type="file" name="file" required style={{ height: 25, fontSize: 11, width: 150, paddingTop: 2 }} title="새 버전 양식 파일" />
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
