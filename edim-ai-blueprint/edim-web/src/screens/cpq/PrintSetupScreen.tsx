/** S-3-4 Print Set-up (W-18, 슬라이드 50) — 양식 캔버스에 [Data]/[그래프]/[Table]
 *  자리표시자 배치 · 워터마크 · 출력 설정 · DRAFT→승인→게시 (CPQ-013, SVC-11). */
import { useState } from 'react'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

const FORMS = ['Technical Report', '견적서 (CLT)', '작업지시서', '검사성적서']

export function PrintSetupScreen(_props: ScreenProps) {
  const shell = useShell()
  const [form, setForm] = useState(FORMS[0])
  const [watermark, setWatermark] = useState(true)
  const [status, setStatus] = useState<'DRAFT' | 'PENDING'>('DRAFT')

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Print Form</label>
        <Combo width={140} value={form} options={FORMS} onChange={(v) => { setForm(v); setStatus('DRAFT') }} />
        <span className="sep" />
        <Btn onClick={() => shell.setStatusMsg('Data 위치 지정 — 자리표시자에 데이터 경로 바인딩')}>Data 위치 지정</Btn>
        <Btn variant={watermark ? 'pri' : 'default'} onClick={() => setWatermark(!watermark)}>
          워터마크 {watermark ? 'ON' : 'OFF'}
        </Btn>
        <span style={{ flex: 1 }} />
        <Btn variant="run" onClick={() => shell.setStatusMsg(`Print Test — ${form} 렌더 (SVC-11)`)}>
          Print Test
        </Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 4 }}>
          <div className="cvs" style={{ flex: 1, minHeight: 340, background: '#fff' }}>
            <div className="m2" style={{ left: 40, top: 16, width: 480, height: 36, borderStyle: 'dashed' }}>
              머리글 — 로고 · Title · DOC No.
            </div>
            <div className="m2 sel" style={{ left: 40, top: 66, width: 220, height: 52 }}>
              [Data] Customer·Date·담당
            </div>
            <div className="m2 sel" style={{ left: 280, top: 66, width: 240, height: 52 }}>
              [Data] Input Value·Result
            </div>
            <div className="m2" style={{ left: 40, top: 132, width: 280, height: 140 }}>
              [그래프] 성능 곡선
            </div>
            <div className="m2" style={{ left: 340, top: 132, width: 180, height: 140 }}>
              [Table] 기술 Data
            </div>
            {watermark ? (
              <div style={{
                position: 'absolute', left: 170, top: 160, fontSize: 28, fontWeight: 800,
                color: 'rgba(179,55,47,.13)', transform: 'rotate(-20deg)', pointerEvents: 'none',
              }}>CONFIDENTIAL</div>
            ) : null}
            <div className="m2" style={{ left: 40, top: 288, width: 480, height: 24, borderStyle: 'dashed' }}>
              바닥글 — 페이지 · 회사 정보
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
            자리표시자 배치 → 데이터 경로 바인딩 → 게시된 Form 은 SVC-11 이 렌더 (견적서·PCR·작업지시서 공통)
          </div>
        </div>
        <div className="split-h" />
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="출력 설정">
            <div className="frm c2">
              <label>Type of File</label>
              <Combo value="PDF" options={['PDF', 'XLSX', 'DOCX']} />
              <label>용지</label>
              <Combo value="A4 세로" options={['A4 세로', 'A4 가로', 'A3']} />
              <label>색상</label>
              <Combo value="칼라" options={['칼라', '흑백']} />
              <label>Font / 크기</label>
              <Combo value="Pretendard 10" options={['Pretendard 10', 'Malgun 10']} />
              <label>여백</label>
              <input className="in" defaultValue="15/15/20/20 mm" aria-label="여백" />
              <label>머리글·바닥글</label>
              <Combo value="표준 Templet" options={['표준 Templet', '없음']} />
              <label>워터마크</label>
              <Combo value={watermark ? 'CONFIDENTIAL' : '없음'} options={['CONFIDENTIAL', '없음']}
                onChange={(v) => setWatermark(v !== '없음')} />
            </div>
          </GroupBox>
          <GroupBox title="Call Form">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Btn>기본 양식 배치</Btn>
              <Btn>Data 호출</Btn>
              <Btn>그래프 불러오기</Btn>
            </div>
          </GroupBox>
          <GroupBox title="내보내기">
            <div style={{ display: 'flex', gap: 4 }}>
              <Btn>Printer</Btn><Btn>PDF</Btn><Btn>Office</Btn>
            </div>
          </GroupBox>
          <GroupBox title="저장" right={status === 'DRAFT'
            ? <Chip tone="info">DRAFT</Chip> : <Chip tone="warn">승인 대기</Chip>}>
            <div style={{ textAlign: 'right' }}>
              <Btn variant="pri" disabled={status === 'PENDING'} onClick={() => {
                setStatus('PENDING')
                shell.setStatusMsg(`승인 요청 — ${form} (승인 후 게시)`)
              }}>승인 요청 → 게시</Btn>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 4 }}>
              Grade 통제 문서는 워터마크·출력 제한 강제 (DOC-002)
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
