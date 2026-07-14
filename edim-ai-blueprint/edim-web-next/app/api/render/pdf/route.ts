import { NextRequest, NextResponse } from 'next/server'
import { getToken } from '@/lib/session'

const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

/** 범용 PDF 렌더 프록시 — {title, lines, subtitle, confidential} → PDF 바이너리. */
export async function POST(req: NextRequest) {
  const token = await getToken()
  const body = await req.text()
  const res = await fetch(`${API_BASE}/render/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body,
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ detail: `HTTP ${res.status}` }, { status: res.status })
  const buf = await res.arrayBuffer()
  return new NextResponse(buf, {
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/pdf', 'Content-Disposition': 'inline; filename="render.pdf"' },
  })
}
