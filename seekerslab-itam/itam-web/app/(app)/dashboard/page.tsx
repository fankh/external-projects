import Link from 'next/link'
import { Card, Chip, RiskChip, ScreenHeader, Stat } from '@/components/ui'
import { canDecideApproval } from '@/lib/approval'
import { daysUntil, isApprovalOverdue, isLoanDueSoon, isLoanOverdue, isRepairOverdue, isStaleVerify, roundProgressPct, today } from '@/lib/dates'
import { eolOsOf } from '@/lib/eol'
import { buildVulnPriority } from '@/lib/vuln-priority'
import { hasDataIssue } from '@/lib/quality'
import { approvalHref, noticeHref } from '@/lib/reflink'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = (await getSession())!
  const s = getStore()

  const inUse = s.assets.filter((a) => a.status === '사용중').length
  const idle = s.assets.filter((a) => a.status === '유휴' || a.status === '반납대기').length
  const newFound = s.discovered.filter((d) => d.state === '미등록' && !d.action)
  const pendingApr = s.approvals.filter((a) => a.status === '대기')
  // 결재 지연 — SLA(3일) 초과한 대기 결재(정체). 상신 후 오래 방치된 결재를 드러낸다.
  const overdueApr = pendingApr.filter((a) => isApprovalOverdue(a, today(), s.opsPolicy.approvalSlaDays)).length
  const myApr = s.approvals.filter((a) => a.requester === session.name && a.status === '대기')
  // 내 결재 차례 — 지금 이 사람이 결재할 수 있는 대기 건 (본인 상신분 제외). decide()와 동일 게이트를 쓴다.
  const myQueue = s.approvals.filter((a) => a.requester !== session.name && canDecideApproval(session.role, a))
  const myAssets = s.assets.filter((a) => a.owner === session.name)
  // 내 미확인 필독 공지 — 상단 고정(필독) 공지 중 내가 아직 읽음 확인하지 않은 것. 사용자가 로그인 시 스스로 챙기게 하는 컴플라이언스 넛지
  // (관리자 측 독촉(로39)·미확인자 명단(v1.150)의 사용자 측 짝). 발행 예정(publishAt 미래) 공지는 아직 안 보이므로 제외.
  const unackedNotices = s.posts.filter(
    (p) => p.kind === '공지' && p.pinned && (!p.publishAt || p.publishAt <= today()) && !(p.acks ?? []).some((a) => a.by === session.name),
  )
  // 최근 공지 — Main/Home 의 공지 요약(제품안내서 §01 대시보드·게시판). 발행된 공지를 필독(고정) 우선·최신순으로 노출해
  // 랜딩 시 최신 안내를 게시판까지 가지 않아도 볼 수 있게 한다(예약 발행 전 공지는 제외). 전 권한그룹.
  const recentNotices = [...s.posts]
    .filter((p) => p.kind === '공지' && (!p.publishAt || p.publishAt <= today()))
    .sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || (b.publishAt ?? b.createdAt).localeCompare(a.publishAt ?? a.createdAt))
    .slice(0, 5)
  // 우리 부서 소유자 확인 요청 — 발견 자산이 우리 부서 자산인지 묻는 대기 건. 응답자(해당 부서)가 로그인 시 챙기게 한다
  // (Discovery 소유자 확인 루프(로12)의 응답자 측 — 결재함까지 가지 않아도 대시보드에서 드러난다). 미지정 부서 요청은 전사 공지·격리 경로라 제외.
  const myOwnerConfirms = s.approvals.filter((a) => a.kind === '소유자 확인' && a.status === '대기' && a.dept === session.dept)
  // 반려된 내 신청 — 아직 재상신하지 않은 반려 건. 사용자가 로그인 시 사유를 보고 재상신할지 스스로 판단하게 한다(결재함까지 안 가도 드러남).
  const myRejected = s.approvals.filter(
    (a) => a.requester === session.name && a.status === '반려' && !a.resubmitted && ['자산 신청', '반납', '이동', '대여', 'SaaS 인가'].includes(a.kind),
  )
  // 내 대여 자산 — 본인이 빌린(대여중·소유자=본인) 자산의 반환 기한. 대여자 관점의 반환 마감 알림.
  // 담당자에게는 대여 현황(반납·유휴)·연체 큐가, 대여자에게는 여기 My Work 가 반환을 상기시킨다(v1.102 독촉 통지의 수신자 측).
  const myLoans = s.assets
    .filter((a) => a.status === '대여중' && a.owner === session.name)
    .map((a) => ({ assetNo: a.assetNo, model: a.model, dueDate: a.loanDueDate ?? '-', dday: a.loanDueDate ? daysUntil(a.loanDueDate) : null }))
    .sort((x, y) => (x.dday ?? 99_999) - (y.dday ?? 99_999))

  // 운영 대기 — 화면마다 흩어진 담당 처리 대기열을 역할에 맞게 한 곳에 모은다
  const opsQueues: { label: string; count: number; href: string; tone: 'err' | 'warn' }[] = []
  if (['ASSET_MGR', 'ADMIN'].includes(session.role)) {
    const issueDue = s.approvals.filter((a) => a.kind === '자산 신청' && a.status === '승인' && !a.fulfilled && !a.refId?.startsWith('DSC-')).length
    const moveDue = s.approvals.filter((a) => a.kind === '이동' && a.status === '승인' && !a.fulfilled).length
    opsQueues.push(
      { label: '입고 검수 대기', count: s.intakeLots.filter((l) => l.status === '입고 대기' || l.status === '검수 중').length, href: '/assets/intake', tone: 'warn' },
      { label: '불출 · 이동 집행 대기', count: issueDue + moveDue, href: '/assets/movement', tone: 'warn' },
      { label: '반납 접수 대기', count: s.assets.filter((a) => a.status === '반납대기').length, href: '/assets/returns', tone: 'warn' },
      { label: '수리 진행 · 완료 확인', count: s.assets.filter((a) => a.status === '수리중').length, href: '/assets/returns', tone: 'warn' },
      { label: '수리 예상 반환 경과 (업체 독촉)', count: s.assets.filter(isRepairOverdue).length, href: '/assets/returns', tone: 'err' },
      { label: '데이터 소거 대기', count: s.disposals.filter((d) => d.status === '소거 대기').length, href: '/assets/disposal', tone: 'err' },
      { label: '분실 · 도난 자산 (회수·폐기 확정)', count: s.assets.filter((a) => a.status === '분실').length, href: '/assets/register', tone: 'err' },
      { label: '대여 반환 연체 (반환 독촉)', count: s.assets.filter(isLoanOverdue).length, href: '/assets/returns', tone: 'err' },
      { label: '대여 반환 임박 (D-7 · 사전 안내)', count: s.assets.filter(isLoanDueSoon).length, href: '/assets/returns', tone: 'warn' },
      { label: '장기 미실측 (재물조사 편성)', count: s.assets.filter((a) => isStaleVerify(a, s.opsPolicy.staleVerifyDays)).length, href: '/inventory/survey-plan', tone: 'warn' },
      { label: '보증 만료 임박 자산 (연장·교체 검토)', count: s.assets.filter((a) => !['폐기완료', '폐기예정'].includes(a.status) && a.warrantyEnd !== '-' && (daysUntil(a.warrantyEnd) ?? 999) <= 90).length, href: '/assets/register?warranty=soon', tone: 'warn' },
      // EOL OS 자산 — OS 지원 종료 경과(미패치 취약점 상시 노출). 하드웨어 노후(보증·내용연수)와 별개인 SW 업그레이드·교체 트리거.
      { label: 'EOL OS 자산 (교체·업그레이드 대상)', count: s.assets.filter((a) => !['폐기완료', '폐기예정'].includes(a.status) && eolOsOf(a.os, today())).length, href: '/assets/register?os=eol', tone: 'err' },
      // SW 라이선스 초과 사용(보유<사용)은 SAM 감사 최우선 노출 리스크 — 계약·라이선스 화면에만 있던 것을 담당자 일과 시작점(대시보드)으로 끌어올린다
      { label: '라이선스 초과 사용 (감사 노출)', count: s.licenses.filter((l) => l.status !== '해지' && l.used > l.purchased).length, href: '/inventory/contracts', tone: 'err' },
      // 대장 정합성 미흡 — 소유자·시리얼·위치 등 핵심 필드 누락·불일치 자산(CMDB 신뢰도 저하). 필드 보정 필요.
      { label: '대장 정합성 미흡 (필드 누락·불일치)', count: s.assets.filter(hasDataIssue).length, href: '/assets/register?dq=1', tone: 'warn' },
    )
  }
  if (['SEC_MGR', 'ADMIN'].includes(session.role)) {
    // 수집 커넥터 지연·오류는 Discovery 수집 사각지대 — 해당 채널이 멎으면 미등록 자산·Shadow SaaS 가 안 잡힌다. 재연동 필요.
    const degradedConn = s.integrations.filter((i) => i.status === '지연' || i.status === '오류')
    // 취약점 우선순위 P1 — 자산 중요도 × 노출도 스코어링(§05)의 즉시 조치 등급. 출처별 큐가 '얼마나'라면 이건 '무엇부터'.
    const p1 = buildVulnPriority().p1
    opsQueues.push(
      { label: '취약점 우선순위 P1 (즉시 조치)', count: p1, href: '/ai/insights', tone: 'err' },
      { label: '유출 · 침해 미조치', count: s.leaks.filter((l) => l.status !== '조치 완료').length, href: '/discovery/external', tone: 'err' },
      { label: '크리덴셜 노출 미조치 (인증 취약점)', count: s.credentials.filter((c) => c.status !== '조치 완료').length, href: '/discovery/external', tone: 'err' },
      { label: 'IOC 상관 미조치 (위협 인텔·침해 징후)', count: s.iocMatches.filter((i) => !i.action).length, href: '/discovery/external', tone: 'err' },
      { label: '외부 노출 미조치', count: s.external.filter((e) => !e.action && e.state !== '등록·일치').length, href: '/discovery/external', tone: 'err' },
      { label: '휴면 계정 미처리 (AD/IdP 계정 위생)', count: s.accounts.filter((a) => !a.action).length, href: '/discovery/found', tone: 'warn' },
      { label: '미인가 SW 미조치 (EDR 정책 위반)', count: s.unauthorizedSw.filter((w) => !w.action).length, href: '/discovery/found', tone: 'err' },
      // Shadow IT 판정 대기 — 카탈로그 검토중 SaaS 는 보안담당 판정(인가/차단)을 기다리는 정책 백로그(§01 보안담당: Shadow IT 판정·SaaS 정책 관리)
      { label: '미판정 SaaS (카탈로그 검토중 · 판정 대기)', count: s.saasCatalog.filter((x) => x.status === '검토중').length, href: '/settings/saas-catalog', tone: 'warn' },
      { label: 'USB 정책 위반 미조치 (이동식 매체 DLP)', count: s.usbFindings.filter((u) => !u.action).length, href: '/discovery/found', tone: 'err' },
      { label: '로컬 VM 위반 미조치 (엔드포인트 가상머신)', count: s.localVms.filter((v) => !v.action).length, href: '/discovery/found', tone: 'warn' },
      { label: '수집 커넥터 지연·오류 (Discovery 저하 · 재연동)', count: degradedConn.length, href: '/platform/integrations', tone: degradedConn.some((i) => i.status === '오류') ? 'err' : 'warn' },
    )
  }
  const opsActive = opsQueues.filter((q) => q.count > 0)

  const expiring = [
    ...s.contracts.filter((c) => c.status !== '해지').map((c) => ({ id: c.id, name: c.name, kind: c.kind === '유지보수' ? '유지보수 계약' : '구매 계약', end: c.end, d: daysUntil(c.end) })),
    ...s.licenses.filter((l) => l.status !== '해지').map((l) => ({ id: l.id, name: l.name, kind: 'SW 라이선스', end: l.expiry, d: daysUntil(l.expiry) })),
  ]
    .filter((x) => x.d !== null && x.d <= s.opsPolicy.expiryWindowDays)
    .sort((a, b) => (a.d ?? 0) - (b.d ?? 0))

  const round = s.inventoryRounds.find((r) => r.status === '진행중')
  const topInsights = s.insights.filter((i) => i.status === '제안').slice(0, 3)
  // 최근 활동 — 감사 로그 최신 6건(관리자·담당자 한정, 감사 로그 접근 권한과 동일). 랜딩에서 변경 상황 훑기.
  const recentAudit = [...s.auditLogs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6)

  return (
    <>
      <ScreenHeader
        kicker="Main · Overview"
        title={`${session.name}님, 현황 요약입니다`}
        desc="자산 현황 · 미등록 자산 신규 발견 · 만료 임박 · My Work"
      />

      <div className="stat-row">
        <Stat value={s.assets.length.toLocaleString()} label="총 등록 자산" delta={{ text: `사용중 ${inUse} · 유휴/반납 ${idle}`, dir: 'flat' }} />
        <Stat value={newFound.length} label="미등록 신규 발견 (Shadow IT)" tone="err" delta={{ text: '소유자 확인·편입 필요', dir: 'up' }} />
        <Stat value={expiring.length} label={`만료 임박 (계약·라이선스 ${s.opsPolicy.expiryWindowDays}일)`} tone="warn"
          delta={{ text: expiring.some((x) => (x.d ?? 0) < 0) ? `만료 ${expiring.filter((x) => (x.d ?? 0) < 0).length}건 포함` : `최단 ${expiring[0]?.d ?? '-'}일`, dir: 'flat' }} />
        <Stat value={pendingApr.length} label="결재 대기" tone={overdueApr > 0 ? 'err' : 'accent'}
          delta={{ text: overdueApr > 0 ? `지연 ${overdueApr}건 (SLA ${s.opsPolicy.approvalSlaDays}일 초과)` : myQueue.length > 0 ? `내 결재 차례 ${myQueue.length}건` : `내 신청 ${myApr.length}건`, dir: overdueApr > 0 ? 'up' : 'flat' }} />
        {round && (
          <Stat
            value={<>{roundProgressPct(round)}<small>%</small></>}
            label={`재물조사 진행률 — ${round.name.replace(' 정기 재물조사', '')}`}
            tone="ok"
            delta={{ text: `${round.scanned.toLocaleString()} / ${round.planned.toLocaleString()} 스캔`, dir: 'flat' }}
          />
        )}
      </div>

      <div className="cols main-side">
        <div className="vstack">
          <Card kicker="Discovery" title="미등록 자산 신규 발견" pad={false}
            actions={<Link className="btn sm" href="/discovery/found">전체 보기</Link>}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>발견 ID</th><th>호스트명</th><th>유형</th><th>채널</th><th>최초 발견</th><th className="c">위험도</th></tr>
                </thead>
                <tbody>
                  {newFound.map((d) => (
                    <tr key={d.id}>
                      <td className="code">{d.id}</td>
                      <td className="strong">{d.hostname}</td>
                      <td>{d.type}</td>
                      <td className="mute">{d.channel}</td>
                      <td className="tnum">{d.firstSeen}</td>
                      <td className="c"><RiskChip risk={d.risk} /></td>
                    </tr>
                  ))}
                  {newFound.length === 0 && <tr><td colSpan={6}><div className="empty">신규 발견 자산이 없습니다</div></td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card kicker="Contracts · Licenses" title="만료 임박" pad={false}
            actions={<Link className="btn sm" href="/inventory/contracts">계약 · 라이선스</Link>}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>구분</th><th>대상</th><th>만료일</th><th className="num">잔여</th><th className="c">상태</th></tr>
                </thead>
                <tbody>
                  {expiring.map((x) => (
                    <tr key={x.id}>
                      <td className="mute">{x.kind}</td>
                      <td className="strong">{x.name}</td>
                      <td className="tnum">{x.end}</td>
                      <td className="num tnum">{x.d !== null && x.d < 0 ? '경과' : `${x.d}일`}</td>
                      <td className="c">
                        {x.d !== null && x.d < 0 ? <Chip tone="err">만료됨</Chip>
                          : x.d !== null && x.d <= 35 ? <Chip tone="err">갱신 시급</Chip>
                          : <Chip tone="warn">갱신 검토</Chip>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="vstack">
          <Card kicker="My Work" title="내 작업"
            actions={myQueue.length > 0 ? <Link className="btn sm pri" href="/workflow/approvals">결재함 {myQueue.length} →</Link> : undefined}>
            <div className="vstack" style={{ gap: 10 }}>
              {unackedNotices.length > 0 && (
                <div className="vstack" style={{ gap: 6 }}>
                  <span className="kicker mute">미확인 필독 공지 — 확인 필요</span>
                  {unackedNotices.map((n) => (
                    <Link key={n.id} href={noticeHref(n.id)} className="hstack"
                      style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Chip tone="err" bare>필독</Chip> {n.title}
                      </span>
                      <Chip tone="err">확인</Chip>
                    </Link>
                  ))}
                </div>
              )}
              {myOwnerConfirms.length > 0 && (
                <div className="vstack" style={{ gap: 6, borderTop: unackedNotices.length > 0 ? '1px solid var(--line)' : undefined, paddingTop: unackedNotices.length > 0 ? 10 : 0 }}>
                  <span className="kicker mute">소유자 확인 요청 — 응답 필요 (우리 부서)</span>
                  {myOwnerConfirms.map((a) => (
                    <Link key={a.id} href={approvalHref(a.id)} className="hstack"
                      style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                      <Chip tone="warn">응답</Chip>
                    </Link>
                  ))}
                </div>
              )}
              {myRejected.length > 0 && (() => {
                const above = unackedNotices.length > 0 || myOwnerConfirms.length > 0
                return (
                  <div className="vstack" style={{ gap: 6, borderTop: above ? '1px solid var(--line)' : undefined, paddingTop: above ? 10 : 0 }}>
                    <span className="kicker mute">반려된 내 신청 — 재상신 검토</span>
                    {myRejected.map((a) => (
                      <Link key={a.id} href={approvalHref(a.id)} className="hstack"
                        style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.title}{a.rejectReason ? <span className="dim" style={{ fontSize: 11 }}> · {a.rejectReason}</span> : ''}
                        </span>
                        <Chip tone="err">재상신</Chip>
                      </Link>
                    ))}
                  </div>
                )
              })()}
              {myQueue.length > 0 && (() => {
                const above = unackedNotices.length > 0 || myOwnerConfirms.length > 0 || myRejected.length > 0
                return (
                <div className="vstack" style={{ gap: 8, borderTop: above ? '1px solid var(--line)' : undefined, paddingTop: above ? 10 : 0 }}>
                  <span className="kicker mute">내 결재 차례 — 지금 처리 대기</span>
                  {myQueue.slice(0, 5).map((a) => (
                    <Link key={a.id} href="/workflow/approvals" className="hstack"
                      style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                      <span className="hstack" style={{ gap: 4, flex: 'none' }}>
                        {isApprovalOverdue(a, today(), s.opsPolicy.approvalSlaDays) && <Chip tone="err" bare>지연</Chip>}
                        <Chip tone="warn">{a.currentStep}</Chip>
                      </span>
                    </Link>
                  ))}
                  {myQueue.length > 5 && <span className="mut" style={{ fontSize: 12 }}>외 {myQueue.length - 5}건 — 결재함에서 전체 처리</span>}
                </div>
                )
              })()}
              <div className="vstack" style={{ gap: 8, borderTop: myQueue.length > 0 ? '1px solid var(--line)' : undefined, paddingTop: myQueue.length > 0 ? 10 : 0 }}>
                <span className="kicker mute">내 신청 — 진행 현황</span>
                {myApr.length > 0 ? myApr.map((a) => (
                  <div key={a.id} className="hstack" style={{ justifyContent: 'space-between' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                    <Chip tone="info">{a.currentStep}</Chip>
                  </div>
                )) : <div className="mut">진행 중인 신청이 없습니다.</div>}
              </div>
              {myLoans.length > 0 && (
                <div className="vstack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <span className="kicker mute">내 대여 자산 — 반환 기한</span>
                  {myLoans.map((l) => {
                    const dd = l.dday
                    const overdue = dd !== null && dd < 0
                    const tone = overdue ? 'err' : dd !== null && dd <= 7 ? 'warn' : 'neutral'
                    const label = dd === null ? '기한 없음' : overdue ? `연체 ${-dd}일` : dd === 0 ? '오늘 만기' : `D-${dd}`
                    return (
                      <Link key={l.assetNo} href={`/assets/register?q=${encodeURIComponent(l.assetNo)}`} className="hstack"
                        style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.model} <span className="dim" style={{ fontSize: 11 }}>· {l.dueDate}까지</span></span>
                        <Chip tone={tone}>{label}</Chip>
                      </Link>
                    )
                  })}
                </div>
              )}
              <div className="hstack" style={{ justifyContent: 'space-between' }}>
                <span className="dim">내 보유 자산</span>
                <Link href="/assets/register">{myAssets.length}대 조회 →</Link>
              </div>
            </div>
          </Card>

          <Card kicker="Board" title="최근 공지"
            actions={<Link className="btn sm ghost" href="/board/notices">공지 · QnA</Link>}>
            <div className="vstack" style={{ gap: 8 }}>
              {recentNotices.length > 0 ? recentNotices.map((n) => (
                <Link key={n.id} href={noticeHref(n.id)} className="hstack"
                  style={{ justifyContent: 'space-between', gap: 10, color: 'inherit', textDecoration: 'none' }}>
                  <span className="hstack" style={{ gap: 6, minWidth: 0 }}>
                    {n.pinned && <Chip tone="err" bare>필독</Chip>}
                    {n.category && <Chip tone="neutral" bare>{n.category}</Chip>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                  </span>
                  <span className="dim tnum" style={{ fontSize: 11, flex: 'none' }}>{(n.publishAt ?? n.createdAt).slice(5, 10)}</span>
                </Link>
              )) : <div className="mut">공개된 공지가 없습니다.</div>}
            </div>
          </Card>

          {session.role !== 'USER' && (
            <Card kicker="Operations" title="운영 대기">
              <div className="vstack" style={{ gap: 8 }}>
                {opsActive.length > 0 ? opsActive.map((q) => (
                  <Link key={q.label} href={q.href} className="hstack"
                    style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                    <span>{q.label}</span>
                    <span className="hstack" style={{ gap: 6 }}><Chip tone={q.tone}>{q.count}</Chip><span className="mut">→</span></span>
                  </Link>
                )) : <div className="mut">처리 대기 중인 운영 작업이 없습니다.</div>}
              </div>
            </Card>
          )}

          {session.role !== 'USER' && (
            <Card kicker="Activity" title="최근 활동"
              actions={<Link className="btn sm ghost" href="/platform/integrations">감사 로그</Link>}>
              <div className="vstack" style={{ gap: 7 }}>
                {recentAudit.length > 0 ? recentAudit.map((a) => (
                  <Link key={a.id} href="/platform/integrations" className="hstack"
                    style={{ justifyContent: 'space-between', gap: 10, color: 'inherit', textDecoration: 'none', alignItems: 'baseline' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      <span className="mut tnum" style={{ fontSize: 11 }}>{a.at.slice(5, 16)}</span> <b style={{ fontSize: 12 }}>{a.actor}</b> <span style={{ fontSize: 12 }}>{a.action}</span>
                    </span>
                    {a.result === '실패' && <Chip tone="err" bare>실패</Chip>}
                  </Link>
                )) : <div className="mut">최근 활동이 없습니다.</div>}
              </div>
            </Card>
          )}

          <Card kicker="AI Intelligence" title="AI 제안 Top 3"
            actions={<Link className="btn sm ghost" href="/ai/insights">전체</Link>}>
            <div className="vstack" style={{ gap: 12 }}>
              {topInsights.map((i) => (
                <div key={i.id}>
                  <div className="hstack" style={{ gap: 6 }}>
                    <RiskChip risk={i.severity} />
                    <span className="kicker mute">{i.kind}</span>
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{i.title}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card kicker="Notice" title="공지 · QnA"
            actions={<Link className="btn sm ghost" href="/board/notices">전체</Link>}>
            <div className="vstack" style={{ gap: 8 }}>
              {s.posts.filter((p) => p.kind === '공지').slice(0, 3).map((n) => (
                <Link key={n.id} href={noticeHref(n.id)} className="hstack"
                  style={{ justifyContent: 'space-between', gap: 12, color: 'inherit', textDecoration: 'none' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.pinned && <Chip tone="err" bare>필독</Chip>} {n.title}
                  </span>
                  <span className="mut tnum" style={{ flex: 'none' }}>{n.createdAt.slice(5)}</span>
                </Link>
              ))}
              {(() => {
                const waiting = s.posts.filter((p) => p.kind === 'QnA' && !p.answer).length
                return waiting > 0 ? (
                  <Link href="/board/qna" className="hstack" style={{ justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                    <span>답변 대기 문의</span><span><b>{waiting}</b>건 →</span>
                  </Link>
                ) : null
              })()}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
