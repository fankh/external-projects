/** S-3-4 Print Set-up (W-18, 슬라이드 50) — 양식 캔버스에 [Data]/[그래프]/[Table]
 *  자리표시자 배치 · 워터마크 · 출력 설정 · DRAFT→승인→게시 (CPQ-013, SVC-11).
 *  F4 — 캔버스 = 상태 기반 위젯 목록: 기본 양식 배치(리셋)·Data 호출·그래프 불러오기(추가)·
 *  Data 위치 지정(선택 위젯 경로 바인딩)·Printer/PDF 실렌더 (Office 는 P4-1 대기 — 정직 표기). */
import { useState } from 'react'
import { approvalService, renderService } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { useI18n } from '../../i18n/I18nContext'
import { useEscapeClose } from '../../shell/useEscapeClose'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

const FORMS = ['Technical Report', '견적서 (CLT)', '작업지시서', '검사성적서']

interface FormBox {
  id: number
  label: string
  x: number; y: number; w: number; h: number
  dashed?: boolean
}

const DEFAULT_BOXES: FormBox[] = [
  { id: 1, label: '머리글 — 로고 · Title · DOC No.', x: 40, y: 16, w: 480, h: 36, dashed: true },
  { id: 2, label: '[Data:customer] Customer·Date·담당', x: 40, y: 66, w: 220, h: 52 },
  { id: 3, label: '[Data:input] Input Value·Result', x: 280, y: 66, w: 240, h: 52 },
  { id: 4, label: '[그래프:performance] 성능 곡선', x: 40, y: 132, w: 280, h: 140 },
  { id: 5, label: '[Table:tech] 기술 Data', x: 340, y: 132, w: 180, h: 140 },
  { id: 6, label: '바닥글 — 페이지 · 회사 정보', x: 40, y: 288, w: 480, h: 24, dashed: true },
]

let boxSeq = 100

