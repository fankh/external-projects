import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { daysUntil } from '@/lib/dates'
import { CredTable } from './CredTable'
import { ExposedTable } from './ExposedTable'
import { IocTable } from './IocTable'
import { LeakTable } from './LeakTable'
import { RescanConsole } from './RescanConsole'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** 수동 외부 수집 — 대상에 흔적을 남기지 않는 무접촉 방식 (제품안내서 §04) */
const PASSIVE = [
  { m: '인증서 투명성 (CT)', tech: '공개 CT 로그에서 발급 인증서의 호스트명·메타데이터 수집 (대상 무접촉). 와일드카드 제거·중복 제거·유효성 검증', out: '서브도메인, 인증서 항목(발급 CA·유효기간). 유효기간으로 생존 여부 추정' },
  { m: '웹 아카이브', tech: '인터넷 아카이브에서 과거 관측된 호스트명·URL 조회 (수집 연한 지정)', out: '과거 노출 서브도메인 (생존 확인 전까지 비활성 표기)' },
  { m: '검색엔진 도킹', tech: '검색엔진 결과에 도크 질의(site:·inurl: 등) 후 서브도메인 정규식 추출. User-Agent 로테이션·프록시·백오프 재시도', out: '공개 색인된 서브도메인' },
  { m: 'DNS 인텔리전스', tech: '외부 DNS 인텔리전스 서비스에서 알려진 서브도메인·레코드 조회', out: '서브도메인 · DNS 레코드' },
]

/** DNS 기반 능동 탐지 — 다수 공개 리졸버 풀을 라운드로빈하는 대량 병렬 질의 */
const ACTIVE = [
  { m: '서브도메인 브루트포스', tech: '사전 기반 서브도메인 추정(사용자 사전 → 관리 사전 → 기본 사전). 대량 모드는 지역·기술·숫자·다단계 변형으로 최대 수만 건 확장' },
  { m: '순열 생성', tech: '알려진 서브도메인에 환경(dev/stg/prod)·접두·접미·숫자·구분자·키워드를 조합 후 실시간 해석' },
  { m: '역DNS · CIDR 스캔', tech: 'IP의 PTR 호스트명 조회, IP 대역 전체 열거 후 알려진 도메인 교차 확인 및 동시 PTR 조회' },
  { m: '존 트랜스퍼 · 레코드 분석', tech: '네임서버 확인 후 AXFR 시도, 거부 시 A/AAAA/CNAME/MX/NS/TXT/SRV/SOA/CAA 질의로 대체. 레코드 값에 포함된 범위 내 호스트명 추출. 와일드카드 DNS 탐지로 오탐 억제' },
]

