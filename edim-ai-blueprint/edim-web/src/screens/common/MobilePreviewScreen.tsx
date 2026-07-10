/** M-16 EDIM App Mobile 미리보기 (W-16, 슬라이드 77) — QR 진입·승인·자재 입출고.
 *  내부는 dense 토큰, 터치 타깃만 32px 예외. 웹 승인함(M-15-2)과 동일 데이터 (APP-002 — B11 실배선). */
import { useEffect, useRef, useState } from 'react'
import { approvalService, eventService, fileService, type ErpEvent } from '../../api/services'
import type { ApprovalReq } from '../../api/mock/dataMore'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

export function MobilePreviewScreen(_props: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()

  // B11 — 실데이터: 대기 승인 1건 + 미완료 이벤트 1건 (웹과 동일 원천)
  const [req, setReq] = useState<ApprovalReq | null>(null)
  const [ev, setEv] = useState<ErpEvent | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  const loadReq = () => void approvalService.inbox()
    .then((rows) => setReq(rows[rows.length - 1] ?? null))
  useEffect(() => {
    loadReq()
    void eventService.list().then((rows) =>
      setEv(rows.find((r) => r.status !== 'DONE' && r.eventId != null) ?? null))
  }, [])

  const decide = (approve: boolean) => {
    if (!req) {
      shell.setStatusMsg('모바일 승인 — 대기 중인 요청 없음')
      return
    }
    void (async () => {
      try {
        await approvalService.decide(req.id, approve, approve ? '모바일 승인 (APP-002)' : '모바일 반려 (APP-002)')
        shell.setStatusMsg(`모바일 ${approve ? '승인' : '반려'} ✓ — ${req.target} (웹 승인함과 동일 데이터·규칙, 요청자 알림)`)
        loadReq()
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '처리 실패'}</span>)
      }
    })()
  }

  const receive = () => {
    if (!ev?.eventId) {
      shell.setStatusMsg('입고 처리 — 미완료 이벤트 없음 (백엔드 필요)')
      return
    }
    void eventService.complete(ev.eventId, '모바일 입고 처리 (MI-002)')
      .then(() => {
        shell.setStatusMsg(`입고 처리 ✓ — 이벤트 #${ev.eventId} ${ev.project} DONE (오프라인 캐시 APP-004)`)
        void eventService.list().then((rows) =>
          setEv(rows.find((r) => r.status !== 'DONE' && r.eventId != null) ?? null))
      })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const attachPhoto = (f: globalThis.File) => {
    void fileService.upload(f, 'RECEIVED', 'PS-61313-5')
      .then((ok) => shell.setStatusMsg(ok
        ? `사진 첨부 ✓ — ${f.name} (RECEIVED 폴더 · MinIO, Folder 화면에서 확인)`
        : <span style={{ color: 'var(--err)' }}>사진 첨부 불가 — 백엔드 연결 필요</span>))
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }
  return (
    <div className="fill-col" style={{ overflow: 'auto' }}>
      <div className="qband">
        <Chip tone="info">P5 — Mobile App (APP-001~008)</Chip>
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          {t('mobile.qrHint', 'QR이 모든 진입점 — 도면·서류·Project·업무 직행 (컴퓨터 접근 불가 지역 대응)')}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{t('mobile.arNote', 'AR 뷰는 Digital Twin 연계 후순위 (APP-008)')}</span>
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
                  📷 {t('mobile.qrScan', 'QR 스캔')}<br />{t('mobile.qrScanDesc', '도면·서류·Project·업무 접근')}
                </span>
              </div>
              <div className="pgrid">
                {[['✅', 'mobile.taskApproval', '업무 승인', '4'], ['💬', 'mobile.projectChat', 'Project 소통', ''],
                  ['📦', 'mobile.materialInOut', '자재 입출고', ''], ['🔍', 'mobile.inspection', '검수', ''],
                  ['🛠', 'mobile.maintenance', '유지보수', ''], ['🕶', 'mobile.arView', 'AR 뷰', ''],
                  ['📢', 'mobile.notice', '공지', ''], ['📁', 'mobile.projectInfo', 'Project 정보', '']].map(([ic, k, label, badge]) => (
                    <div key={label} className="pi"
                      onClick={() => shell.setStatusMsg(`모바일 — ${label} (웹과 동일 데이터·규칙)`)}>
                      <span className="ic">{ic}</span>{t(k, label)}
                      {badge ? <Chip tone="warn">{badge}</Chip> : null}
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--txt-dim)', marginTop: 6 }}>{t('mobile.homeCaption', '홈 — 메뉴 Grid')}</div>
        </div>
        {/* 승인 상세 */}
        <div>
          <div className="phone">
            <div className="pt"><i /></div>
            <div className="pscr">
              <div className="pbar"><span>← {t('mobile.taskApproval', '업무 승인')}</span><span>PS-61313-5</span></div>
              <div className="gb">
                <div className="gt">{req ? `${req.assetType} ${req.target}` : `${t('appr.drawing', '도면')} — 대기 없음`}</div>
                <div className="gc">
                  <div className="cvs" style={{ height: 64 }} />
                  <div style={{ fontSize: 9.5, color: 'var(--txt-dim)', marginTop: 4, lineHeight: 1.6 }}>
                    {req
                      ? <>{t('mobile.request', '요청')}: {req.requester} · {req.reqDate}<br />{t('taskbox.kind', '구분')}: {req.reqKind} ({req.stage})</>
                      : <>{t('mobile.request', '요청')}: —<br />{t('taskbox.kind', '구분')}: 처리할 승인 요청 없음</>}
                  </div>
                </div>
              </div>
              <div className="gb">
                <div className="gt">{t('mobile.projectChatHist', 'Project 대화 (History)')}</div>
                <div className="gc" style={{ fontSize: 9.5, color: 'var(--txt-dim)', lineHeight: 1.7 }}>
                  Kim: 치수 B 재검토 반영했습니다<br />Park: 조립순서 주의사항 확인 요망
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
                <Btn style={{ flex: 1, height: 32, justifyContent: 'center', borderColor: 'var(--err)', color: 'var(--err)' }}
                  onClick={() => decide(false)}>{t('common.reject', '반려')}</Btn>
                <Btn variant="run" style={{ flex: 1, height: 32, justifyContent: 'center' }}
                  onClick={() => decide(true)}>{t('common.approve', '승인')}</Btn>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--txt-dim)', marginTop: 6 }}>{t('mobile.approvalCaption', '승인 상세 — QR 진입')}</div>
        </div>
        {/* 자재 입고 */}
        <div>
          <div className="phone">
            <div className="pt"><i /></div>
            <div className="pscr">
              <div className="pbar"><span>← {t('mobile.materialInOut', '자재 입출고')}</span><span>MI</span></div>
              <div className="cvs" style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--txt-dim)' }}>📷 {t('mobile.materialQrScan', '자재 QR 스캔')}</span>
              </div>
              <div className="gb">
                <div className="gt">Motor H22 380V (FDV-480)</div>
                <div className="gc">
                  <div className="frm c2">
                    <label>{t('mobile.qty', '수량')}</label>
                    <input className="in" defaultValue="2 EA" aria-label="수량" style={{ height: 26 }} />
                    <label>{t('mobile.warehouse', '창고')}</label>
                    <input className="in ro" value="WS 1 / Sector C" readOnly aria-label="창고" style={{ height: 26 }} />
                    <label>Project</label>
                    <input className="in ro" value="PS-61313-5" readOnly aria-label="Project" style={{ height: 26 }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
                <input ref={photoInput} type="file" accept="image/*" style={{ display: 'none' }}
                  aria-label="사진 첨부"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) attachPhoto(f)
                    e.target.value = ''
                  }} />
                <Btn style={{ flex: 1, height: 32, justifyContent: 'center' }}
                  onClick={() => photoInput.current?.click()}>📸 {t('mobile.attachPhoto', '사진 첨부')}</Btn>
                <Btn variant="pri" style={{ flex: 1, height: 32, justifyContent: 'center' }}
                  onClick={receive}>{t('mobile.receive', '입고 처리')}</Btn>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--txt-dim)', marginTop: 6 }}>{t('mobile.receiveCaption', '자재 입고 — 현장 처리')}</div>
        </div>
      </div>
      <GroupBox title={t('mobile.designNote', '설계 노트')} style={{ margin: '0 16px 16px' }}>
        <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
          {t('mobile.designNoteBody', '① QR 진입 (APP-001) ② 승인은 웹 승인함과 동일 데이터 (APP-002) ③ Project 중심 대화 History (APP-003) ④ 자재·검수는 사진 첨부 + 오프라인 캐시 (APP-004/005) — 터치 타깃 32px 예외 명기')}
        </div>
      </GroupBox>
    </div>
  )
}