export function PrintSetupScreen(_props: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [form, setForm] = useState(FORMS[0])
  // 내부 값(form 상태·렌더 파라미터)은 한국어 원문 유지 — 표시만 번역
  const formOptions = [
    'Technical Report',
    { value: '견적서 (CLT)', label: t('printsetup.quoteForm', '견적서 (CLT)') },
    { value: '작업지시서', label: t('printsetup.workOrder', '작업지시서') },
    { value: '검사성적서', label: t('printsetup.inspectReport', '검사성적서') },
  ]
  const [watermark, setWatermark] = useState(true)
  const [status, setStatus] = useState<'DRAFT' | 'PENDING'>('DRAFT')
  const [boxes, setBoxes] = useState<FormBox[]>(DEFAULT_BOXES)
  const [selBox, setSelBox] = useState<number | null>(2)
  const [showBind, setShowBind] = useState(false)
  const [bindPath, setBindPath] = useState('project.no')
  useEscapeClose(showBind, () => setShowBind(false))

  // 현재 배치 → 렌더 라인 (Print Test·Printer·PDF 공용 — 배치가 실제 출력을 결정)
  const renderLines = () => [
    ...boxes.map((b) => `${b.label}`),
    '',
    `머리글·바닥글: 표준 Templet · 워터마크: ${watermark ? 'CONFIDENTIAL' : '없음'}`,
    '게시 후 SVC-11 이 실데이터로 치환 렌더한다 (CPQ-013).',
  ]

  const render = (label: string, open: 'window' | 'download') => {
    void renderService.pdf(`${form} — ${label}`, renderLines(),
      { subtitle: `Print Set-up ${label} (S-3-4)`, confidential: watermark })
      .then((url) => {
        if (!url) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>렌더 불가 — 백엔드 연결 필요</span>)
          return
        }
        if (open === 'window') {
          window.open(url, '_blank')
          shell.setStatusMsg(`${label} ✓ — ${form} 실렌더 (워터마크 ${watermark ? 'ON' : 'OFF'})`)
        } else {
          const a = document.createElement('a')
          a.href = url
          a.download = `${form}.pdf`
          a.click()
          shell.setStatusMsg(`PDF 다운로드 ✓ — ${form}.pdf (${boxes.length} 위젯)`)
        }
      })
  }

  const addBox = (label: string, w: number, h: number) => {
    const id = boxSeq++
    setBoxes((prev) => [...prev, {
      id, label, w, h,
      x: 40 + ((prev.length * 24) % 200), y: 66 + ((prev.length * 18) % 180),
    }])
    setSelBox(id)
    setStatus('DRAFT')
  }

  const selected = boxes.find((b) => b.id === selBox) ?? null

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Print Form</label>
        <Combo width={140} value={form} options={formOptions} onChange={(v) => { setForm(v); setStatus('DRAFT') }} />
        <span className="sep" />
        <Btn onClick={() => {
          // F4 — 선택 위젯에 데이터 경로 바인딩 (다이얼로그)
          if (!selected) {
            shell.setStatusMsg(t('printsetup.bindNeedSel', 'Data 위치 지정 — 캔버스에서 위젯을 먼저 선택하십시오'))
            return
          }
          setShowBind(true)
        }}>{t('printsetup.dataBind', 'Data 위치 지정')}</Btn>
        <Btn variant={watermark ? 'pri' : 'default'} onClick={() => setWatermark(!watermark)}>
          {t('printsetup.watermark', '워터마크')} {watermark ? 'ON' : 'OFF'}
        </Btn>
        <span style={{ flex: 1 }} />
        <Btn variant="run" onClick={() => render('Print Test', 'window')}>
          Print Test
        </Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 4 }}>
          <div className="cvs" style={{ flex: 1, minHeight: 340, background: '#fff' }}
            onClick={() => setSelBox(null)}>
            {boxes.map((b) => (
              <div key={b.id} className={`m2 ${selBox === b.id ? 'sel' : ''}`}
                data-formbox={b.id}
                style={{
                  left: b.x, top: b.y, width: b.w, height: b.h,
                  ...(b.dashed ? { borderStyle: 'dashed' } : {}), cursor: 'pointer',
                }}
                onClick={(e) => { e.stopPropagation(); setSelBox(b.id) }}>
                {b.label}
              </div>
            ))}
            {watermark ? (
              <div style={{
                position: 'absolute', left: 170, top: 160, fontSize: 28, fontWeight: 800,
                color: 'rgba(179,55,47,.13)', transform: 'rotate(-20deg)', pointerEvents: 'none',
              }}>CONFIDENTIAL</div>
            ) : null}
          </div>
          <div style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
            {t('printsetup.flowHint', '자리표시자 배치 → 데이터 경로 바인딩 → 게시된 Form 은 SVC-11 이 렌더 (견적서·PCR·작업지시서 공통)')}
          </div>
        </div>
        <div className="split-h" />
        <div className="side-scroll" style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GroupBox title={t('printsetup.outputSettings', '출력 설정')}>
            <div className="frm c2">
              <label>Type of File</label>
              <Combo value="PDF" options={['PDF', 'XLSX', 'DOCX']} />
              <label>{t('printsetup.paper', '용지')}</label>
              <Combo value="A4 세로" options={[
                { value: 'A4 세로', label: t('printsetup.a4Portrait', 'A4 세로') },
                { value: 'A4 가로', label: t('printsetup.a4Landscape', 'A4 가로') },
                'A3',
              ]} />
              <label>{t('printsetup.color', '색상')}</label>
              <Combo value="칼라" options={[
                { value: '칼라', label: t('printsetup.colorOpt', '칼라') },
                { value: '흑백', label: t('printsetup.monoOpt', '흑백') },
              ]} />
              <label>{t('printsetup.fontSize', 'Font / 크기')}</label>
              <Combo value="Pretendard 10" options={['Pretendard 10', 'Malgun 10']} />
              <label>{t('printsetup.margin', '여백')}</label>
              <input className="in" defaultValue="15/15/20/20 mm" aria-label="여백" />
              <label>{t('printsetup.headerFooter', '머리글·바닥글')}</label>
              <Combo value="표준 Templet" options={[
                { value: '표준 Templet', label: t('printsetup.stdTemplet', '표준 Templet') },
                { value: '없음', label: t('printsetup.none', '없음') },
              ]} />
              <label>{t('printsetup.watermark', '워터마크')}</label>
              <Combo value={watermark ? 'CONFIDENTIAL' : '없음'}
                options={['CONFIDENTIAL', { value: '없음', label: t('printsetup.none', '없음') }]}
                onChange={(v) => setWatermark(v !== '없음')} />
            </div>
          </GroupBox>
          <GroupBox title="Call Form">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Btn onClick={() => {
                // F4 — 기본 6위젯 배치로 리셋
                setBoxes(DEFAULT_BOXES)
                setSelBox(2)
                setStatus('DRAFT')
                shell.setStatusMsg(t('printsetup.defaultDone', '기본 양식 배치 ✓ — 6위젯 (머리글·Data 2·그래프·Table·바닥글)'))
              }}>{t('printsetup.defaultLayout', '기본 양식 배치')}</Btn>
              <Btn onClick={() => {
                addBox('[Data:—] 경로 미지정', 200, 44)
                shell.setStatusMsg(t('printsetup.dataAdded', 'Data 위젯 추가 ✓ — Data 위치 지정으로 경로 바인딩'))
              }}>{t('printsetup.dataCall', 'Data 호출')}</Btn>
              <Btn onClick={() => {
                addBox('[그래프:performance] 성능 곡선', 240, 120)
                shell.setStatusMsg(t('printsetup.graphAdded', '그래프 위젯 추가 ✓ — [그래프:performance]'))
              }}>{t('printsetup.loadGraph', '그래프 불러오기')}</Btn>
            </div>
          </GroupBox>
          <GroupBox title={t('printsetup.export', '내보내기')}>
            <div style={{ display: 'flex', gap: 4 }}>
              <Btn onClick={() => render('Printer', 'window')}
                title={t('printsetup.printerHint', '실렌더 새 창 — 브라우저 인쇄(Ctrl+P)')}>Printer</Btn>
              <Btn onClick={() => render('PDF', 'download')}>PDF</Btn>
              <Btn disabled title={t('printsetup.officeHint', '고객 양식 확정 후 (P4-1 — DOCX/XLSX 양식)')}>Office</Btn>
            </div>
          </GroupBox>
          <GroupBox title={t('common.save', '저장')} right={status === 'DRAFT'
            ? <Chip tone="info">DRAFT</Chip> : <Chip tone="warn">{t('printsetup.approvalPending', '승인 대기')}</Chip>}>
            <div style={{ textAlign: 'right' }}>
              <Btn variant="pri" disabled={status === 'PENDING'} onClick={() => {
                void approvalService.request('doc_control', `Print Form 게시 — ${form}`)
                  .then((ok) => {
                    if (ok) {
                      setStatus('PENDING')
                      shell.setStatusMsg(`승인 요청 ✓ — ${form} (승인함 등록, 승인 후 게시)`)
                    } else {
                      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>승인 요청 불가 — 백엔드 연결 필요</span>)
                    }
                  })
              }}>{t('printsetup.requestPublish', '승인 요청 → 게시')}</Btn>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 4 }}>
              {t('printsetup.gradeHint', 'Grade 통제 문서는 워터마크·출력 제한 강제 (DOC-002)')}
            </div>
          </GroupBox>
        </div>
      </div>
      {showBind && selected ? (
        <div data-bind-dialog style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowBind(false)}>
          <div style={{ width: 340, background: '#fff', border: '1px solid var(--line-strong)', boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>{t('printsetup.bindTitle', 'Data 위치 지정 — 자리표시자 바인딩')}</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowBind(false)}>✕</span>
            </div>
            <div className="frm c2" style={{ padding: 10 }}>
              <label>{t('printsetup.bindTarget', '대상 위젯')}</label>
              <input className="in ro" value={selected.label} readOnly aria-label="대상 위젯" />
              <label>{t('printsetup.bindPath', '데이터 경로')}</label>
              <Combo value={bindPath} options={[
                'project.no', 'customer', 'quote.total', 'bom.rows', 'run.outputs',
              ]} onChange={setBindPath} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, padding: '0 10px 10px' }}>
              <Btn onClick={() => setShowBind(false)}>{t('price.cancel', '취소')}</Btn>
              <Btn variant="pri" onClick={() => {
                setBoxes((prev) => prev.map((b) => (b.id === selected.id
                  ? { ...b, label: `[Data:${bindPath}] ${b.label.replace(/^\[[^\]]*\]\s*/, '')}` }
                  : b)))
                setShowBind(false)
                setStatus('DRAFT')
                shell.setStatusMsg(`바인딩 ✓ — [Data:${bindPath}] (게시 후 SVC-11 치환 렌더)`)
              }}>{t('printsetup.bindSubmit', '바인딩 F12')}</Btn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
