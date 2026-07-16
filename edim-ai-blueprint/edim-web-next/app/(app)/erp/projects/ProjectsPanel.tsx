'use client'

/** 프로젝트 대장 액션 (N3) — 등록 폼 + 선택 프로젝트 영업단계 전이(낙관적 잠금)·삭제. */
import { useActionState, useState, useTransition } from 'react'
import { Chip } from '@/components/controls'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { createProject, deleteProject, setStage, type ActState } from './actions'

export const SALES_STAGES = ['기술 제안', '견적', '협의', '계약', '계약 변경', '종료']

export function ProjectRegForm() {
  const { t } = useI18n()
  const [st, action, pending] = useActionState(createProject, {} as ActState)
  return (
    <RegisterModal trigger={t('prj.addBtn', '＋ 프로젝트 등록')} title={t('prj.regTitle', '프로젝트 등록')} ok={st.ok}>
      {() => (
        <form action={action} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
          <label>{t('prj.name', '프로젝트명')}</label>
          <input className="in req" name="projectName" autoFocus />
          <label>{t('prj.type', '유형')}</label>
          <select className="in" name="projectType" defaultValue="Client">
            <option value="Client">Client</option><option value="Stock">Stock</option><option value="R&D">R&D</option>
          </select>
          <label>{t('prj.itemLabel', 'Item')}</label>
          <select className="in" name="item" defaultValue="AHU">
            <option value="AHU">AHU</option><option value="Fan">Fan</option><option value="DUCT">DUCT</option>
          </select>
          <label>{t('prj.client', '고객사')}</label>
          <input className="in req" name="client" />
          <label>{t('prj.clientContact', '고객 담당')}</label>
          <input className="in" name="clientContact" />
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center', marginTop: 4 }}>
            {st.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{st.error}</span> : null}
            <button className="b run" type="submit" disabled={pending}>{t('common.register', '등록')}</button>
          </div>
        </form>
      )}
    </RegisterModal>
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
