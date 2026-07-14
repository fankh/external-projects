import { NextRequest, NextResponse } from 'next/server'
import { getToken } from '@/lib/session'

const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

/** 견적서 PDF 프록시 — 인증 fetch → 바이너리 스트림 (새 창 미리보기). */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ detail: 'id required' }, { status: 400 })
  const token = await getToken()
  const res = await fetch(`${API_BASE}/cost/quotations/${id}/render.pdf`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ detail: `HTTP ${res.status}` }, { status: res.status })
  const buf = await res.arrayBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/pdf',
      'Content-Disposition': `inline; filename="quotation-${id}.pdf"`,
    },
  })
}
