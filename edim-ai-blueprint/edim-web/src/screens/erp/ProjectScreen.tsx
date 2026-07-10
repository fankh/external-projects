/** S-3-5 ERP Project 등록·관리 (W-09, 슬라이드 4·52) — PS 자동 채번 ·
 *  영업 단계 상태기계 · 접수 자료 등록. */
import { useEffect, useMemo, useState } from 'react'
import {
  PROJECT, RECEIVED_FILES, SALES_STAGES, type ReceivedFile,
} from '../../api/mock/dataErp'
import { projectService } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

let fileSeq = 1

// 영업 단계 표시 번역 키 — 내부 값(상태기계 전이)은 한글 원문 유지
const STAGE_KEYS: Record<string, string> = {
  '기술 제안': 'prj.stageTechProposal', '견적': 'prj.stageQuote', '협의': 'prj.stageNegotiation',
  '계약': 'prj.stageContract', '계약 변경': 'prj.stageContractChange', '종료': 'prj.stageClosed',
}

export function ProjectScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [stage, setStage] = useState(PROJECT.stage)
  const [client, setClient] = useState(PROJECT.client)
  const [files, setFiles] = useState<ReceivedFile[]>(RECEIVED_FILES)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    // prj_project 실 조회 — 저장된 영업 단계 복원
    void projectService.get(PROJECT.projectNo).then((p) => setStage(p.stage))
  }, [])

  const save = () => {
    void (async () => {
      await projectService.setStage(PROJECT.projectNo, stage)
      setDirty(false)
      shell.setStatusMsg(`저장 — ${PROJECT.projectNo} · sales_stage=[${stage}] 전이 + 이력 (SYS-017)`)
    })()
  }

  useFKeys(active, useMemo(() => ({ F12: save }), [stage])) // eslint-disable-line react-hooks/exhaustive-deps

  const upload = () => {
    setFiles((prev) => [...prev, {
      name: `추가자료_${fileSeq++}.pdf`, fileType: 'PDF',
      registrant: 'YS.Gang', date: '2026-07-09',
    }])
    shell.setStatusMsg('접수 자료 업로드 — Project Folder RECEIVED 저장')
  }

  const stageLabel = (s: string) => (STAGE_KEYS[s] ? t(STAGE_KEYS[s], s) : s)

  const fileCols: GridColumn<ReceivedFile>[] = [
    { key: 'name', header: t('prj.fileName', '파일명'), render: (r) => r.name },
    { key: 'type', header: t('prj.fileType', '유형'), width: 48, align: 'center', render: (r) => r.fileType },
    { key: 'reg', header: t('prj.registrant', '등록자'), width: 64, align: 'center', render: (r) => r.registrant },
    { key: 'date', header: t('prj.date', '일자'), width: 80, align: 'center', render: (r) => r.date },
    {
      key: 'act', header: '', width: 60, align: 'center',
      render: () => <span className="b" style={{ height: 18, fontSize: 10 }}>{t('common.preview', '미리보기')}</span>,
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Project No.</label>
        <input className="in ro" style={{ width: 100, fontFamily: 'Consolas, monospace' }}
          value={PROJECT.projectNo} readOnly aria-label="Project No" />
        <Chip tone="info">{t('prj.autoNumber', '자동 채번 (PS-)')}</Chip>
        <label>{t('prj.salesStage', '영업 단계')}<i>*</i></label>
        <Combo width={100} value={stage}
          options={SALES_STAGES.map((s) => ({ value: s, label: stageLabel(s) }))}
          onChange={(v) => { setStage(v); setDirty(true) }} />
        <label>Type</label>
        <Combo width={80} value={PROJECT.projectType} options={['Client', 'Stock', 'R&D']} />
        <label>Item</label>
        <Combo width={72} value={PROJECT.item} options={['AHU', 'Fan', 'DUCT']} />
        <span style={{ flex: 1 }} />
        {dirty ? <Chip tone="warn">{t('prj.unsaved', '미저장')}</Chip> : null}
        <Btn variant="pri" onClick={save}>{t('prj.saveF12', '저장 F12')}</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
          <GroupBox title={`Project — ${PROJECT.projectNo}`} right={<Chip tone="warn">{t('prj.approvalWaiting', 'Approval ☑ 대기')}</Chip>}>
            <div className="frm">
              <label>Client<i>*</i></label>
              <input className="in req" value={client} aria-label="Client"
                onChange={(e) => { setClient(e.target.value); setDirty(true) }} />
              <label>{t('prj.registeredAt', '등록일')}</label>
              <input className="in ro" value={PROJECT.registeredAt} readOnly aria-label="등록일" />
              <label>{t('prj.clientContact', 'Client 담당자')}</label>
              <input className="in" defaultValue={PROJECT.clientContact} aria-label="Client 담당자"
                onChange={() => setDirty(true)} />
              <label>{t('prj.owner', '담당자')}<i>*</i></label>
              <Combo value={PROJECT.owner} options={['YKK', 'YS.Gang', 'Kim']} />
              <label>Document Code</label>
              <input className="in ro" value={PROJECT.documentCode} readOnly
                style={{ fontFamily: 'Consolas, monospace' }} aria-label="Document Code" />
              <label>Remarks</label>
              <input className="in" aria-label="Remarks" onChange={() => setDirty(true)} />
            </div>
            <div style={{ marginTop: 6 }} className="frm c2">
              <label>{t('prj.requirements', '요구사항·Pain Point')}</label>
              <input className="in" style={{ height: 34 }} aria-label="요구사항"
                defaultValue="고효율 · 저소음 우선, 8월 말 납기" onChange={() => setDirty(true)} />
            </div>
          </GroupBox>
          <GroupBox title={t('prj.stageHistory', '영업 단계 — 변경 이력 기록')}>
            <div className="flow">
              {SALES_STAGES.map((s, i) => {
                const cur = SALES_STAGES.indexOf(stage)
                const cls = i < cur ? 'fs done' : i === cur ? 'fs now' : 'fs'
                return (
                  <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span className={cls} style={{ cursor: 'pointer' }}
                      onClick={() => { setStage(s); setDirty(true) }}>{stageLabel(s)}</span>
                    {i < SALES_STAGES.length - 1 ? <span className="ar">→</span> : null}
                  </span>
                )
              })}
            </div>
            <div style={{ fontSize: 10, color: 'var(--txt-mute)', marginTop: 4 }}>
              {t('prj.stageHint', 'PS 시작 → 이후 PCR→QCR→OR 프로세스 상태기계 연결 (ERP-001/002)')}
            </div>
          </GroupBox>
          <GroupBox title={t('prj.receivedFiles', '접수 자료 등록 (File)')} style={{ flex: 1 }} noPad
            right={<Btn style={{ height: 18, fontSize: 10 }} onClick={upload}>{t('prj.addUpload', '＋ 업로드')}</Btn>}>
            <DenseGrid columns={fileCols} rows={files} rowKey={(r) => r.name} />
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 290, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="Data Up-Load">
            <div className="frm c2">
              <label>Department</label>
              <Combo value="Engineering" options={['Engineering', 'Sales']} />
              <label>Type</label>
              <Combo value="Data" options={['Data', 'File', 'Image']} />
              <label>Name</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input className="in" defaultValue="KDCR 3-13" aria-label="Upload Name" />
                <Btn onClick={() => shell.setStatusMsg('중복 없음 ✓')}>{t('prj.dupCheck', '중복검토')}</Btn>
              </div>
            </div>
          </GroupBox>
          <GroupBox title="Table" noPad
            right={<span className="b" style={{ height: 18, fontSize: 10 }}>＋ ✎ ⬇</span>}>
            <table className="g">
              <thead><tr><th>Item</th><th>A</th><th>C</th><th>E</th></tr></thead>
              <tbody>
                <tr><td className="code">560</td><td className="num"></td><td className="num">45</td><td className="num">656</td></tr>
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title={t('prj.printSetup', 'Print 설정')}>
            <Btn onClick={() => shell.setStatusMsg('Print Set-up 호출 (S-3-4) — 예정 화면')}>
              {t('prj.printSetupCall', '🖨 Print Set-up 호출')}
            </Btn>
          </GroupBox>
          <GroupBox title={t('prj.todoTitle', 'To-do (본인 담당 프로세스)')} noPad>
            <table className="g">
              <thead><tr><th>Item</th><th>Doc.No</th><th>Task</th><th>{t('prj.status', '상태')}</th></tr></thead>
              <tbody>
                <tr>
                  <td>Sale</td><td className="code">PS-612-2</td><td>Approval</td>
                  <td className="c"><Chip tone="warn">Check</Chip></td>
                </tr>
              </tbody>
            </table>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
