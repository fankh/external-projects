import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Card, ScreenHeader } from '@/components/ui'
import { draftApproval } from '@/lib/approvals'
import { registerUpload } from '@/lib/attachments'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { activeCodes, getStore, nextNo } from '@/lib/store'
import type { SrKind } from '@/lib/types'

const KINDS: { kind: SrKind; desc: string }[] = [
  { kind: '시스템개발', desc: '등록 → 심의·결재 → CI 배정 → 개발 → 테스트 → 적용요청 → 반영 → 완료' },
  { kind: '데이터', desc: '데이터 추출·정정 요청 — 등록 → 결재 → CI 배정 → 처리 → 완료' },
  { kind: '계정/권한', desc: '권한 부여·삭제, 계정 초기화·잠금해제' },
]

async function createSr(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/sr/new', 'USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const kind = String(formData.get('kind') ?? '') as SrKind
  const system = String(formData.get('system') ?? '').trim().slice(0, 80)
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const content = String(formData.get('content') ?? '').trim().slice(0, 2000)
  const s = getStore()
  // SR 유형은 공통코드(SR_KIND) 활성 코드만 허용 — 사용중지·기간만료 유형은 신규 신청 불가
  if (!activeCodes(s, 'SR_KIND').includes(kind) || !system || !title) return

  const year = today().slice(0, 4)
  const srNo = nextNo('SR', year, s.srRequests.map((r) => r.srNo))
  // 임시저장 (제품안내서 II장 결재 공통 흐름) — 상신 없이 작성중으로 보관, 신청내역의 '상신' 버튼으로 이어간다
  const isDraft = formData.get('mode') === 'draft'

  s.srRequests.unshift({ srNo, kind, title, system, requester: me.name, dept: me.dept, status: isDraft ? '작성중' : '결재중', requestedAt: today(), content })

  // 첨부 — 본문에 올린 파일이 결재 문서에 그대로 첨부된다 (요구사항: SR신청 추가첨부 없음, 등록 파일 그대로)
  registerUpload(srNo, formData.get('file'), me.name)

  // 폐쇄 루프 — 상신 시 기본 결재선(환경설정)으로 흐르고, 결재자에게 '결재' 할일이 생긴다
  if (!isDraft) draftApproval({ docType: 'SR 신청', title, ref: srNo, drafter: me })

  revalidatePath('/', 'layout')
  redirect(`/sr/requests?q=${encodeURIComponent(srNo)}`)
}

export default async function SrNewPage() {
  await requireMenu('/sr/new')
  const s = getStore()

  return (
    <>
      <ScreenHeader kicker="IT Request" title="SR 신청"
        desc="시스템개발 · 데이터 · 계정/권한 요청을 작성하고 결재 상신한다 — 상신과 동시에 결재함·할일로 연결된다." />

      <Card title="신청서 작성" kicker="New Request">
        <form action={createSr} className="vstack" style={{ maxWidth: 640 }}>
          <div className="hstack">
            <label className="dim" style={{ width: 80, fontSize: 11.5, fontWeight: 600 }}>SR 유형</label>
            <select aria-label="유형" className="select" name="kind" required style={{ flex: 1 }}>
              {activeCodes(s, 'SR_KIND').map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="hstack">
            <label className="dim" style={{ width: 80, fontSize: 11.5, fontWeight: 600 }}>대상 시스템</label>
            <input aria-label="예: 그룹웨어 · ERP · 영업정보시스템" className="input" name="system" required maxLength={80} placeholder="예: 그룹웨어 · ERP · 영업정보시스템" style={{ flex: 1 }} />
          </div>
          <div className="hstack">
            <label className="dim" style={{ width: 80, fontSize: 11.5, fontWeight: 600 }}>제목</label>
            <input aria-label="요청 제목" className="input" name="title" required maxLength={120} placeholder="요청 제목" style={{ flex: 1 }} />
          </div>
          <div className="hstack" style={{ alignItems: 'flex-start' }}>
            <label className="dim" style={{ width: 80, fontSize: 11.5, fontWeight: 600, paddingTop: 6 }}>요청 내용</label>
            <textarea aria-label="배경 · 요구사항 · 기대 결과" className="input" name="content" maxLength={2000} rows={5} placeholder="배경 · 요구사항 · 기대 결과"
              style={{ flex: 1, height: 'auto', padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div className="hstack">
            <label className="dim" style={{ width: 80, fontSize: 11.5, fontWeight: 600 }}>첨부파일</label>
            <input aria-label="첨부파일" className="input" type="file" name="file" style={{ flex: 1, paddingTop: 4 }} />
          </div>
          <div className="dim" style={{ fontSize: 11.5, paddingLeft: 88 }}>
            본문 첨부는 결재 문서에 그대로 첨부된다 (추가 첨부 없음 · 최대 10MB).
          </div>
          <div className="hstack" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" name="mode" value="draft" className="btn">임시저장</button>
            <button type="submit" className="btn pri">결재 상신</button>
          </div>
        </form>
      </Card>

      <Card title="SR 유형별 처리 절차" kicker="Reference" pad={false}>
        <div className="stub-list">
          {KINDS.map((k, i) => (
            <div className="it" key={k.kind}>
              <span className="no">{String(i + 1).padStart(2, '0')}</span>
              <span className="nm">{k.kind}</span>
              <span className="ds">{k.desc}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
