import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { nowStamp } from '@/lib/dates'
import { assetAdapter, isEnabled, withTimeout } from '@/lib/integrations/registry'
import { getStore } from '@/lib/store'

async function acquire(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/finance/asset-reg', 'BIZ_MGR', 'ADMIN')
  // 어댑터 검색 결과에서 채우는 히든 필드지만, 임의 POST 대비 길이 상한(코드·명칭 관례)
  const serial = String(formData.get('serial') ?? '').trim().slice(0, 60)
  const model = String(formData.get('model') ?? '').trim().slice(0, 80)
  const adapter = assetAdapter()
  if (!adapter || !serial) return

  // 폐쇄 루프 — IT포털 → 자산관리시스템 API → 자산등록번호 취득, 이력으로 남는다.
  // 실 어댑터 예외(네트워크·인증)는 취득 실패로 흡수 — 화면 500 없이 재시도 가능.
  try {
    const acq = await withTimeout(adapter.acquireAssetNo(serial), '자산등록번호 취득')
    const s = getStore()
    // 실 어댑터가 계약({assetNo:string})을 어겨 빈 값·비문자열을 반환하면(예: 번호 비동기 발번으로 즉시
    // 미확정), 빈 취득번호가 저장돼 이력에 빈 칸으로 남고 serial 기준 dedup 이 재시도를 영구 차단한다
    // (복구 불가 불일치). 비어있지 않은 문자열 등록번호일 때만 기록해 malformed 응답은 재시도를 남긴다.
    if (acq && typeof acq.assetNo === 'string' && acq.assetNo.length > 0 && !s.assetAcquisitions.some((a) => a.serial === serial)) {
      s.assetAcquisitions.unshift({ serial, model, assetNo: acq.assetNo, by: me.name, at: nowStamp() })
    }
  } catch { /* 자산 API 예외 — 취득 실패, 다음 시도로 */ }
  revalidatePath('/finance/asset-reg')
}

export default async function AssetRegPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireMenu('/finance/asset-reg')
  const { q } = await searchParams
  const query = (q ?? '').trim()
  const s = getStore()

  const on = isEnabled('asset-api')
  const adapter = assetAdapter()
  // 조회 실패(어댑터 예외)는 빈 목록으로 폴백 — 연동 장애가 자산등록 화면을 깨지 않게 한다
  const rawAssets = adapter ? await withTimeout(adapter.searchAssets(query), '자산 조회').catch(() => []) : []
  // .catch 는 reject 만 흡수한다 — 실 고객사 어댑터가 계약(ExternalAsset[])을 어겨 비배열(예: {data:[...]}
  // REST 봉투)·필드 오형을 resolve 하면 assets.filter/.map 이 전 화면 500 을 낸다. 수집 지점에서 형태 검증해
  // 어긋난 행을 걸러 정상 행만 렌더한다. assetNo 도 검증한다 — 아래 {a.assetNo} 직접 렌더가 객체값이면 React
  // 'Objects are not valid as a React child' 로 전 화면 500(옵셔널이라 없거나 문자열만 허용). conformance 동조.
  const assets = (Array.isArray(rawAssets) ? rawAssets : []).filter(
    (a) => a != null && typeof a.serial === 'string' && typeof a.model === 'string' && typeof a.category === 'string' && typeof a.holder === 'string'
      && (a.assetNo == null || typeof a.assetNo === 'string'),
  )
  const unregistered = assets.filter((a) => !a.assetNo)

  return (
    <>
      <ScreenHeader kicker="IT 투자/비용" title="자산등록 (API 연계)"
        desc="자산관리시스템 연계 조회와 신규 자산등록번호 취득" />

      <div className="stat-row">
        <Stat value={on ? '가동중' : '중지'} label="자산관리시스템 채널" tone={on ? undefined : 'err'} />
        <Stat value={assets.length} label="조회 자산" note={query ? `검색: ${query}` : '전체'} />
        <Stat value={unregistered.length} label="미등록 (번호 미취득)" tone={unregistered.length > 0 ? 'warn' : undefined} />
        <Stat value={s.assetAcquisitions.length} label="이번 세션 취득" />
      </div>

      {!on && (
        <div className="callout warn">
          <b>자산관리시스템 채널이 중지 상태입니다</b> — 조회·등록번호 취득이 불가합니다.{' '}
          <Link href="/platform/integrations">연동 · 인프라</Link>에서 채널을 가동하세요.
        </div>
      )}

      <Card title="자산 조회" pad={false}
        actions={
          <form className="hstack" action="/finance/asset-reg">
            <input aria-label="시리얼 · 모델 · 사용자 검색" className="input" name="q" defaultValue={query} placeholder="시리얼 · 모델 · 사용자 검색" style={{ width: 220, height: 26, fontSize: 11.5 }} />
            <button type="submit" className="btn sm">조회</button>
          </form>
        }>
        {!on ? (
          <div className="empty">채널 중지 — 자산관리시스템에 연결할 수 없습니다.</div>
        ) : assets.length === 0 ? (
          <div className="empty">조회 결과가 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>시리얼</th><th>모델</th><th>분류</th><th>사용자·부서</th><th>자산등록번호</th><th className="c">처리</th></tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.serial}>
                    <td className="code">{a.serial}</td>
                    <td className="strong">{a.model}</td>
                    <td><Chip tone="neutral" bare>{a.category}</Chip></td>
                    <td>{a.holder}</td>
                    <td>{a.assetNo ? <span className="mono">{a.assetNo}</span> : <Chip tone="warn" bare>미등록</Chip>}</td>
                    <td className="c">
                      {a.assetNo ? (
                        <span className="mut">-</span>
                      ) : (
                        <form action={acquire} style={{ display: 'inline' }}>
                          <input type="hidden" name="serial" value={a.serial} />
                          <input type="hidden" name="model" value={a.model} />
                          <button type="submit" className="btn sm pri">등록번호 취득</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="자산등록번호 취득 이력" pad={false}>
        {s.assetAcquisitions.length === 0 ? (
          <div className="empty">이번 세션에 취득한 등록번호가 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>일시</th><th>시리얼</th><th>모델</th><th>취득 번호</th><th>처리자</th></tr></thead>
              <tbody>
                {s.assetAcquisitions.map((a) => (
                  <tr key={a.serial}>
                    <td className="tnum">{a.at}</td>
                    <td className="code">{a.serial}</td>
                    <td>{a.model}</td>
                    <td className="mono">{a.assetNo}</td>
                    <td>{a.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
