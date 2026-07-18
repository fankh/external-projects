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

/** U15 인쇄 다이얼로그 (슬라이드 50) — 렌더 PDF 를 숨김 iframe 에 적재 후 브라우저/OS 인쇄 다이얼로그 호출. */
export async function printRenderedPdf(title: string, lines: string[], opts?: RenderOpts): Promise<boolean> {
  try {
    const res = await fetch('/api/render/pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: renderBody(title, lines, opts),
    })
    if (!res.ok) return false
    const url = URL.createObjectURL(await res.blob())
    const frame = document.createElement('iframe')
    frame.style.position = 'fixed'
    frame.style.right = '0'
    frame.style.bottom = '0'
    frame.style.width = '0'
    frame.style.height = '0'
    frame.style.border = '0'
    frame.setAttribute('data-print-frame', '')
    frame.src = url
    document.body.appendChild(frame)
    frame.onload = () => {
      try { frame.contentWindow?.print() } catch { window.open(url, '_blank') }
    }
    // 인쇄 다이얼로그 종료 후 정리 (여유 시간)
    setTimeout(() => { URL.revokeObjectURL(url); frame.remove() }, 120_000)
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
