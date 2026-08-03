'use client'
import { useState, useTransition } from 'react'
import { Card } from '@/components/ui'
import type { ApprovalKind, AssetCategory } from '@/lib/types'
import { ASSET_CATEGORIES } from '@/lib/types'
import { raiseRequest } from './actions'

type Kind = Extract<ApprovalKind, '자산 신청' | '반납' | '이동' | '대여' | 'SaaS 인가'>
const KINDS: { k: Kind; label: string; hint: string }[] = [
  { k: '자산 신청', label: '자산 신청 (신규 지급)', hint: '필요 사유와 용도를 적어 주세요 — 부서장 결재 후 자산담당이 불출합니다.' },
  { k: '대여', label: '대여 (임시 반출)', hint: '대여할 유휴 자산과 반환 기한을 선택하세요 — 승인 즉시 반환 기한과 함께 대여 처리됩니다.' },
  { k: '반납', label: '반납', hint: '반납 승인 후 자산담당이 회수·상태 점검을 거쳐 유휴 재고로 편성합니다.' },
  { k: '이동', label: '이동 (위치 변경)', hint: '이동 승인 후 자산담당이 처리하면 대장 위치와 이력이 갱신됩니다.' },
  { k: 'SaaS 인가', label: 'SaaS 인가 요청 (사전 등재)', hint: '업무상 필요한 SaaS 서비스명을 적어 주세요 — 보안담당 승인 시 인가 카탈로그에 등재됩니다 (공지 참고).' },
]

export function RequestForm(props: {
  /** 신청 가능한 본인 명의 자산 (반납·이동 대상) */
  myAssets: { assetNo: string; model: string; location: string }[]
  /** 대여 가능한 유휴 재고 (대여 신청 대상) */
  loanable: { assetNo: string; model: string; location: string }[]
  locations: string[]
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('자산 신청')
  const [assetNo, setAssetNo] = useState(props.myAssets[0]?.assetNo ?? '')
  const [loanAssetNo, setLoanAssetNo] = useState(props.loanable[0]?.assetNo ?? '')
  const [loanDue, setLoanDue] = useState('')
  const [target, setTarget] = useState(props.locations[0] ?? '')
  const [wantCat, setWantCat] = useState<AssetCategory>('단말')
  const [service, setService] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const meta = KINDS.find((x) => x.k === kind)!
  const needsMyAsset = kind === '반납' || kind === '이동'
  const noMyAssets = needsMyAsset && props.myAssets.length === 0
  const noLoanable = kind === '대여' && props.loanable.length === 0
  const disabled = pending || !note.trim() || noMyAssets || noLoanable || (kind === '대여' && (!loanAssetNo || !loanDue)) || (kind === 'SaaS 인가' && !service.trim())

  const submit = () => {
    startTransition(async () => {
      const r = await raiseRequest({
        kind,
        assetNo: needsMyAsset ? assetNo : kind === '대여' ? loanAssetNo : undefined,
        targetLocation: kind === '이동' ? target : undefined,
        loanDueDate: kind === '대여' ? loanDue : undefined,
        service: kind === 'SaaS 인가' ? service : undefined,
        category: kind === '자산 신청' ? wantCat : undefined,
        note,
      })
      setMsg(r.message)
      if (r.ok) { setNote(''); setLoanDue(''); setService(''); setOpen(false) }
    })
  }

  return (
    <Card
      kicker="Request"
      title="신청 상신"
      actions={
        <button className="btn sm pri" onClick={() => setOpen((o) => !o)} disabled={pending}>
          {open ? '취소' : '신청하기'}
        </button>
      }
    >
      {!open && (
        <p className="dim" style={{ margin: 0, lineHeight: 1.7 }}>
          자산 신규 지급 · 반납 · 이동을 신청합니다. 상신 건은 화면별 기본 결재선을 따라
          결재 대기 목록에 올라가며, 승인 후 자산담당이 실제 불출·이동·회수를 처리합니다.
        </p>
      )}

      {open && (
        <div className="vstack" style={{ gap: 8 }}>
          <div className="hstack" style={{ gap: 8 }}>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {KINDS.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}
            </select>
            {needsMyAsset && (
              <select className="select" style={{ flex: 1 }} value={assetNo}
                onChange={(e) => setAssetNo(e.target.value)} disabled={noMyAssets}>
                {noMyAssets
                  ? <option>신청 가능한 본인 명의 자산이 없습니다</option>
                  : props.myAssets.map((a) => (
                      <option key={a.assetNo} value={a.assetNo}>
                        {a.assetNo} · {a.model} ({a.location})
                      </option>
                    ))}
              </select>
            )}
            {kind === '대여' && (
              <select className="select" style={{ flex: 1 }} value={loanAssetNo}
                onChange={(e) => setLoanAssetNo(e.target.value)} disabled={noLoanable}>
                {noLoanable
                  ? <option>대여 가능한 유휴 재고가 없습니다</option>
                  : props.loanable.map((a) => (
                      <option key={a.assetNo} value={a.assetNo}>
                        {a.assetNo} · {a.model} ({a.location})
                      </option>
                    ))}
              </select>
            )}
            {kind === '자산 신청' && (
              <select className="select" value={wantCat} onChange={(e) => setWantCat(e.target.value as AssetCategory)}
                title="희망 자산 유형 — 불출 시 같은 유형의 유휴 재고를 우선 추천합니다 (재배치 우선 원칙)">
                {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>희망 유형 — {c}</option>)}
              </select>
            )}
            {kind === '이동' && (
              <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                {props.locations.map((l) => <option key={l} value={l}>이동 위치 — {l}</option>)}
              </select>
            )}
            {kind === '대여' && (
              <label className="hstack" style={{ gap: 6, fontSize: 12.5, whiteSpace: 'nowrap' }}>반환 기한
                <input className="input" type="date" value={loanDue} disabled={noLoanable} onChange={(e) => setLoanDue(e.target.value)} />
              </label>
            )}
            {kind === 'SaaS 인가' && (
              <input className="input" style={{ flex: 1 }} placeholder="SaaS 서비스명 (예: Figma, Slack)"
                value={service} onChange={(e) => setService(e.target.value)} />
            )}
          </div>
          <textarea className="input" style={{ height: 78, padding: '8px 10px', resize: 'vertical', lineHeight: 1.6 }}
            placeholder="신청 사유" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="hstack">
            <span className="dim" style={{ fontSize: 11.5 }}>{meta.hint}</span>
            <span className="right" />
            <button className="btn pri" disabled={disabled} onClick={submit}>상신</button>
          </div>
        </div>
      )}

      {msg && <div className="callout" style={{ marginTop: open ? 10 : 12 }}>{msg}</div>}
    </Card>
  )
}
