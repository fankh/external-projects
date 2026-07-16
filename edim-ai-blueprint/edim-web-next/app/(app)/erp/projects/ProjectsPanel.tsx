'use client'

/** 프로젝트 대장 액션 (N3) — 등록 폼 + 선택 프로젝트 영업단계 전이(낙관적 잠금)·삭제. */
import { useActionState, useState, useTransition } from 'react'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { createProject, deleteProject, setStage, type ActState } from './actions'

export const SALES_STAGES = ['기술 제안', '견적', '협의', '계약', '계약 변경', '종료']

export function ProjectRegForm() {
  const { t } = useI18n()
  const [st, action, pending] = useActionState(createProject, {} as ActState)
  return (
    <form action={action} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <input className="in req" name="projectName" placeholder={t('prj.name', '프로젝트명')} style={{ width: 160 }} />
      <select className="in" name="projectType" defaultValue="신규" style={{ width: 70 }}>
        <option value="신규">신규</option><option value="변경">변경</option><option value="AS">AS</option>
      </select>
      <input className="in" name="item" placeholder={t('prj.itemPh', 'Item (AHU 등)')} style={{ width: 100 }} />
      <input className="in req" name="client" placeholder={t('prj.client', '고객사')} style={{ width: 110 }} />
      <input className="in" name="clientContact" placeholder={t('prj.clientContact', '고객 담당')} style={{ width: 90 }} />
      <button className="b run" type="submit" disabled={pending}>{t('prj.addBtn', '＋ 프로젝트 등록')}</button>
      {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
      {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
    </form>
  )
}

export function ProjectStagePanel({ no, stage, updatedAt }: { no: string; stage: string; updatedAt: string }) {
  const { t } = useI18n()
  const [next, setNext] = useState(stage)
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  return (
    <div className="gb" style={{ padding: 8, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('prj.salesStage', '영업 단계')} — {no}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {SALES_STAGES.map((s) => <Chip key={s} tone={s === stage ? 'ok' : 'info'}>{s}</Chip>)}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <select className="in" value={next} onChange={(e) => setNext(e.target.value)} style={{ width: 110 }}>
          {SALES_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="b run" disabled={pending || next === stage} onClick={() => start(async () => {
          setSt(await setStage(no, next, updatedAt))   // baseUpdatedAt — 동시편집 시 409 정직 표시
        })}>{t('prj.saveStage', '단계 저장')}</button>
        <button className="b" disabled={pending} onClick={() => start(async () => {
          if (confirm(`${no} 를 삭제하시겠습니까? (기술 제안·무참조만 가능)`)) setSt(await deleteProject(no))
        })}>{t('common.delete', '삭제')}</button>
      </div>
      {st.error ? <div style={{ color: 'var(--err)' }}>{st.error}</div> : null}
      {st.ok ? <div style={{ color: 'var(--run)' }}>{st.ok}</div> : null}
    </div>
  )
}
