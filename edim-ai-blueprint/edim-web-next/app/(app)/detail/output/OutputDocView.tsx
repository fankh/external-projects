'use client'

import { useState, useTransition } from 'react'
import { Btn, Chip, GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { openRenderedPdf } from '@/lib/pdf'
import { advanceStatus } from './actions'

const DOC_STAGES = ['Set-up', 'Check', 'Approve', 'Accepted']
const BACKEND_STATUS = ['SET_UP', 'CHECK', 'APPROVE', 'ACCEPTED']

export function OutputDocView({ file, folder, fileType, docNo, initialStage }: { file: string; folder: string; fileType: string; docNo: string | null; initialStage: number }) {
  const { t } = useI18n()
  const [stageIdx, setStageIdx] = useState(initialStage)
  const [status, setStatus] = useState<{ text: string; err?: boolean } | null>(null)
  const [pending, start] = useTransition()
  const say = (text: string, err = false) => setStatus({ text, err })

  const renderDoc = (print: boolean) => void openRenderedPdf(`${file} — 산출물 문서`, [
    `Doc No: ${docNo ?? '(채번 대기)'}`, `폴더: ${folder} · 유형: ${fileType}`,
    `상태: ${DOC_STAGES[stageIdx]}`, 'Grade M — Management (워터마크 강제)', 'EDIM Run 산출 정본 — doc_control 통제 문서',
  ], { subtitle: 'EDIM 산출물 문서 상세', confidential: true })
    .then((ok) => say(ok ? `${print ? 'Print' : '미리보기'} ✓ — 워터마크 실렌더 (Grade M · reportlab)` : '렌더 불가 — 백엔드 연결 필요', !ok))

  const requestApproval = () => {
    const nextIdx = Math.min(stageIdx + 1, DOC_STAGES.length - 1)
    if (nextIdx === stageIdx) return
    if (!docNo) { setStageIdx(nextIdx); return }
    start(async () => {
      const r = await advanceStatus(docNo, BACKEND_STATUS[nextIdx])
      if (r.error) { say(r.error, true); return }
      setStageIdx(nextIdx); say(`상태 전이 ✓ — ${docNo} → ${DOC_STAGES[nextIdx]} (doc_control 영속)`)
    })
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ gap: 6 }}>
        <label style={{ fontSize: 11 }}>Doc No</label>
        <input className="in ro" style={{ width: 160, fontFamily: 'Consolas, monospace' }} value={docNo ?? t('detail.allocFail', '채번 실패')} readOnly aria-label="Doc No" />
        <Chip tone={docNo ? 'ok' : 'warn'}>{docNo ? t('detail.autoAlloc', '자동 채번') : t('detail.needBackend', '백엔드 필요')}</Chip>
        <Chip tone="warn">Grade M — Management</Chip>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => renderDoc(false)}>{t('common.preview', '미리보기')}</Btn>
        <Btn onClick={() => renderDoc(true)}>🖨 Print</Btn>
        <Btn variant="pri" onClick={requestApproval} disabled={pending || stageIdx >= DOC_STAGES.length - 1}>{t('common.requestApproval', '승인 요청')}</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ flex: 1, gap: 6 }}>
          <GroupBox title={t('detail.docInfo', '문서 정보')}>
            <div style={{ fontSize: 11, lineHeight: 2, padding: 4 }}>
              <div>{t('detail.fileLabel', '파일')} <b>{file}</b></div><div>{t('run.folder', '폴더')} <b>{folder}</b> · {t('detail.typeLabel', '유형')} <b>{fileType}</b></div>
            </div>
          </GroupBox>
          <GroupBox title={`${t('detail.statusFlow', '상태 흐름')} (doc_control)`}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8 }}>
              {DOC_STAGES.map((s, i) => (
                <span key={s} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ padding: '6px 12px', borderRadius: 3, fontSize: 11, fontWeight: i === stageIdx ? 700 : 400, border: `1.5px solid ${i <= stageIdx ? 'var(--run)' : 'var(--line)'}`, background: i === stageIdx ? '#EDF7F1' : i < stageIdx ? '#F3F7FC' : '#fff', color: i <= stageIdx ? 'var(--run)' : 'var(--txt-mute)' }}>{s}</span>
                  {i < DOC_STAGES.length - 1 ? <span style={{ color: 'var(--txt-mute)' }}>→</span> : null}
                </span>
              ))}
            </div>
          </GroupBox>
          {status ? <div style={{ fontSize: 11, color: status.err ? 'var(--err)' : 'var(--run)' }}>{status.text}</div> : null}
        </div>
      </div>
    </div>
  )
}
