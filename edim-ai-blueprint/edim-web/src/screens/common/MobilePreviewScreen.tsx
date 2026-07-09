/** M-16 EDIM App Mobile 미리보기 (W-16, 슬라이드 77) — QR 진입·승인·자재 입출고.
 *  내부는 dense 토큰, 터치 타깃만 32px 예외. 웹 승인함(M-15-2)과 동일 데이터 (APP-002). */
import { Btn, Chip, GroupBox } from '../../components/controls'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

export function MobilePreviewScreen(_props: ScreenProps) {
  const shell = useShell()
  return (
    <div className="fill-col" style={{ overflow: 'auto' }}>
      <div className="qband">
        <Chip tone="info">P5 — Mobile App (APP-001~008)</Chip>
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          QR이 모든 진입점 — 도면·서류·Project·업무 직행 (컴퓨터 접근 불가 지역 대응)
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>AR 뷰는 Digital Twin 연계 후순위 (APP-008)</span>
      </div>
      <div style={{ display: 'flex', gap: 18, padding: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* 홈 */}
        <div>
          <div className="phone">
            <div className="pt"><i /></div>
            <div className="pscr">
              <div className="pbar"><span>EDIM · CTO/ETO</span><span>🔔 3</span></div>
              <div className="cvs" style={{ height: 78, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 10.5, color: 'var(--txt-dim)', textAlign: 'center' }}>
                  📷 QR 스캔<br />도면·서류·Project·업무 접근
                </span>
              </div>
              <div className="pgrid">
                {[['✅', '업무 승인', '4'], ['💬', 'Project 소통', ''], ['📦', '자재 입출고', ''], ['🔍', '검수', ''],
                  ['🛠', '유지보수', ''], ['🕶', 'AR 뷰', ''], ['📢', '공지', ''], ['📁', 'Project 정보', '']].map(([ic, label, badge]) => (
                    <div key={label} className="pi"
                      onClick={() => shell.setStatusMsg(`모바일 — ${label} (웹과 동일 데이터·규칙)`)}>
                      <span className="ic">{ic}</span>{label}
                      {badge ? <Chip tone="warn">{badge}</Chip> : null}
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--txt-dim)', marginTop: 6 }}>홈 — 메뉴 Grid</div>
        </div>
        {/* 승인 상세 */}
        <div>
          <div className="phone">
            <div className="pt"><i /></div>
            <div className="pscr">
              <div className="pbar"><span>← 업무 승인</span><span>PS-61313-5</span></div>
              <div className="gb">
                <div className="gt">도면 KDCR 3-13 Rev.B</div>
                <div className="gc">
                  <div className="cvs" style={{ height: 64 }} />
                  <div style={{ fontSize: 9.5, color: 'var(--txt-dim)', marginTop: 4, lineHeight: 1.6 }}>
                    요청: Kim · 07-07<br />구분: 개정 승인 (검토 완료)
                  </div>
                </div>
              </div>
              <div className="gb">
                <div className="gt">Project 대화 (History)</div>
                <div className="gc" style={{ fontSize: 9.5, color: 'var(--txt-dim)', lineHeight: 1.7 }}>
                  Kim: 치수 B 재검토 반영했습니다<br />Park: 조립순서 주의사항 확인 요망
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
                <Btn style={{ flex: 1, height: 32, justifyContent: 'center', borderColor: 'var(--err)', color: 'var(--err)' }}
                  onClick={() => shell.setStatusMsg('모바일 반려 — 웹 승인함과 동일 규칙 (APP-002)')}>반려</Btn>
                <Btn variant="run" style={{ flex: 1, height: 32, justifyContent: 'center' }}
                  onClick={() => shell.setStatusMsg('모바일 승인 — APPROVED 전이 (APP-002)')}>승인</Btn>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--txt-dim)', marginTop: 6 }}>승인 상세 — QR 진입</div>
        </div>
        {/* 자재 입고 */}
        <div>
          <div className="phone">
            <div className="pt"><i /></div>
            <div className="pscr">
              <div className="pbar"><span>← 자재 입출고</span><span>MI</span></div>
              <div className="cvs" style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--txt-dim)' }}>📷 자재 QR 스캔</span>
              </div>
              <div className="gb">
                <div className="gt">Motor H22 380V (FDV-480)</div>
                <div className="gc">
                  <div className="frm c2">
                    <label>수량</label>
                    <input className="in" defaultValue="2 EA" aria-label="수량" style={{ height: 26 }} />
                    <label>창고</label>
                    <input className="in ro" value="WS 1 / Sector C" readOnly aria-label="창고" style={{ height: 26 }} />
                    <label>Project</label>
                    <input className="in ro" value="PS-61313-5" readOnly aria-label="Project" style={{ height: 26 }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
                <Btn style={{ flex: 1, height: 32, justifyContent: 'center' }}>📸 사진 첨부</Btn>
                <Btn variant="pri" style={{ flex: 1, height: 32, justifyContent: 'center' }}
                  onClick={() => shell.setStatusMsg('입고 처리 — 오프라인 캐시 지원 (APP-004)')}>입고 처리</Btn>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--txt-dim)', marginTop: 6 }}>자재 입고 — 현장 처리</div>
        </div>
      </div>
      <GroupBox title="설계 노트" style={{ margin: '0 16px 16px' }}>
        <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
          ① QR 진입 (APP-001) ② 승인은 웹 승인함과 동일 데이터 (APP-002) ③ Project 중심 대화 History (APP-003)
          ④ 자재·검수는 사진 첨부 + 오프라인 캐시 (APP-004/005) — 터치 타깃 32px 예외 명기
        </div>
      </GroupBox>
    </div>
  )
}
