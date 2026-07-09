/** M-4-3 건축 설비 Design — Duct 자동 배치 (W-15, 슬라이드 68) — 사업 범위 확정 대상.
 *  자동 배치(최단 경로·유체 흐름) 실동작 mock · 설치 불가 지역(AI 판독) 표시. */
import { useState } from 'react'
import { DUCT_CALC } from '../../api/mock/dataMore'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

export function DuctDesignScreen(_props: ScreenProps) {
  const shell = useShell()
  const [placed, setPlaced] = useState(false)
  const [diffusers, setDiffusers] = useState(3)

  const autoPlace = () => {
    setPlaced(true)
    shell.setStatusMsg('자동 배치 ✓ — 최단 경로·유체 흐름 반영, Diffuser 3개 제안 (DUCT-005)')
  }

  return (
    <div className="fill-col">
      <div className="qband">
        <Chip tone="err">사업 범위 확정 대상 (보완노트 §3.3)</Chip>
        <label>층</label>
        <Combo width={58} value="3F" options={['1F', '2F', '3F']} />
        <Btn>복수 층 (Point XYZ)</Btn>
        <span style={{ flex: 1 }} />
        <Btn variant="run" onClick={autoPlace}>▶ 자동 배치 (최단 경로·유체 흐름)</Btn>
        <Btn disabled={!placed} onClick={() => {
          setDiffusers((d) => d + 1)
          shell.setStatusMsg(`Diffuser ${diffusers + 1}개 — 수량 조정`)
        }}>Diffuser 추가</Btn>
        <Btn disabled={!placed}>수동 조정 (Drag·Click)</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 210, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none', overflow: 'auto' }}>
          <GroupBox title="설계 조건">
            <div className="frm c2">
              <label>용도</label>
              <Combo value="급기" options={['급기', '배기', '환기']} />
              <label>풍량 기준</label>
              <Combo value="환기 횟수" options={['환기 횟수', '인원', '발열']} />
              <label>공기 조건</label>
              <input className="in" defaultValue="Air · 20℃ · 50%" aria-label="공기 조건" />
              <label>유속 기준</label>
              <Combo value="Std 선택" options={['Std 선택', '저속', '고속']} />
              <label>층고/보/텍스</label>
              <input className="in" defaultValue="4.2 / 0.6 / 2.8 m" aria-label="층고" />
              <label>Duct Option</label>
              <Combo value="점검구·Turning" options={['점검구·Turning', '기본']} />
            </div>
          </GroupBox>
          <GroupBox title="출발–종착">
            <div className="frm c2">
              <label>장비</label>
              <Combo value="AHU-3" options={['AHU-3', 'AHU-5']} />
              <label>실</label>
              <Combo value="Cleanroom A" options={['Cleanroom A', 'Room B']} />
            </div>
          </GroupBox>
          <GroupBox title="도면 호출 (AI 판독)">
            <div style={{ fontSize: 10, color: 'var(--txt-dim)', lineHeight: 1.7 }}>
              건축도 AI 판독: 램프·빔·소방구역·실 구분 → 설치 불가 지역 표시 (DUCT-001)
            </div>
          </GroupBox>
        </div>
        <div className="fill-col">
          <div className="cvs" style={{ flex: 1, minHeight: 320 }}>
            {/* rooms */}
            <div className="m2" style={{ left: 20, top: 20, width: 190, height: 130 }}>Room A<small>환기 6회/h</small></div>
            <div className="m2" style={{ left: 210, top: 20, width: 150, height: 130 }}>Room B</div>
            <div className="m2" style={{ left: 360, top: 20, width: 170, height: 290 }}>대공간<small>측면 입·출 환기 Point</small></div>
            {/* no-install zone */}
            <div style={{
              position: 'absolute', left: 20, top: 150, width: 340, height: 160,
              border: '1px dashed var(--err)',
              background: 'repeating-linear-gradient(45deg,#fdecec,#fdecec 10px,#fff 10px,#fff 20px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: 'var(--err)', textAlign: 'center',
            }}>
              설치 불가 지역<br />(소방구역·빔 — AI 판독)
            </div>
            {/* duct path (자동 배치 후) */}
            {placed ? (
              <>
                <div style={{ position: 'absolute', left: 60, top: 96, width: 300, borderTop: '4px solid #3B6BB4' }} />
                <div style={{ position: 'absolute', left: 356, top: 96, height: 120, borderLeft: '4px solid #3B6BB4' }} />
                <div style={{ position: 'absolute', left: 356, top: 214, width: 120, borderTop: '4px solid #3B6BB4' }} />
                <div style={{ position: 'absolute', left: 52, top: 86, width: 22, height: 20, background: '#17376B', color: '#fff', fontSize: 8, textAlign: 'center', lineHeight: '20px', borderRadius: 2 }}>AHU</div>
                {Array.from({ length: diffusers }, (_, i) => (
                  <div key={i} style={{ position: 'absolute', left: 110 + i * 66, top: 90, width: 9, height: 9, background: 'var(--run)', borderRadius: '50%' }} />
                ))}
                <div style={{ position: 'absolute', left: 120, top: 106, fontSize: 9, color: 'var(--run)' }}>
                  ● Diffuser {diffusers}개 자동 배치 (수량 조정 가능)
                </div>
              </>
            ) : (
              <div style={{ position: 'absolute', left: 90, top: 96, fontSize: 10.5, color: 'var(--txt-mute)' }}>
                ▶ 자동 배치를 실행하십시오
              </div>
            )}
          </div>
        </div>
        <div className="split-h" />
        <div style={{ width: 270, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="기술자료 계산" noPad>
            {placed ? (
              <table className="g">
                <thead><tr><th>항목</th><th>값</th></tr></thead>
                <tbody>
                  {DUCT_CALC.map((c) => (
                    <tr key={c.item}>
                      <td>{c.item}</td>
                      <td className="num">{c.item === '결로 위험'
                        ? <Chip tone="ok">{c.value}</Chip> : c.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 10, fontSize: 10.5, color: 'var(--txt-mute)' }}>
                배치 후 압력손실·Leak·하중 계산
              </div>
            )}
          </GroupBox>
          <GroupBox title="Duct 자재 DB">
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
              종류·손실·무게·Size별 최대길이<br />Pitting·Hanger·Joint·Insulation
            </div>
          </GroupBox>
          <GroupBox title="EDIM 연결" right={
            <Btn variant="run" style={{ height: 18, fontSize: 10 }} disabled={!placed}
              onClick={() => shell.setStatusMsg('EDIM Run — Duct BOM·스크랩 최적화·구매·견적 연동 (DUCT-007)')}>
              EDIM Run
            </Btn>
          }>
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.7 }}>
              기술: BOM/Code · 제조: 최소 스크랩<br />자재: 구매 · 영업: 견적
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
