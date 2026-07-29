'use client'
import { useMemo, useState } from 'react'
import { Chip } from '@/components/ui'
import type { Asset, AssetCategory, AssetStatus } from '@/lib/types'

const CATS: (AssetCategory | '전체')[] = ['전체', '단말', '서버', '네트워크', '주변기기', 'SW', '가상자원']
const STATUS_TONE: Record<AssetStatus, 'ok' | 'warn' | 'err' | 'info' | 'neutral'> = {
  검수중: 'info', 사용중: 'ok', 유휴: 'neutral', 반납대기: 'warn', 폐기예정: 'err', 폐기완료: 'neutral',
}

export function RegisterView(props: { assets: Asset[]; initialQuery: string; canEdit: boolean }) {
  const [q, setQ] = useState(props.initialQuery)
  const [cat, setCat] = useState<AssetCategory | '전체'>('전체')
  const [selNo, setSelNo] = useState<string | null>(null)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return props.assets.filter((a) => {
      if (cat !== '전체' && a.category !== cat) return false
      if (!needle) return true
      return [a.assetNo, a.model, a.owner, a.dept, a.ip, a.serial, a.location]
        .some((f) => f?.toLowerCase().includes(needle))
    })
  }, [props.assets, q, cat])

  const sel = props.assets.find((a) => a.assetNo === selNo) ?? null

  return (
    <div>
      <div className="qbar" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <input className="input" style={{ width: 260 }} placeholder="자산번호 · 모델 · 소유자 · IP 검색"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {CATS.map((c) => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <span className="cnt">{rows.length}건 / 전체 {props.assets.length}건</span>
      </div>

      <div className={sel ? 'cols main-side' : ''} style={sel ? { gap: 0 } : undefined}>
        <div className="tbl-wrap" style={{ maxHeight: 520 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>자산번호</th><th>유형</th><th>모델</th><th>소유자</th><th>부서</th>
                <th>위치</th><th>IP</th><th className="c">상태</th><th>보증 만료</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.assetNo} className={`clickable ${selNo === a.assetNo ? 'sel' : ''}`}
                  onClick={() => setSelNo(selNo === a.assetNo ? null : a.assetNo)}>
                  <td className="code">{a.assetNo}</td>
                  <td>{a.category}</td>
                  <td className="strong">{a.model}</td>
                  <td>{a.owner}</td>
                  <td className="mute">{a.dept}</td>
                  <td className="mute">{a.location}</td>
                  <td className="tnum">{a.ip ?? '-'}</td>
                  <td className="c"><Chip tone={STATUS_TONE[a.status]}>{a.status}</Chip></td>
                  <td className="tnum">{a.warrantyEnd}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9}><div className="empty">조건에 맞는 자산이 없습니다</div></td></tr>}
            </tbody>
          </table>
        </div>

        {sel && (
          <aside style={{ borderLeft: '1px solid var(--line)', padding: 16, maxHeight: 520, overflowY: 'auto' }}>
            <div className="kicker mute">Asset Detail</div>
            <div style={{ fontSize: 15, fontWeight: 800, margin: '4px 0 2px' }}>{sel.model}</div>
            <div className="mono" style={{ color: 'var(--accent-deep)', fontSize: 12 }}>{sel.assetNo}</div>
            {sel.discoveredVia && (
              <div className="callout" style={{ margin: '10px 0 0', padding: '8px 11px' }}>
                Discovery 편입 자산 — 최초 발견 채널: <b>{sel.discoveredVia}</b>
              </div>
            )}
            <dl className="kv" style={{ marginTop: 14 }}>
              <dt>상태</dt><dd><Chip tone={STATUS_TONE[sel.status]}>{sel.status}</Chip></dd>
              <dt>소유자</dt><dd>{sel.owner} · {sel.dept}</dd>
              <dt>위치</dt><dd>{sel.location}</dd>
              <dt>시리얼</dt><dd className="code">{sel.serial}</dd>
              {sel.os && <><dt>OS</dt><dd>{sel.os}</dd></>}
              {sel.cpu && <><dt>CPU</dt><dd>{sel.cpu}</dd></>}
              {sel.memory && <><dt>메모리</dt><dd>{sel.memory}</dd></>}
              {sel.ip && <><dt>IP / MAC</dt><dd className="code">{sel.ip}{sel.mac ? ` · ${sel.mac}` : ''}</dd></>}
              <dt>도입일</dt><dd className="tnum">{sel.purchaseDate}</dd>
              <dt>보증 만료</dt><dd className="tnum">{sel.warrantyEnd}</dd>
              {sel.contractId && <><dt>연계 계약</dt><dd className="code">{sel.contractId}</dd></>}
            </dl>

            <div className="kicker mute" style={{ margin: '18px 0 10px' }}>변경 이력 타임라인</div>
            <div className="tl">
              {[...sel.history].reverse().map((h, i) => (
                <div className="ev" key={i}>
                  <div className="d">{h.date} · {h.actor}</div>
                  <div className="t">{h.kind}</div>
                  <div className="x">{h.detail}</div>
                </div>
              ))}
            </div>

            {props.canEdit && (
              <div className="hstack" style={{ marginTop: 16 }}>
                <button className="btn sm">라벨 발행 (QR)</button>
                <button className="btn sm">이동 처리</button>
                <button className="btn sm danger">폐기 상신</button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
