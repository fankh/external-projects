'use client'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import type { Asset, AssetCategory, AssetStatus } from '@/lib/types'
import { extendWarranty, recordConfigChange, type ConfigField } from './actions'

/** 조회 필터의 유형 목록 — 공통코드 ASSET_CATEGORY 의 '사용' 여부와 무관하게 전부 노출한다.
 *  미사용 처리는 **신규 입력**에서만 제외하는 규칙이고(환경설정 › 공통코드 안내 참조), 이미 그
 *  유형으로 등록된 자산은 계속 조회돼야 하기 때문이다. 실사 위치 드롭다운처럼 값을 새로
 *  기록하는 입력 항목은 반대로 활성 코드만 읽는다. */
const CATS: (AssetCategory | '전체')[] = ['전체', '단말', '서버', '네트워크', '주변기기', 'SW', '가상자원']
const STATUS_TONE: Record<AssetStatus, 'ok' | 'warn' | 'err' | 'info' | 'neutral'> = {
  검수중: 'info', 사용중: 'ok', 유휴: 'neutral', 반납대기: 'warn', 폐기예정: 'err', 폐기완료: 'neutral',
}

export function RegisterView(props: { assets: Asset[]; initialQuery: string; canEdit: boolean; canConfig: boolean; initialSel?: string }) {
  const [q, setQ] = useState(props.initialQuery)
  const [cat, setCat] = useState<AssetCategory | '전체'>('전체')
  const [selNo, setSelNo] = useState<string | null>(props.initialSel ?? null)
  const [cfgOpen, setCfgOpen] = useState(false)
  const [cfgField, setCfgField] = useState<ConfigField>('memory')
  const [cfgValue, setCfgValue] = useState('')
  const [cfgNote, setCfgNote] = useState('')
  const [cfgMsg, setCfgMsg] = useState<string | null>(null)
  const [wtyOpen, setWtyOpen] = useState(false)
  const [pending, startTransition] = useTransition()

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
        <div className="tbl-wrap fill">
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
          <aside className="side-fill">
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
                <Link className="btn sm" href="/assets/intake">라벨 · 검수</Link>
                <Link className="btn sm" href="/assets/movement">이동 처리</Link>
                <Link className="btn sm danger" href="/assets/disposal">폐기 처리</Link>
              </div>
            )}

            {props.canConfig && (() => {
              const fields: { key: ConfigField; label: string; cur?: string }[] = [
                ...(sel.os !== undefined ? [{ key: 'os' as ConfigField, label: 'OS', cur: sel.os }] : []),
                ...(sel.cpu !== undefined ? [{ key: 'cpu' as ConfigField, label: 'CPU', cur: sel.cpu }] : []),
                ...(sel.memory !== undefined ? [{ key: 'memory' as ConfigField, label: '메모리', cur: sel.memory }] : []),
                { key: '기타', label: '기타', cur: undefined },
              ]
              const openForm = () => {
                const first = fields[0]
                setCfgField(first.key); setCfgValue(first.cur ?? ''); setCfgNote(''); setCfgMsg(null); setCfgOpen(true)
              }
              const pickField = (k: ConfigField) => {
                setCfgField(k); setCfgValue(fields.find((f) => f.key === k)?.cur ?? '')
              }
              const submit = () => {
                startTransition(async () => {
                  const r = await recordConfigChange(sel.assetNo, cfgField, cfgValue, cfgNote)
                  setCfgMsg(r.message)
                  if (r.ok) { setCfgOpen(false); setCfgNote('') }
                })
              }
              return (
                <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  {cfgMsg && <div className="callout" style={{ marginBottom: 10 }}>{cfgMsg}</div>}
                  {!cfgOpen ? (
                    <button className="btn sm" disabled={pending} onClick={openForm}>구성변경 기록</button>
                  ) : (
                    <div className="vstack" style={{ gap: 8 }}>
                      <div className="kicker mute">구성변경 기록</div>
                      <select className="select" value={cfgField} disabled={pending}
                        onChange={(e) => pickField(e.target.value as ConfigField)}>
                        {fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.cur !== undefined ? ` · 현재 ${f.cur}` : ''}</option>)}
                      </select>
                      {cfgField !== '기타' && (
                        <input className="input" placeholder="새 값 (예: 64GB)" value={cfgValue} disabled={pending}
                          onChange={(e) => setCfgValue(e.target.value)} />
                      )}
                      <input className="input" placeholder={cfgField === '기타' ? '변경 내용 (예: SSD 512GB→1TB 교체)' : '사유 (선택)'}
                        value={cfgNote} disabled={pending} onChange={(e) => setCfgNote(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
                      <div className="hstack">
                        <button className="btn sm pri" disabled={pending} onClick={submit}>기록</button>
                        <button className="btn sm ghost" disabled={pending} onClick={() => { setCfgOpen(false); setCfgMsg(null) }}>취소</button>
                      </div>
                    </div>
                  )}
                  {sel.warrantyEnd !== '-' && (
                    <div style={{ marginTop: 10 }}>
                      {!wtyOpen ? (
                        <button className="btn sm" disabled={pending}
                          onClick={() => { setWtyOpen(true); setCfgMsg(null); setCfgOpen(false) }}
                          title="보증 만료일 연장 (1·2·3년)">보증 연장</button>
                      ) : (
                        <div className="vstack" style={{ gap: 8 }}>
                          <div className="kicker mute">보증 연장 · 현재 만료 {sel.warrantyEnd}</div>
                          <div className="hstack">
                            {[1, 2, 3].map((y) => (
                              <button key={y} className="btn sm pri" disabled={pending}
                                onClick={() => startTransition(async () => {
                                  const r = await extendWarranty(sel.assetNo, y)
                                  setCfgMsg(r.message); setWtyOpen(false)
                                })}>{y}년</button>
                            ))}
                            <button className="btn sm ghost" disabled={pending} onClick={() => setWtyOpen(false)}>취소</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </aside>
        )}
      </div>
    </div>
  )
}
