import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Card, ScreenHeader } from '@/components/ui'
import { draftApproval } from '@/lib/approvals'
import { registerUpload } from '@/lib/attachments'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore, nextNo } from '@/lib/store'
import type { SrKind } from '@/lib/types'

const KINDS: { kind: SrKind; desc: string }[] = [
  { kind: '시스템개발', desc: '등록 → 심의·결재 → CI 배정 → 개발 → 테스트 → 적용요청 → 반영 → 완료' },
  { kind: '데이터', desc: '데이터 추출·정정 요청 — 등록 → 결재 → CI 배정 → 처리 → 완료' },
  { kind: '계정/권한', desc: '권한 부여·삭제, 계정 초기화·잠금해제' },
]

async function createSr(formData: FormData) {
  'use server'
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const kind = String(formData.get('kind') ?? '') as SrKind
  const system = String(formData.get('system') ?? '').trim().slice(0, 80)
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const content = String(formData.get('content') ?? '').trim().slice(0, 2000)
  if (!KINDS.some((k) => k.kind === kind) || !system || !title) return

  const s = getStore()
  const year = today().slice(0, 4)
  const srNo = nextNo('SR', year, s.srRequests.map((r) => r.srNo))

  s.srRequests.unshift({ srNo, kind, title, system, requester: me.name, dept: me.dept, status: '결재중', requestedAt: today(), content })

  // 첨부 — 본문에 올린 파일이 결재 문서에 그대로 첨부된다 (요구사항: SR신청 추가첨부 없음, 등록 파일 그대로)
  registerUpload(srNo, formData.get('file'), me.name)

  // 폐쇄 루프 — 신청과 동시에 기본 결재선(환경설정)으로 상신되고, 결재자에게 '결재' 할일이 생긴다
  draftApproval({ docType: 'SR 신청', title, ref: srNo, drafter: me })

  revalidatePath('/', 'layout')
  redirect(`/sr/requests?q=${encodeURIComponent(srNo)}`)
}

export default async function SrNewPage() {
  await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')

  return (
    <>
      <ScreenHeader kicker="IT Request" title="SR 신청"
        desc="시스템개발 · 데이터 · 계정/권한 요청을 작성하고 결재 상신한다 — 상신과 동시에 결재함·할일로 연결된다." />

      <Card title="신청서 작성" kicker="New Request">
        <form action={createSr} className="vstack" style={{ maxWidth: 640 }}>
          <div className="hstack">
            <label className="dim" style={{ width: 80, fontSize: 11.5, fontWeight: 600 }}>SR 유형</label>
            <select className="select" name="kind" required style={{ flex: 1 }}>
              {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.kind}</option>)}
            </select>
          </div>
          <div className="hstack">
            <label className="dim" style={{ width: 80, fontSize: 11.5, fontWeight: 600 }}>대상 시스템</label>
            <input className="input" name="system" required maxLength={80} placeholder="예: 그룹웨어 · ERP · 영업정보시스템" style={{ flex: 1 }} />
          </div>
          <div className="hstack">
            <label className="dim" style={{ width: 80, fontSize: 11.5, fontWeight: 600 }}>제목</label>
            <input className="input" name="title" required maxLength={120} placeholder="요청 제목" style={{ flex: 1 }} />
          </div>
          <div className="hstack" style={{ alignItems: 'flex-start' }}>
            <label className="dim" style={{ width: 80, fontSize: 11.5, fontWeight: 600, paddingTop: 6 }}>요청 내용</label>
            <textarea className="input" name="content" maxLength={2000} rows={5} placeholder="배경 · 요구사항 · 기대 결과"
              style={{ flex: 1, height: 'auto', padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div className="hstack">
            <label className="dim" style={{ width: 80, fontSize: 11.5, fontWeight: 600 }}>첨부파일</label>
            <input className="input" type="file" name="file" style={{ flex: 1, paddingTop: 4 }} />
          </div>
          <div className="dim" style={{ fontSize: 11.5, paddingLeft: 88 }}>
            본문 첨부는 결재 문서에 그대로 첨부된다 (추가 첨부 없음 · 최대 10MB).
          </div>
          <div className="hstack" style={{ justifyContent: 'flex-end' }}>
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