export default async function ExternalPage() {
  const session = await requireRole('ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const s = getStore()
  // 유출 대응은 보안 업무 — 보안담당·Admin 만 조치 가능
  const canRespond = ['SEC_MGR', 'ADMIN'].includes(session.role)
  // 다음 재탐지 기한 — 마지막 실행 + 주기. 지나면 기한 경과로 표시해 스케줄러 지연을 드러낸다
  const targets = s.easmTargets.map((t) => {
    if (!t.lastRunAt) return { ...t, dueIn: null }
    const due = new Date(new Date(t.lastRunAt).getTime() + t.intervalDays * 86_400_000).toISOString().slice(0, 10)
    return { ...t, dueIn: daysUntil(due) }
  })
  const ext = s.external
  const unreg = ext.filter((e) => e.state === '미등록')
  const withCve = ext.filter((e) => e.cve)
  const credOpen = s.credentials.filter((c) => c.status !== '조치 완료').length
  const iocOpen = s.iocMatches.filter((i) => !i.action).length

  return (
    <>
      <ScreenHeader
        kicker="Discovery · External Attack Surface"
        title="외부 공격표면 탐지"
        desc="조직 밖으로 노출된 미인지 자산 — 잊힌 서브도메인 · 방치된 서버 · 노출된 관리 콘솔 · 유출 계정"
      />

      <div className="stat-row">
        <Stat value={ext.length} label="외부 노출 자산 (지문 통합 후)" />
        <Stat value={unreg.length} label="미등록 — 대장에 없음" tone="err" />
        <Stat value={withCve.length} label="CVE 확인 자산" tone="warn" delta={{ text: `최고 CVSS ${Math.max(...withCve.map((e) => e.cvss ?? 0)).toFixed(1)}`, dir: 'up' }} />
        <Stat value={credOpen} label="크리덴셜 노출 — 미조치" tone={credOpen ? 'err' : 'ok'} />
        <Stat value={iocOpen} label="IOC 상관 — 미조치" tone={iocOpen ? 'err' : 'ok'} delta={{ text: '위협 행위자 귀속', dir: 'flat' }} />
        <Stat value={s.leaks.length} label="유출 · 침해 수집 건" tone="warn" />
      </div>

      <RescanConsole targets={targets} />

      <Card kicker="Re-discovery History" title={`재탐지 이력 ${s.easmRuns.length}회차`} pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>회차</th><th>시작</th><th>종료</th><th>도메인</th><th className="c">방식</th><th className="num">후보</th><th className="num">생존 확인</th><th className="num">신규 노출</th><th>실행</th></tr>
            </thead>
            <tbody>
              {s.easmRuns.map((r) => (
                <tr key={r.id}>
                  <td className="code">{r.id}</td>
                  <td className="tnum">{r.startedAt}</td>
                  <td className="tnum">{r.finishedAt ?? <span className="dim">진행 중</span>}</td>
                  <td>{r.domains.join(', ')}</td>
                  <td className="c"><Chip tone={r.mode === 'Passive' ? 'neutral' : 'info'}>{r.mode}</Chip></td>
                  <td className="num tnum">{r.candidates}</td>
                  <td className="num tnum">{r.confirmed}</td>
                  <td className="num tnum" style={r.newFound ? { color: 'var(--err)', fontWeight: 700 } : undefined}>{r.newFound}</td>
                  <td>{r.by}{r.note && <div className="dim" style={{ fontSize: 11 }}>{r.note}</div>}</td>
                </tr>
              ))}
              {s.easmRuns.length === 0 && <tr><td colSpan={9}><div className="empty">재탐지 이력이 없습니다</div></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="callout">
        <b>수동 우선, 능동 확인.</b> 대상에 흔적을 남기지 않는 수동 수집으로 자산 후보를 넓게 확보한 뒤,
        브루트포스·순열·존 트랜스퍼로 실제 생존 여부를 확인합니다. 능동 스캔은 대상·강도·시간대 정책 협의 후 수행합니다.
      </div>

      <div className="cols c2">
        <Card kicker="Passive Collection" title="수동 외부 수집 — 대상 무접촉" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>방법</th><th>기법</th><th>데이터 소스 · 산출</th></tr></thead>
              <tbody>
                {PASSIVE.map((p) => (
                  <tr key={p.m}>
                    <td className="strong">{p.m}</td>
                    <td className="dim" style={{ whiteSpace: 'normal', maxWidth: 300 }}>{p.tech}</td>
                    <td className="mute" style={{ whiteSpace: 'normal', maxWidth: 220 }}>{p.out}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card kicker="Active DNS" title="DNS 기반 능동 탐지" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>방법</th><th>기법 · 산출</th></tr></thead>
              <tbody>
                {ACTIVE.map((a) => (
                  <tr key={a.m}>
                    <td className="strong">{a.m}</td>
                    <td className="dim" style={{ whiteSpace: 'normal', maxWidth: 460 }}>{a.tech}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="callout" style={{ margin: 14 }}>
            <b>2단계 스캔.</b> 고속 오픈 포트 스윕 → 서비스·버전 정밀 분석. 서비스·제품·버전 핑거프린트와
            취약점 스크립트로 CVE·CVSS·심각도를 추출하고, 오픈 확인된 포트에 한해 기본·취약 크리덴셜을 점검합니다.
          </div>
        </Card>
      </div>

      <Card kicker="Exposed Assets" title="외부 노출 자산" pad={false}>
        <ExposedTable externals={ext} canAct={canRespond} />
      </Card>

      <Card kicker="Credential Exposure" title="인증 취약점 점검 — 기본·취약 크리덴셜 노출" pad={false}>
        <CredTable credentials={s.credentials} canRespond={canRespond} />
      </Card>

      <Card kicker="Threat Intel · IOC Correlation" title="위협 인텔리전스 — IOC 상관·행위자 귀속" pad={false}>
        <IocTable iocs={s.iocMatches} canRespond={canRespond} />
      </Card>

      <Card kicker="Threat Intel · Dark Web" title="위협 인텔리전스 · 유출 수집" pad={false}>
        <LeakTable leaks={s.leaks} canRespond={canRespond} />
      </Card>
    </>
  )
}
