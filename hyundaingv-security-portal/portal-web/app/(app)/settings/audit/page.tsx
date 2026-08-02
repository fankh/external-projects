import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'

const ACTION_TONE: Record<string, 'ok' | 'err' | 'info' | 'neutral' | 'warn'> = {
  '결재 승인': 'ok', '결재 반려': 'err',
  '결재선 변경': 'warn', '연동 채널 변경': 'warn', '공통코드 변경': 'warn', '서약양식 개정': 'warn',
  '인사정보 동기화': 'info', '배치 수동 실행': 'info', '일배치 이관': 'info',
}

export default async function AuditPage() {
  await requireRole('ADMIN')
  const s = getStore()
  const decisions = s.auditLogs.filter((l) => l.action.startsWith('결재 ')).length
  const configs = s.auditLogs.filter((l) => l.action.includes('변경') || l.action.includes('개정')).length

  return (
    <>
      <ScreenHeader kicker="환경설정" title="감사 이력"
        desc="결재 처리와 권한·설정 변경 등 통제 행위의 추적 기록 — 수정·삭제 없는 append-only 로그다." />

      <div className="stat-row">
        <Stat value={s.auditLogs.length} label="기록" note="최근 500건 보존" />
        <Stat value={decisions} label="결재 처리" />
        <Stat value={configs} label="설정 변경" tone={configs > 0 ? 'warn' : undefined} />
      </div>

      <Card title="이력" kicker="Audit Trail" pad={false}
        actions={<a className="btn sm" href="/api/export?type=audit">엑셀 다운로드</a>}>
        {s.auditLogs.length === 0 ? (
          <div className="empty">기록이 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>일시</th><th>행위자</th><th>행위</th><th>상세</th></tr></thead>
              <tbody>
                {s.auditLogs.map((l, i) => (
                  <tr key={i}>
                    <td className="tnum">{l.at}</td>
                    <td className="strong">{l.actor}</td>
                    <td><Chip tone={ACTION_TONE[l.action] ?? 'neutral'} bare>{l.action}</Chip></td>
                    <td className="dim" style={{ maxWidth: 520, whiteSpace: 'normal' }}>{l.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="callout">
        <b>추적성</b> — 결재 승인·반려, 결재선·연동 채널·공통코드 변경, 서약양식 개정, 배치·이관 실행이
        기록된다 (제품안내서 §VI). 실서비스에서는 DB 감사 테이블·보존 정책으로 대체된다.
      </div>
    </>
  )
}
