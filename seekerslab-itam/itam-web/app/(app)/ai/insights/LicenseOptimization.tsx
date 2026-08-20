import Link from 'next/link'
import { Card, Chip, Stat } from '@/components/ui'
import { fmtAmount } from '@/lib/dates'
import { licenseOptimization } from '@/lib/reports'

const VERDICT_TONE = { '초과 사용': 'err', '미사용 보유': 'warn', '만료 경과': 'err', 적정: 'ok' } as const
type Verdict = keyof typeof VERDICT_TONE

/** 라이선스 최적화 — 초과 사용·미사용 회수·만료 경과·중복 SaaS 통합(§05 AI 기능05). 읽기 전용 합성 뷰.
 *  라이선스 컴플라이언스 리포트와 같은 licenseOptimization() 근거를 재사용해 화면·리포트가 어긋나지 않게 한다. */
export function LicenseOptimization({ canManage }: { canManage?: boolean }) {
  const { active, over, under, expired, isExpired, saving, overCost, saasCons } = licenseOptimization()

  const verdictOf = (l: (typeof active)[number]): Verdict =>
    isExpired(l) ? '만료 경과' : l.used > l.purchased ? '초과 사용' : l.used / l.purchased < 0.6 ? '미사용 보유' : '적정'
  const recOf = (l: (typeof active)[number]): string => {
    if (l.used > l.purchased) return `증설 — ${l.used - l.purchased}석 초과 (연 ${fmtAmount((l.used - l.purchased) * l.unitCost)}원)`
    if (l.used / l.purchased < 0.6) return `회수 — ${l.purchased - l.used}석 미사용 (연 ${fmtAmount((l.purchased - l.used) * l.unitCost)}원 절감)`
    if (isExpired(l)) return '갱신 또는 해지 판단 필요'
    return '현행 유지'
  }
  // 조치 필요 순으로 — 초과·만료 먼저, 미사용, 적정 마지막. 그 안에서는 절감/비용 큰 순.
  const ORDER: Record<Verdict, number> = { '초과 사용': 0, '만료 경과': 1, '미사용 보유': 2, 적정: 3 }
  const rows = [...active].sort((a, b) => ORDER[verdictOf(a)] - ORDER[verdictOf(b)] || (b.purchased - b.used) * b.unitCost - (a.purchased - a.used) * a.unitCost)

  return (
    <Card
      kicker="AI Function 05 · License Optimization"
      title="라이선스 최적화 — 회수·증설·통합 근거"
      pad={false}
      actions={<span className="dim" style={{ fontSize: 11.5 }}>사용 패턴 분석 · 활성 {active.length}종</span>}
    >
      <div className="stat-row" style={{ margin: 14 }}>
        <Stat value={over.length} label="초과 사용 — 감사 리스크" tone={over.length ? 'err' : 'ok'} delta={{ text: `추가 구매 시 연 ${fmtAmount(overCost)}원`, dir: 'flat' }} href={canManage && over.length ? '/inventory/contracts?lic=over' : undefined} />
        <Stat value={under.length} label="미사용 회수 후보" tone={under.length ? 'warn' : 'ok'} href={canManage && under.length ? '/inventory/contracts?lic=under' : undefined} />
        <Stat value={`${fmtAmount(saving)}원`} label="회수 시 연간 절감" tone={saving ? 'ok' : undefined} href={canManage && saving ? '/inventory/contracts?lic=under' : undefined} />
        <Stat value={expired.length} label="만료 경과 — 갱신 판단" tone={expired.length ? 'warn' : 'ok'} href={canManage && expired.length ? '/inventory/contracts?lic=expired' : undefined} />
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>라이선스</th><th>공급사</th><th className="num">보유/사용</th><th className="num">사용률</th>
              <th className="c">판정</th><th>권고 조치</th><th className="c">조치</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const v = verdictOf(l)
              return (
                <tr key={l.id}>
                  <td className="strong">{l.name}</td>
                  <td className="mute">{l.vendor}</td>
                  <td className="num tnum">{l.purchased} / {l.used}</td>
                  <td className="num tnum">{Math.round((l.used / l.purchased) * 100)}%</td>
                  <td className="c"><Chip tone={VERDICT_TONE[v]}>{v}</Chip></td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 320 }}>{recOf(l)}</td>
                  <td className="c">
                    {v === '적정' || !canManage
                      ? <span className="mute">-</span>
                      : <Link className="btn sm ghost" href={`/inventory/contracts?sel=${l.id}`} title="계약·라이선스 화면에서 회수·증설·갱신 조치">조치 →</Link>}
                  </td>
                </tr>
              )
            })}
            {active.length === 0 && <tr><td colSpan={7}><div className="empty">활성 라이선스가 없습니다</div></td></tr>}
          </tbody>
        </table>
      </div>

      {saasCons.length > 0 && (
        <div className="callout" style={{ margin: 14 }}>
          <b>중복 기능 SaaS 통합 후보 {saasCons.length}개 분류.</b>{' '}
          {saasCons.map((r) => `${r.category}(${r.services.length}종)`).join(' · ')} — 같은 기능 분류에 2종 이상 서비스가 쓰이고 있습니다.{' '}
          <Link href="/discovery/saas">Shadow SaaS 현황</Link>에서 통합·정리 대상을 확인하세요.
        </div>
      )}
      <div className="callout" style={{ margin: 14 }}>
        <b>사용 패턴 기반 최적화.</b> 보유–사용 대사로 초과 사용(감사 리스크)·미사용 보유(회수 절감)·만료 경과를 가려내고,
        중복 기능 SaaS는 통합 후보로 묶습니다. 같은 근거로 <Link href="/ai/reports">라이선스 컴플라이언스 리포트</Link>가 생성됩니다.
      </div>
    </Card>
  )
}
