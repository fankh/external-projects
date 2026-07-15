import { NextRequest, NextResponse } from 'next/server'
import { getToken } from '@/lib/session'

const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

/** QC 성적서 PDF 프록시 (N3b) — ?refNo=&item=&result= → /qc/certificate.pdf (쿠키 토큰 → Bearer). */
export async function GET(req: NextRequest) {
  const token = await getToken()
  const qs = req.nextUrl.searchParams.toString()
  const res = await fetch(`${API_BASE}/qc/certificate.pdf${qs ? `?${qs}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ detail: `HTTP ${res.status}` }, { status: res.status })
  const buf = await res.arrayBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/pdf',
      'Content-Disposition': 'inline; filename="qc-certificate.pdf"',
    },
  })
}
