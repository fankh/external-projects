'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CadSvg } from '@/components/CadSvg'
import type { CadDocument } from '@/lib/cadTypes'

/** SSR 로 받은 duct DrawingDocument 를 CadSvg 실엔진으로 렌더 + Diffuser 수 URL 파라미터 재생성. */
export function DuctCanvas({ doc, diffusers }: { doc: CadDocument; diffusers: number }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [edit, setEdit] = useState(false)

  const setDiffusers = (n: number) => {
    const q = new URLSearchParams(sp.toString())
    q.set('diffusers', String(n))
    router.push(`/plm/duct?${q.toString()}`)
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="qband" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--title-navy)' }}>Duct 자동 배치 — CAD 실엔진 (SSR)</span>
        <span className="chip ok">Diffuser {diffusers}</span>
        <button type="button" className="b" style={{ height: 18, fontSize: 10 }} onClick={() => setDiffusers(Math.max(1, diffusers - 1))}>−</button>
        <button type="button" className="b" style={{ height: 18, fontSize: 10 }} onClick={() => setDiffusers(Math.min(12, diffusers + 1))}>＋ Diffuser</button>
        <button type="button" className={`b ${edit ? 'pri' : ''}`} style={{ height: 18, fontSize: 10 }} onClick={() => setEdit((e) => !e)}>✎ 편집</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>엔티티 {doc.entities.length}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <CadSvg doc={doc} editable={edit} />
      </div>
    </div>
  )
}
