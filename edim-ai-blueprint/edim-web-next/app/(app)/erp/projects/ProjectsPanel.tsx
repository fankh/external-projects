'use client'

/** 프로젝트 대장 액션 (N3) — 등록 폼 + 선택 프로젝트 영업단계 전이(낙관적 잠금)·삭제. */
import { useActionState, useState, useTransition } from 'react'
import { Chip } from '@/components/controls'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { checkProjectDuplicate, createProject, deleteProject, setStage, type ActState } from './actions'

export const SALES_STAGES = ['기술 제안', '견적', '협의', '계약', '계약 변경', '종료']

export function ProjectRegForm() {
  const { t } = useI18n()
  const [st, action, pending] = useActionState(createProject, {} as ActState)
  const [dupMsg, setDupMsg] = useState<{ text: string; warn?: boolean } | null>(null)
  const [dupPending, startDup] = useTransition()
  const runDupCheck = (name: string) => startDup(async () => {
    const r = await checkProjectDuplicate(name)
    if (r.error) { setDupMsg({ text: r.error, warn: true }); return }
    setDupMsg(r.dup
      ? { text: `${t('prj.dupFound', '중복 의심')} — ${r.matches!.join(' · ')}`, warn: true }
      : { text: t('prj.dupNone', '중복 없음 ✓') })
  })
  return (
    <RegisterModal trigger={t('prj.addBtn', '＋ 프로젝트 등록')} title={t('prj.regTitle', '프로젝트 등록')} ok={st.ok}>
      {() => (
        <form action={action} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
          <label>{t('prj.name', '프로젝트명')}</label>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input className="in req" name="projectName" id="prj-reg-name" autoFocus style={{ flex: 1 }} />
            <button className="b" type="button" data-prj-dupcheck disabled={dupPending}
              title={t('prj.dupCheckHint', 'S-3-5 중복검토 — 동일/유사 이름 실질의')}
              onClick={() => runDupCheck((document.getElementById('prj-reg-name') as HTMLInputElement)?.value ?? '')}>{t('prj.dupCheck', '중복검토')}</button>
          </div>
          {dupMsg ? (
            <div data-prj-dup-result style={{ gridColumn: '1 / -1', fontSize: 10.5, color: dupMsg.warn ? 'var(--err)' : 'var(--run)' }}>{dupMsg.text}</div>
          ) : null}
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
  // 단계 값(한국어, 서버 저장값) → 로케일 표시
  const stageLabel: Record<string, string> = {
    '기술 제안': t('stage.proposal', '기술 제안'), '견적': t('kind.quote', '견적'), '협의': t('stage.negotiation', '협의'),
    '계약': t('stage.contract', '계약'), '계약 변경': t('stage.contractChange', '계약 변경'), '종료': t('stage.closed', '종료'),
  }
  return (
    <div className="gb" style={{ padding: 8, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('prj.salesStage', '영업 단계')} — {no}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {SALES_STAGES.map((s) => <Chip key={s} tone={s === stage ? 'ok' : 'info'}>{stageLabel[s] ?? s}</Chip>)}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <select className="in" value={next} onChange={(e) => setNext(e.target.value)} style={{ width: 110 }}>
          {SALES_STAGES.map((s) => <option key={s} value={s}>{stageLabel[s] ?? s}</option>)}
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
