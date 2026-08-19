import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import type { AuditAction } from '@/lib/audit'
import { requireMenu } from '@/lib/authz'
import { getStore } from '@/lib/store'

// Record<AuditAction> 로 두어 컴파일러가 전 액션의 톤 지정을 강제한다 — 신규 액션이 톤 없이 추가되면
// 빌드 오류로 잡혀 neutral 무차별 색상(v1.5.111 에서 실제 발생) 재발을 구조적으로 막는다. 저장 로그의
// action 은 손상 내성 위해 string 타입이라 아래 호출부는 as 캐스트 + ?? 폴백으로 손상·미지의 값을 방어한다.
const ACTION_TONE: Record<AuditAction, 'ok' | 'err' | 'info' | 'neutral' | 'warn'> = {
  '결재 상신': 'info', '결재 승인': 'ok', '결재 반려': 'err', '결재 회수': 'neutral',
  '결재선 변경': 'warn', '연동 채널 변경': 'warn', '공통코드 변경': 'warn', '서약양식 개정': 'warn', '엑셀양식 변경': 'warn', '게시물 삭제': 'warn', '재택 대상자 변경': 'warn', '점검 기준 변경': 'warn', '인프라 자산 변경': 'warn', '메뉴권한 변경': 'warn', '재무 속보 수정': 'warn', '정산품의 삭제': 'warn',
  '보안위반 등록': 'err', '협력업체 서약 징구': 'neutral', '보안담당자 지정': 'neutral', '보안성 검토 완료': 'ok', '컴플라이언스 스냅샷': 'info',
  '인사정보 동기화': 'info', '배치 수동 실행': 'info', '일배치 이관': 'info', '알림 배치 실행': 'info',
  '위험 등록': 'neutral', '위험 변경': 'warn', '위험 삭제': 'warn', '위험 스냅샷': 'info',
  '정책 등록': 'neutral', '정책 변경': 'warn', '정책 삭제': 'warn',
  '복구계획 등록': 'neutral', '복구계획 변경': 'warn', '복구계획 삭제': 'warn',
}

export default async function AuditPage() {
  await requireMenu('/settings/audit')
  const s = getStore()
  // '결재 상신'(v1.0.6)까지 startsWith 로 세면 상신마다 처리 건수가 부풀므로 승인·반려만 센다
  const decisions = s.auditLogs.filter((l) => l.action === '결재 승인' || l.action === '결재 반려').length
  // 손상 파일이 로그의 action 을 누락·비문자열로 남겨도 .includes 가 500 나지 않게 문자열로 방어
  // (머지 strFields 는 비문자열은 강제하나 누락 undefined 는 옵셔널 보존 위해 두므로 호출부에서 방어)
  // 손상 파일이 로그의 action 을 누락·비문자열로 남겨도 .includes 가 500 나지 않게 문자열로 방어
  // (머지 strFields 는 비문자열은 강제하나 누락 undefined 는 옵셔널 보존 위해 두므로 호출부에서 방어)
  const configs = s.auditLogs.filter((l) => { const a = String(l.action ?? ''); return a.includes('변경') || a.includes('개정') }).length

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
                    <td><Chip tone={ACTION_TONE[l.action as AuditAction] ?? 'neutral'} bare>{l.action}</Chip></td>
                    <td className="dim" style={{ maxWidth: 520, whiteSpace: 'normal' }}>{l.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="callout">
        <b>추적성</b> — 결재 상신·승인·반려, 결재선·연동 채널·공통코드 변경, 서약양식 개정, 배치(수동·알림)·이관
        실행이 기록된다 (제품안내서 §VI). 실서비스에서는 DB 감사 테이블·보존 정책으로 대체된다.
      </div>
    </>
  )
}
