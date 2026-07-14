'use client'

/** 범용 PDF 렌더 → 새 창. 실패 시 false. */
export async function openRenderedPdf(title: string, lines: string[], opts?: { subtitle?: string; confidential?: boolean }): Promise<boolean> {
  try {
    const res = await fetch('/api/render/pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, lines, subtitle: opts?.subtitle ?? '', confidential: opts?.confidential ?? false }),
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
