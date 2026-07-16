import { NextRequest, NextResponse } from 'next/server'
import { getToken } from '@/lib/session'

const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

/** 견적 미리보기 PDF 프록시 (N5b) — {rootCode, slotValues} → 즉석 견적서 PDF. */
export async function POST(req: NextRequest) {
  const token = await getToken()
  const body = await req.text()
  const res = await fetch(`${API_BASE}/cpq/quote-preview.pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body, cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ detail: `HTTP ${res.status}` }, { status: res.status })
  const buf = await res.arrayBuffer()
  return new NextResponse(buf, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="quote-preview.pdf"' },
  })
}
