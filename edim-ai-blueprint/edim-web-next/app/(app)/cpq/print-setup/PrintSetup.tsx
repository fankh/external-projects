'use client'

import { useState, useTransition } from 'react'
import { Btn, Chip, GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { downloadRenderedXlsx, openRenderedPdf, printRenderedPdf, type RenderOpts } from '@/lib/pdf'
import { publishForm } from './actions'

const FORMS = ['Technical Report', '견적서 (CLT)', '작업지시서', '검사성적서']
interface FormBox { id: number; label: string; x: number; y: number; w: number; h: number; dashed?: boolean }
const DEFAULT_BOXES: FormBox[] = [
  { id: 1, label: '머리글 — 로고 · Title · DOC No.', x: 40, y: 16, w: 480, h: 36, dashed: true },
  { id: 2, label: '[Data:customer] Customer·Date·담당', x: 40, y: 66, w: 220, h: 52 },
  { id: 3, label: '[Data:input] Input Value·Result', x: 280, y: 66, w: 240, h: 52 },
  { id: 4, label: '[그래프:performance] 성능 곡선', x: 40, y: 132, w: 280, h: 140 },
  { id: 5, label: '[Table:tech] 기술 Data', x: 340, y: 132, w: 180, h: 140 },
  { id: 6, label: '바닥글 — 페이지 · 회사 정보', x: 40, y: 288, w: 480, h: 24, dashed: true },
]

export function PrintSetup() {
  const { t } = useI18n()
  // 내부 값(form 상태·렌더 파라미터)은 한국어 원문 유지 — 표시만 번역
  const formLabel = (f: string) =>
    f === '견적서 (CLT)' ? t('printsetup.quoteForm', '견적서 (CLT)')
      : f === '작업지시서' ? t('printsetup.workOrder', '작업지시서')
        : f === '검사성적서' ? t('printsetup.inspectReport', '검사성적서')
          : f
  const [form, setForm] = useState(FORMS[0])
  const [watermark, setWatermark] = useState(true)
  const [status, setStatus] = useState<'DRAFT' | 'PENDING'>('DRAFT')
  const [boxes] = useState<FormBox[]>(DEFAULT_BOXES)
  const [selBox, setSelBox] = useState<number | null>(2)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [pending, start] = useTransition()
  const say = (text: string, err = false) => setMsg({ text, err })

  // U6 출력 설정 (슬라이드 50) — 용지·방향·여백·글꼴·색상·바닥글
  const [paper, setPaper] = useState<'A4' | 'A3' | 'LETTER'>('A4')
  const [land, setLand] = useState(false)
  const [marginMm, setMarginMm] = useState(17.6)
  const [fontPt, setFontPt] = useState(9.5)
  const [grayscale, setGrayscale] = useState(false)
  const [footerText, setFooterText] = useState('')
  const renderOpts = (label: string): RenderOpts => ({
    subtitle: `Print Set-up ${label} (S-3-4)`, confidential: watermark,
    paper, landscapeMode: land, marginMm, fontPt, grayscale, footerText,
  })

  const renderLines = () => [
    ...boxes.map((b) => b.label), '',
    `머리글·바닥글: 표준 Templet · 워터마크: ${watermark ? 'CONFIDENTIAL' : '없음'}`,
    `출력: ${paper} ${land ? '가로' : '세로'} · 여백 ${marginMm}mm · ${fontPt}pt · ${grayscale ? '흑백' : '칼라'}`,
    '게시 후 SVC-11 이 실데이터로 치환 렌더한다 (CPQ-013).',
  ]
  const render = (label: string) => void openRenderedPdf(`${form} — ${label}`, renderLines(), renderOpts(label))
    .then((ok) => say(ok ? `${label} ✓ — ${form} 실렌더 (${paper} ${land ? '가로' : '세로'} · ${grayscale ? '흑백' : '칼라'})` : '렌더 불가 — 백엔드 연결 필요', !ok))
  const exportOffice = () => void downloadRenderedXlsx(`${form} — Office`, renderLines(), renderOpts('Office'))
    .then((ok) => say(ok ? `Office(xlsx) 내보내기 ✓ — ${form}` : '내보내기 불가 — 백엔드 연결 필요', !ok))
  // U15 — OS 인쇄 다이얼로그 (슬라이드 50): 렌더 PDF 를 숨김 프레임에 적재 후 print()
  const printDialog = () => void printRenderedPdf(`${form} — 인쇄`, renderLines(), renderOpts('인쇄'))
    .then((ok) => say(ok ? `인쇄 다이얼로그 호출 ✓ — ${form} (${paper} ${land ? '가로' : '세로'})` : '인쇄 불가 — 백엔드 연결 필요', !ok))
  const publish = () => start(async () => {
    const r = await publishForm(form)
    if (r.error) { say(r.error, true); return }
    setStatus('PENDING'); say(`게시 승인 요청 ✓ — ${form} (승인함 등록 · 승인 후 게시, CPQ-013)`)
  })

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ gap: 6 }}>
        <label style={{ fontSize: 11 }}>{t('printsetup.form', '양식')}</label>
        <select className="in" value={form} onChange={(e) => setForm(e.target.value)} style={{ height: 22, fontSize: 11 }}>
          {FORMS.map((f) => <option key={f} value={f}>{formLabel(f)}</option>)}
        </select>
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}><input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} /> {t('printsetup.watermark', '워터마크')}</label>
        <Chip tone={status === 'DRAFT' ? 'info' : 'warn'}>{status}</Chip>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => render('Print Test')}>Print Test</Btn>
        <Btn onClick={printDialog}>🖨 {t('printsetup.printDialog', '인쇄')}</Btn>
        <Btn onClick={() => render('PDF')}>PDF</Btn>
        <Btn onClick={exportOffice} data-office-export>Office (xlsx)</Btn>
        <Btn variant="pri" disabled={pending || status === 'PENDING'} onClick={publish}>{t('printsetup.publish', '게시 (승인 후)')}</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ flex: 1 }}>
          <GroupBox title={t('printsetup.canvasTitle', '양식 캔버스 — [Data]/[그래프]/[Table] 자리표시자')} noPad>
            <div className="cvs" style={{ flex: 1, minHeight: 340 }}>
              {boxes.map((b) => (
                <div key={b.id} className={`m2 ${selBox === b.id ? 'sel' : ''}`} style={{ left: b.x, top: b.y, width: b.w, height: b.h, borderStyle: b.dashed ? 'dashed' : undefined, fontSize: 9.5 }} onClick={() => setSelBox(b.id)}>{b.label}</div>
              ))}
              {watermark ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: 'rgba(200,40,40,.10)', fontWeight: 800, transform: 'rotate(-20deg)', pointerEvents: 'none' }}>CONFIDENTIAL</div> : null}
            </div>
          </GroupBox>
          {msg ? <div style={{ fontSize: 11, padding: '3px 4px', color: msg.err ? 'var(--err)' : 'var(--run)' }}>{msg.text}</div> : null}
        </div>
        <div className="split-h" />
        <div className="side-scroll" style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GroupBox title={t('printsetup.placeholderList', '자리표시자 목록')} noPad>
            <table className="g"><thead><tr><th>ID</th><th>Placeholder</th></tr></thead>
              <tbody>{boxes.map((b) => (
                <tr key={b.id} className={selBox === b.id ? 'sel' : undefined} onClick={() => setSelBox(b.id)}><td className="code">{b.id}</td><td style={{ fontSize: 10 }}>{b.label}</td></tr>
              ))}</tbody></table>
          </GroupBox>
          <GroupBox title={t('printsetup.outputSettings', '출력 설정')}>
            <div style={{ fontSize: 11, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 5, alignItems: 'center', padding: 4 }}>
              <label>{t('printsetup.paper', '용지')}</label>
              <select className="in" data-ps-paper value={paper} onChange={(e) => setPaper(e.target.value as 'A4' | 'A3' | 'LETTER')} style={{ height: 20, fontSize: 10.5 }}>
                {['A4', 'A3', 'LETTER'].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <label>{t('printsetup.orientation', '방향')}</label>
              <select className="in" value={land ? 'L' : 'P'} onChange={(e) => setLand(e.target.value === 'L')} style={{ height: 20, fontSize: 10.5 }}>
                <option value="P">{t('printsetup.portrait', '세로')}</option>
                <option value="L">{t('printsetup.landscape', '가로')}</option>
              </select>
              <label>{t('printsetup.margin', '여백(mm)')}</label>
              <input className="in" type="number" min={5} max={40} step={0.5} value={marginMm}
                onChange={(e) => setMarginMm(Number(e.target.value) || 17.6)} style={{ height: 20, fontSize: 10.5 }} />
              <label>{t('printsetup.fontSize', '글꼴(pt)')}</label>
              <input className="in" type="number" min={6} max={16} step={0.5} value={fontPt}
                onChange={(e) => setFontPt(Number(e.target.value) || 9.5)} style={{ height: 20, fontSize: 10.5 }} />
              <label>{t('printsetup.color', '색상')}</label>
              <select className="in" value={grayscale ? 'G' : 'C'} onChange={(e) => setGrayscale(e.target.value === 'G')} style={{ height: 20, fontSize: 10.5 }}>
                <option value="C">{t('printsetup.colorful', '칼라')}</option>
                <option value="G">{t('printsetup.grayscale', '흑백')}</option>
              </select>
              <label>{t('printsetup.footer', '바닥글')}</label>
              <input className="in" placeholder={t('printsetup.footerPh', '기본: EDIM 서명행')} value={footerText}
                onChange={(e) => setFooterText(e.target.value)} style={{ height: 20, fontSize: 10.5 }} />
              <div style={{ gridColumn: '1 / -1', fontSize: 10, color: 'var(--txt-mute)' }}>
                {t('printsetup.watermark', '워터마크')} <b>{watermark ? 'CONFIDENTIAL' : t('printsetup.none', '없음')}</b> · {t('printsetup.applyHint', '설정은 Print Test·PDF·Office 출력에 즉시 반영')}
              </div>
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
