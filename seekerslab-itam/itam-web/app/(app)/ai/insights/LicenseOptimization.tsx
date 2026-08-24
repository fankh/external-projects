import Link from 'next/link'
import { Card, Chip, Stat } from '@/components/ui'
import { ratioPct, fmtAmount } from '@/lib/dates'
import { licenseOptimization, licenseVerdict } from '@/lib/reports'



/** 라이선스 최적화 — 초과 사용·미사용 회수·만료 경과·중복 SaaS 통합(§05 AI 기능05). 읽기 전용 합성 뷰.
 *  라이선스 컴플라이언스 리포트와 같은 licenseOptimization() 근거를 재사용해 화면·리포트가 어긋나지 않게 한다. */
export function LicenseOptimization({ canManage }: { canManage?: boolean }) {
  const { active, over, under, expired, saving, overCost, saasCons } = licenseOptimization()

  // 판정은 lib/reports licenseVerdict 단일 소스 — 컴플라이언스 리포트 표와 같은 라벨을 쓴다.
  //  만료가 사용률 판정을 덮어쓰지 않는다: 만료됐는데 초과 사용 중인 건(시드 JetBrains)은 '만료·초과 사용'.
  //  그전엔 만료가 우선해 '초과 사용 N건' 스탯은 세는데 그렇게 라벨된 행이 표에 하나도 없었고(스탯 1 vs 행 0),
  //  같은 행의 권고 조치만 '증설 — N석 초과'라고 말해 두 컬럼이 서로 다른 판정을 보여줬다.
  const toneOf = (l: (typeof active)[number]): 'err' | 'warn' | 'ok' => {
    const v = licenseVerdict(l)
    return v.base === '초과 사용' || v.expired ? 'err' : v.base === '미사용 보유' ? 'warn' : 'ok'
  }
  const recOf = (l: (typeof active)[number]): string => {
    const v = licenseVerdict(l)
    const renew = v.expired ? ' · 만료 경과 — 갱신·해지 먼저 판단' : ''
    if (v.base === '초과 사용') return `증설 — ${l.used - l.purchased}석 초과 (연 ${fmtAmount((l.used - l.purchased) * l.unitCost)}원)${renew}`
    if (v.base === '미사용 보유') return `회수 — ${l.purchased - l.used}석 미사용 (연 ${fmtAmount((l.purchased - l.used) * l.unitCost)}원 절감)${renew}`
    if (v.expired) return '갱신 또는 해지 판단 필요'
    return '현행 유지'
  }
  // 조치 시급 순 — 초과(감사 리스크) → 만료 → 미사용 → 적정. 그 안에서는 절감/비용 큰 순.
  const rows = [...active].sort((a, b) => licenseVerdict(a).rank - licenseVerdict(b).rank || (b.purchased - b.used) * b.unitCost - (a.purchased - a.used) * a.unitCost)

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
              const v = licenseVerdict(l)
              return (
                <tr key={l.id}>
                  <td className="strong">{l.name}</td>
                  <td className="mute">{l.vendor}</td>
                  <td className="num tnum">{l.purchased} / {l.used}</td>
                  <td className="num tnum">{ratioPct(l.used, l.purchased)}%</td>
                  <td className="c"><Chip tone={toneOf(l)}>{v.label}</Chip></td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 320 }}>{recOf(l)}</td>
                  <td className="c">
                    {(v.base === '적정' && !v.expired) || !canManage
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
