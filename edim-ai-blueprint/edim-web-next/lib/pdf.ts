'use client'

/** U6 출력 옵션 (슬라이드 50) — 용지·방향·여백·글꼴·색상·바닥글. */
export interface RenderOpts {
  subtitle?: string
  confidential?: boolean
  paper?: 'A4' | 'A3' | 'LETTER'
  landscapeMode?: boolean
  marginMm?: number
  fontPt?: number
  grayscale?: boolean
  footerText?: string
}

function renderBody(title: string, lines: string[], opts?: RenderOpts): string {
  return JSON.stringify({
    title, lines, subtitle: opts?.subtitle ?? '', confidential: opts?.confidential ?? false,
    paper: opts?.paper ?? 'A4', landscapeMode: opts?.landscapeMode ?? false,
    marginMm: opts?.marginMm ?? 17.6, fontPt: opts?.fontPt ?? 9.5,
    grayscale: opts?.grayscale ?? false, footerText: opts?.footerText ?? '',
  })
}

/** 범용 PDF 렌더 → 새 창. 실패 시 false. */
export async function openRenderedPdf(title: string, lines: string[], opts?: RenderOpts): Promise<boolean> {
  try {
    const res = await fetch('/api/render/pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: renderBody(title, lines, opts),
    })
    if (!res.ok) return false
    const url = URL.createObjectURL(await res.blob())
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return true
  } catch {
    return false
  }
}

/** Office(xlsx) 내보내기 (U6) — 렌더 라인을 xlsx 다운로드. 실패 시 false. */
export async function downloadRenderedXlsx(title: string, lines: string[], opts?: RenderOpts): Promise<boolean> {
  try {
    const res = await fetch('/api/render/xlsx', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: renderBody(title, lines, opts),
    })
    if (!res.ok) return false
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = 'edim-print.xlsx'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return true
  } catch {
    return false
  }
}
